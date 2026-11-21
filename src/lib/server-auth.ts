import { NextRequest } from 'next/server';

interface AuthVerificationResult {
  isValid: boolean;
  user?: {
    uid: string;
    email?: string;
  };
  error?: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

// 메모리 기반 슬라이딩 윈도우 요청 제한 저장소
interface RateRecord {
  timestamps: number[];
}
const rateLimitStore = new Map<string, RateRecord>();

// 주기적 만료 레코드 정리 (10분마다)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    rateLimitStore.forEach((record, key) => {
      record.timestamps = record.timestamps.filter(t => now - t < 1000 * 60 * 5);
      if (record.timestamps.length === 0) {
        rateLimitStore.delete(key);
      }
    });
  }, 1000 * 60 * 10);
}

/**
 * 클라이언트 IP 추출 함수
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}

/**
 * Firebase ID 토큰 검증 함수 (서버리스 및 Vercel 환경 최적화)
 * 별도 서비스 계정 키 파일 없이 Google Identity Toolkit REST API를 활용하여 100% 암호학적으로 검증합니다.
 */
export async function verifyFirebaseToken(req: NextRequest): Promise<AuthVerificationResult> {
  const authHeader = req.headers.get('authorization') || req.headers.get('x-firebase-token');
  if (!authHeader) {
    return { isValid: false, error: '인증 토큰(Authorization 헤더)이 제공되지 않았습니다.' };
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  if (!token) {
    return { isValid: false, error: '유효한 Bearer 토큰 형식이 아닙니다.' };
  }

  const firebaseApiKey =
    process.env.VITE_FIREBASE_API_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!firebaseApiKey) {
    // Firebase API 키가 서버에 없는 경우
    return { isValid: false, error: '서버에 Firebase 설정(API_KEY)이 없습니다.' };
  }

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      }
    );

    const data = await res.json();
    if (data.users && data.users.length > 0) {
      const u = data.users[0];
      return {
        isValid: true,
        user: {
          uid: u.localId,
          email: u.email,
        },
      };
    }

    const errorMessage = data.error?.message || '인증되지 않은 사용자입니다.';
    return { isValid: false, error: errorMessage };
  } catch (err: any) {
    return { isValid: false, error: 'Firebase 인증 서버와의 통신 중 오류가 발생했습니다.' };
  }
}

/**
 * 요청 제한(Rate Limiting) 검사
 * - 비인가 익명 사용자: 2분당 12회 (분당 6회 꼴로 AI 남용 방지)
 * - 로그인된 인증 사용자/관리자: 2분당 60회
 */
export function checkRateLimit(key: string, isAuthenticated: boolean): RateLimitResult {
  const now = Date.now();
  const windowMs = 2 * 60 * 1000; // 2분 윈도우
  const maxRequests = isAuthenticated ? 60 : 12;

  let record = rateLimitStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    rateLimitStore.set(key, record);
  }

  // 윈도우 범위 밖의 타임스탬프 필터링
  record.timestamps = record.timestamps.filter(t => now - t < windowMs);

  if (record.timestamps.length >= maxRequests) {
    const oldest = record.timestamps[0];
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(retryAfter, 1),
    };
  }

  record.timestamps.push(now);
  return {
    allowed: true,
    remaining: maxRequests - record.timestamps.length,
    retryAfterSeconds: 0,
  };
}

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getAuth, Auth } from 'firebase/auth';

/**
 * 1. Firebase 환경변수 안전 추출 함수:
 * - Next.js Webpack 번들러의 정적 빌드 인라인(process.env.VITE_* 및 process.env.NEXT_PUBLIC_*)
 * - Vite 및 모던 ESM 브라우저 런타임 호환(import.meta.env.*)
 */
function readEnvVar(
  processVite: string | undefined,
  processNext: string | undefined,
  keySuffix: string
): string {
  // 1) process.env 직접 접근 (Next.js 빌드 시 클라이언트에 정적 치환됨)
  if (processVite && processVite.trim() !== '') return processVite.trim();
  if (processNext && processNext.trim() !== '') return processNext.trim();

  // 2) import.meta.env 접근 (Vite 및 ESM 환경 호환 - Webpack 경고 없이 안전 평가)
  try {
    const getMetaEnv = new Function("try { return import.meta.env; } catch(e) { return undefined; }");
    const metaEnv = getMetaEnv();
    if (metaEnv) {
      const viteKey = `VITE_FIREBASE_${keySuffix}`;
      const nextKey = `NEXT_PUBLIC_FIREBASE_${keySuffix}`;
      if (metaEnv[viteKey] && String(metaEnv[viteKey]).trim() !== '') {
        return String(metaEnv[viteKey]).trim();
      }
      if (metaEnv[nextKey] && String(metaEnv[nextKey]).trim() !== '') {
        return String(metaEnv[nextKey]).trim();
      }
    }
  } catch {}

  return '';
}

// Firebase 설정값 매핑 (VITE_FIREBASE_* 및 NEXT_PUBLIC_FIREBASE_* 양방향 완벽 호환)
export const firebaseConfig = {
  apiKey: readEnvVar(process.env.VITE_FIREBASE_API_KEY, process.env.NEXT_PUBLIC_FIREBASE_API_KEY, 'API_KEY'),
  authDomain: readEnvVar(process.env.VITE_FIREBASE_AUTH_DOMAIN, process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, 'AUTH_DOMAIN'),
  projectId: readEnvVar(process.env.VITE_FIREBASE_PROJECT_ID, process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, 'PROJECT_ID'),
  storageBucket: readEnvVar(process.env.VITE_FIREBASE_STORAGE_BUCKET, process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, 'STORAGE_BUCKET'),
  messagingSenderId: readEnvVar(process.env.VITE_FIREBASE_MESSAGING_SENDER_ID, process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, 'MESSAGING_SENDER_ID'),
  appId: readEnvVar(process.env.VITE_FIREBASE_APP_ID, process.env.NEXT_PUBLIC_FIREBASE_APP_ID, 'APP_ID'),
  measurementId: readEnvVar(process.env.VITE_FIREBASE_MEASUREMENT_ID, process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, 'MEASUREMENT_ID'),
};

/**
 * 2. 누락된 환경변수 진단 함수:
 * - 운영/로컬 환경에서 실제로 누락된 변수 이름만 배열로 반환
 * - [중요] 보안을 위해 API 키 등의 실제 '값'은 절대 로그나 결과에 포함하지 않음
 */
export function getMissingFirebaseEnvVars(): string[] {
  const checkItems = [
    { name: 'VITE_FIREBASE_API_KEY', val: firebaseConfig.apiKey },
    { name: 'VITE_FIREBASE_AUTH_DOMAIN', val: firebaseConfig.authDomain },
    { name: 'VITE_FIREBASE_PROJECT_ID', val: firebaseConfig.projectId },
    { name: 'VITE_FIREBASE_STORAGE_BUCKET', val: firebaseConfig.storageBucket },
    { name: 'VITE_FIREBASE_MESSAGING_SENDER_ID', val: firebaseConfig.messagingSenderId },
    { name: 'VITE_FIREBASE_APP_ID', val: firebaseConfig.appId },
  ];

  const missingList: string[] = [];

  for (const item of checkItems) {
    if (!item.val || item.val.trim() === '' || item.val.includes('your_') || item.val.includes('AIzaSy...')) {
      missingList.push(item.name);
    }
  }

  return missingList;
}

/**
 * 3. 유효한 Firebase 설정이 입력되었는지 확인하는 헬퍼 함수
 */
export function isFirebaseConfigured(): boolean {
  const missing = getMissingFirebaseEnvVars();
  // 최소 필수 인자: API_KEY, PROJECT_ID
  const hasEssentials = Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    !firebaseConfig.apiKey.includes('your_') &&
    !firebaseConfig.apiKey.includes('AIzaSy...')
  );

  return hasEssentials && !missing.includes('VITE_FIREBASE_API_KEY') && !missing.includes('VITE_FIREBASE_PROJECT_ID');
}

// Firebase 앱 싱글톤 초기화
let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let auth: Auth | null = null;

if (typeof window !== 'undefined' || isFirebaseConfigured()) {
  try {
    if (isFirebaseConfigured()) {
      app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      db = getFirestore(app);
      storage = getStorage(app);
      auth = getAuth(app);
    } else {
      const missing = getMissingFirebaseEnvVars();
      if (typeof window !== 'undefined' && missing.length > 0) {
        // 보안상 변수 이름만 출력하고 값은 출력하지 않음
        console.warn(`[Firebase 설정 진단] 누락된 환경변수 목록: ${missing.join(', ')}`);
      }
    }
  } catch (error) {
    console.warn('Firebase 초기화 중 경고 (설정값 미입력 시 로컬 모드로 동작합니다):', error);
  }
}

export { app, db, storage, auth };

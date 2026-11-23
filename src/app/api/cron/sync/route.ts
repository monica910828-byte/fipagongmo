import { NextRequest, NextResponse } from 'next/server';
import { syncAllBoards } from '@/lib/scraper';
import { isFirebaseConfigured } from '@/lib/firebase';
import { getLatestSyncLogFromFirestore } from '@/lib/firestore-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 동일 시간대 이중 트리거(Vercel Cron + GitHub Actions) 중복 실행 방지용 쿨다운 (15분)
const COOLDOWN_MS = 15 * 60 * 1000;
let lastMemorySyncAt = 0;

function formatKstNow(): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

function isAuthorizedCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env['CRON_SECRET']?.trim();
  if (!cronSecret) {
    // CRON_SECRET 미설정 시 Vercel Cron / GitHub Actions 호출 허용 (쿨다운으로 남용 방지)
    return true;
  }

  const authHeader = req.headers.get('authorization');
  const customHeader = req.headers.get('x-cron-secret');
  return authHeader === `Bearer ${cronSecret}` || customHeader === cronSecret;
}

async function handleScheduledSync(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized cron request' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { searchParams } = new URL(req.url);
  const slot = searchParams.get('slot') || 'manual';
  const force = searchParams.get('force') === 'true';
  const limitParam = parseInt(searchParams.get('limit') || '5', 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 10) : 5;

  const isVercelCron = Boolean(req.headers.get('x-vercel-cron'));
  const triggerSource = isVercelCron
    ? `VERCEL_CRON_${slot}`
    : searchParams.get('source') || `SCHEDULED_${slot}`;

  // 중복 실행 방지 (force=true가 아닐 때 15분 이내 이미 성공한 동기화가 있으면 안전 스킵)
  if (!force) {
    const now = Date.now();
    if (now - lastMemorySyncAt < COOLDOWN_MS) {
      return NextResponse.json(
        {
          success: true,
          skipped: true,
          reason: 'RECENTLY_SYNCED_MEMORY',
          executedAtKST: formatKstNow(),
          triggerSource,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (isFirebaseConfigured()) {
      try {
        const latestLog = await getLatestSyncLogFromFirestore();
        if (latestLog?.status === 'SUCCESS' && latestLog?.completedAt) {
          const completedMs = new Date(latestLog.completedAt).getTime();
          if (Number.isFinite(completedMs) && now - completedMs < COOLDOWN_MS) {
            lastMemorySyncAt = completedMs;
            return NextResponse.json(
              {
                success: true,
                skipped: true,
                reason: 'RECENTLY_SYNCED_FIRESTORE',
                lastCompletedAt: latestLog.completedAt,
                executedAtKST: formatKstNow(),
                triggerSource,
              },
              { headers: { 'Cache-Control': 'no-store' } }
            );
          }
        }
      } catch {}
    }
  }

  try {
    console.info('[API /api/cron/sync] Scheduled FiPA auto-sync started:', {
      slot,
      triggerSource,
      limit,
      executedAtKST: formatKstNow(),
    });

    const result = await syncAllBoards(limit, triggerSource);
    lastMemorySyncAt = Date.now();

    console.info('[API /api/cron/sync] Scheduled FiPA auto-sync finished:', {
      slot,
      triggerSource,
      totalFound: result.totalFound,
      totalNew: result.totalNew,
      totalUpdated: result.totalUpdated,
      totalFailed: result.totalFailed,
      totalFirestoreSaved: result.totalFirestoreSaved,
    });

    return NextResponse.json(
      {
        success: true,
        skipped: false,
        slot,
        triggerSource,
        scheduleKST: ['09:00', '15:00'],
        executedAtKST: formatKstNow(),
        result,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: any) {
    console.error('[API /api/cron/sync] Sync failed:', error?.message);
    return NextResponse.json(
      {
        success: false,
        slot,
        triggerSource,
        executedAtKST: formatKstNow(),
        error: error?.message || '자동 동기화 실행 중 오류가 발생했습니다.',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleScheduledSync(req);
}

export async function POST(req: NextRequest) {
  return handleScheduledSync(req);
}

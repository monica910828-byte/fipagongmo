import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { syncAllBoards, TARGET_BOARDS } from '@/lib/scraper';
import { isFirebaseConfigured } from '@/lib/firebase';
import { getFirestorePosts, getLatestSyncLogFromFirestore } from '@/lib/firestore-service';
import { FALLBACK_POSTS } from '@/lib/fallback-posts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    let lastLog: any = null;
    let allPosts: any[] = [];

    if (isFirebaseConfigured()) {
      try {
        lastLog = await getLatestSyncLogFromFirestore();
        allPosts = await getFirestorePosts({ forAdmin: true });
      } catch {}
    }

    if (!lastLog) {
      try {
        lastLog = await prisma.syncLog.findFirst({
          orderBy: { startedAt: 'desc' },
        });
      } catch {}
    }

    if (allPosts.length === 0) {
      try {
        allPosts = await prisma.post.findMany();
      } catch {
        allPosts = [...FALLBACK_POSTS];
      }
    }

    // 카드뉴스 제외 활성 게시판 기준 통계
    const activePosts = allPosts.filter((p) => p.boardType !== 'CARD_NEWS');
    const totalPosts = activePosts.length;
    const publishedPosts = activePosts.filter(
      (p) => p.inspectionStatus === 'AUTO_PUBLISHED' || p.inspectionStatus === 'APPROVED'
    ).length;
    const pendingReviewPosts = activePosts.filter((p) => p.inspectionStatus === 'PENDING_REVIEW').length;
    const unpublishedPosts = activePosts.filter((p) => p.inspectionStatus === 'UNPUBLISHED').length;

    const boardStats = TARGET_BOARDS.map((b) => {
      const boardPosts = activePosts
        .filter((p) => p.boardType === b.boardType)
        .sort((a, bPost) => String(bPost.registeredDate || '').localeCompare(String(a.registeredDate || '')));
      const latestPost = boardPosts[0] || null;

      return {
        boardType: b.boardType,
        boardName: b.boardName,
        boardId: b.boardId,
        listUrl: b.listUrl,
        count: boardPosts.length,
        latestDate: latestPost?.registeredDate || null,
        latestTitle: latestPost?.title || null,
        lastCheckedAt: latestPost?.lastCheckedAt || null,
      };
    });

    let intervalMinutes = parseInt(process.env.SYNC_INTERVAL_MINUTES || '360', 10);
    let autoSyncEnabled = true;

    try {
      const configInterval = await prisma.systemSetting.findUnique({
        where: { key: 'SYNC_INTERVAL_MINUTES' },
      });
      const configAutoSync = await prisma.systemSetting.findUnique({
        where: { key: 'AUTO_SYNC_ENABLED' },
      });
      if (configInterval?.value) intervalMinutes = parseInt(configInterval.value, 10);
      if (configAutoSync) autoSyncEnabled = configAutoSync.value === 'true';
    } catch {}

    return NextResponse.json({
      success: true,
      lastSync: lastLog,
      stats: {
        totalPosts,
        publishedPosts,
        pendingReviewPosts,
        unpublishedPosts,
      },
      boardStats,
      config: {
        intervalMinutes,
        autoSyncEnabled,
        scheduleTimesKST: ['09:00', '15:00'],
      },
      robotsNotice: {
        status: 'DISALLOW_DETECTED',
        disallowPath: '/fipa/bbs/',
        recommendation: '공식 운영기관(한국어촌어항공단)의 사전 협의 및 공식 연계 협조 또는 전용 API 발급 권장',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 15) : 5;

    const result = await syncAllBoards(limit, 'ADMIN_MANUAL');
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

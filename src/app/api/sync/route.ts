import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { syncAllBoards, TARGET_BOARDS } from '@/lib/scraper';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const lastLog = await prisma.syncLog.findFirst({
      orderBy: { startedAt: 'desc' },
    });

    const totalPosts = await prisma.post.count();
    const publishedPosts = await prisma.post.count({
      where: { inspectionStatus: { in: ['AUTO_PUBLISHED', 'APPROVED'] } },
    });
    const pendingReviewPosts = await prisma.post.count({
      where: { inspectionStatus: 'PENDING_REVIEW' },
    });
    const unpublishedPosts = await prisma.post.count({
      where: { inspectionStatus: 'UNPUBLISHED' },
    });

    // 게시판별 현황
    const boardStats = await Promise.all(
      TARGET_BOARDS.map(async (b) => {
        const count = await prisma.post.count({ where: { boardType: b.boardType } });
        const latestPost = await prisma.post.findFirst({
          where: { boardType: b.boardType },
          orderBy: { createdAt: 'desc' },
          select: { registeredDate: true, title: true, lastCheckedAt: true },
        });
        return {
          boardType: b.boardType,
          boardName: b.boardName,
          boardId: b.boardId,
          listUrl: b.listUrl,
          count,
          latestDate: latestPost?.registeredDate || null,
          latestTitle: latestPost?.title || null,
          lastCheckedAt: latestPost?.lastCheckedAt || null,
        };
      })
    );

    const configInterval = await prisma.systemSetting.findUnique({
      where: { key: 'SYNC_INTERVAL_MINUTES' },
    });
    const configAutoSync = await prisma.systemSetting.findUnique({
      where: { key: 'AUTO_SYNC_ENABLED' },
    });

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
        intervalMinutes: parseInt(configInterval?.value || process.env.SYNC_INTERVAL_MINUTES || '60', 10),
        autoSyncEnabled: configAutoSync ? configAutoSync.value === 'true' : true,
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
    const limit = body.limit || 5;

    const result = await syncAllBoards(limit);
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

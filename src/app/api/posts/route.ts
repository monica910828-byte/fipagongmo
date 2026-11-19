import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const board = searchParams.get('board'); // PRESS, CARD_NEWS, NOTICE, RECRUIT
    const search = searchParams.get('search')?.trim();
    const status = searchParams.get('status');
    const forAdmin = searchParams.get('forAdmin') === 'true';

    const where: any = {};

    if (board && board !== 'ALL') {
      where.boardType = board;
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { summary: { contains: search } },
        { easyExplanation: { contains: search } },
      ];
    }

    if (forAdmin) {
      if (status && status !== 'ALL') {
        where.inspectionStatus = status;
      }
    } else {
      // 일반 대국민 공개용: 자동발행 및 승인된 건만 노출
      where.inspectionStatus = { in: ['AUTO_PUBLISHED', 'APPROVED'] };
      where.isDeletedOnSource = false;
    }

    const posts = await prisma.post.findMany({
      where,
      orderBy: [
        { registeredDate: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        boardType: true,
        boardName: true,
        boardId: true,
        nttSn: true,
        title: true,
        registeredDate: true,
        views: true,
        author: true,
        originalUrl: true,
        thumbnailUrl: true,
        cardImages: true,
        attachments: true,
        summary: true,
        easyExplanation: true,
        voiceScript: true,
        qnaPairs: true,
        isSafetyOrPolicy: true,
        policyKeywords: true,
        inspectionStatus: true,
        aiModelUsed: true,
        isDemo: true,
        lastCheckedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      count: posts.length,
      posts,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

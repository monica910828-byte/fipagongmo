import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { FALLBACK_POSTS } from '@/lib/fallback-posts';
import { isFirebaseConfigured } from '@/lib/firebase';
import { getFirestorePosts } from '@/lib/firestore-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const board = searchParams.get('board'); // PRESS, CARD_NEWS, NOTICE, RECRUIT
    const search = searchParams.get('search')?.trim();
    const status = searchParams.get('status');
    const forAdmin = searchParams.get('forAdmin') === 'true';

    // 1. Firebase Firestore가 활성화되어 있으면 Firestore에서 우선 조회
    if (isFirebaseConfigured()) {
      try {
        const firestorePosts = await getFirestorePosts({
          boardType: board || undefined,
          forAdmin,
          search: search || undefined,
          status: status || undefined,
        });
        if (firestorePosts && firestorePosts.length > 0) {
          return NextResponse.json({
            success: true,
            source: 'firestore',
            count: firestorePosts.length,
            posts: firestorePosts,
          });
        }
      } catch (fErr) {
        console.warn('Firestore 조회 폴백:', fErr);
      }
    }

    // 2. Prisma 로컬 DB 조회
    let posts: any[] = [];
    try {
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
        where.inspectionStatus = { in: ['AUTO_PUBLISHED', 'APPROVED'] };
        where.isDeletedOnSource = false;
      }

      posts = await prisma.post.findMany({
        where,
        orderBy: [
          { registeredDate: 'desc' },
          { createdAt: 'desc' },
        ],
      });
    } catch (dbErr) {
      console.warn('Prisma DB query failed, falling back to cached posts:', dbErr);
      posts = [];
    }

    // 3. DB가 비어있거나 서버리스에서 파일 접근이 불가능할 경우 폴백 데이터 활용
    if (!posts || posts.length === 0) {
      let filtered = [...FALLBACK_POSTS];
      if (board && board !== 'ALL') {
        filtered = filtered.filter(p => p.boardType === board);
      }
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(p =>
          (p.title && p.title.toLowerCase().includes(s)) ||
          (p.summary && p.summary.toLowerCase().includes(s)) ||
          (p.easyExplanation && p.easyExplanation.toLowerCase().includes(s))
        );
      }
      if (!forAdmin) {
        filtered = filtered.filter(p => p.inspectionStatus === 'AUTO_PUBLISHED' || p.inspectionStatus === 'APPROVED');
      }
      posts = filtered;
    }

    return NextResponse.json({
      success: true,
      source: 'local',
      count: posts.length,
      posts,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: true,
      source: 'fallback',
      count: FALLBACK_POSTS.length,
      posts: FALLBACK_POSTS,
    });
  }
}

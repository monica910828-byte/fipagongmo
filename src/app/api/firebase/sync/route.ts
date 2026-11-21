import { NextRequest, NextResponse } from 'next/server';
import { isFirebaseConfigured, firebaseConfig } from '@/lib/firebase';
import { getFirestorePosts, bulkSyncPostsToFirestore } from '@/lib/firestore-service';
import { FALLBACK_POSTS } from '@/lib/fallback-posts';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET: Firebase 연결 상태 확인 및 통계 반환
 */
export async function GET() {
  const configured = isFirebaseConfigured();
  let firestorePostCount = 0;

  if (configured) {
    try {
      const posts = await getFirestorePosts({ forAdmin: true });
      firestorePostCount = posts.length;
    } catch {}
  }

  return NextResponse.json({
    success: true,
    configured,
    projectId: firebaseConfig.projectId || null,
    storageBucket: firebaseConfig.storageBucket || null,
    firestorePostCount,
  });
}

/**
 * POST: 현재 데이터베이스의 모든 소식을 Firestore 클라우드로 일괄 동기화(업로드)
 */
export async function POST() {
  if (!isFirebaseConfigured()) {
    return NextResponse.json({
      success: false,
      error: 'Firebase 설정이 완료되지 않았습니다. .env.local 파일에 Firebase 키를 입력해 주세요.',
    }, { status: 400 });
  }

  try {
    let sourcePosts: any[] = [];
    try {
      sourcePosts = await prisma.post.findMany();
    } catch {}

    if (!sourcePosts || sourcePosts.length === 0) {
      sourcePosts = [...FALLBACK_POSTS];
    }

    const { count } = await bulkSyncPostsToFirestore(sourcePosts);

    return NextResponse.json({
      success: true,
      message: `성공적으로 ${count}개의 공단 소식이 Firestore 클라우드 데이터베이스에 동기화되었습니다.`,
      count,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Firestore 동기화 중 오류가 발생했습니다.',
    }, { status: 500 });
  }
}

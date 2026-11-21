import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { transformContentWithOpenAI } from '@/lib/ai-pipeline';
import { FALLBACK_POSTS } from '@/lib/fallback-posts';
import { isFirebaseConfigured } from '@/lib/firebase';
import { getFirestorePostById, updatePostStatusInFirestore } from '@/lib/firestore-service';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Firestore 조회
    if (isFirebaseConfigured()) {
      try {
        const fPost = await getFirestorePostById(params.id);
        if (fPost) return NextResponse.json({ success: true, post: fPost });
      } catch {}
    }

    // 2. Prisma 로컬 조회
    let post: any = null;
    try {
      post = await prisma.post.findUnique({
        where: { id: params.id },
      });
    } catch (e) {
      console.warn('Prisma get post error, searching fallback:', e);
    }

    // 3. 폴백 조회
    if (!post) {
      post = FALLBACK_POSTS.find(p => p.id === params.id || p.nttSn === params.id) || null;
    }

    if (!post) {
      return NextResponse.json({ success: false, error: '게시물을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, post });
  } catch (error: any) {
    const post = FALLBACK_POSTS.find(p => p.id === params.id || p.nttSn === params.id);
    if (post) {
      return NextResponse.json({ success: true, post });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { inspectionStatus, summary, easyExplanation, voiceScript } = body;

    const extraUpdates: any = {};
    if (summary !== undefined) extraUpdates.summary = summary;
    if (easyExplanation !== undefined) extraUpdates.easyExplanation = easyExplanation;
    if (voiceScript !== undefined) extraUpdates.voiceScript = voiceScript;

    // Firestore 동기화
    if (isFirebaseConfigured()) {
      try {
        await updatePostStatusInFirestore(params.id, inspectionStatus, extraUpdates);
      } catch (fErr) {
        console.warn('Firestore update error:', fErr);
      }
    }

    // Prisma 로컬 업데이트
    try {
      const updated = await prisma.post.update({
        where: { id: params.id },
        data: {
          ...(inspectionStatus ? { inspectionStatus } : {}),
          ...extraUpdates,
        },
      });
      return NextResponse.json({ success: true, post: updated });
    } catch {
      return NextResponse.json({
        success: true,
        post: { id: params.id, inspectionStatus, ...extraUpdates },
      });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// AI 재분석 요청 핸들러
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    let post: any = null;
    if (isFirebaseConfigured()) {
      try {
        post = await getFirestorePostById(params.id);
      } catch {}
    }

    if (!post) {
      try {
        post = await prisma.post.findUnique({
          where: { id: params.id },
        });
      } catch (e) {}
    }

    if (!post) {
      post = FALLBACK_POSTS.find(p => p.id === params.id || p.nttSn === params.id) || null;
    }

    if (!post) {
      return NextResponse.json({ success: false, error: '게시물을 찾을 수 없습니다.' }, { status: 404 });
    }

    const cardImages = post.cardImages ? (typeof post.cardImages === 'string' ? JSON.parse(post.cardImages) : post.cardImages) : [];

    const aiResult = await transformContentWithOpenAI(
      post.title,
      post.rawContent || post.summary,
      post.boardType,
      cardImages.length
    );

    const updatedData = {
      summary: aiResult.summary,
      easyExplanation: aiResult.easyExplanation,
      voiceScript: aiResult.voiceScript,
      qnaPairs: JSON.stringify(aiResult.qnaPairs),
      isSafetyOrPolicy: aiResult.isSafetyOrPolicy,
      policyKeywords: aiResult.policyKeywords.join(', '),
      inspectionStatus: aiResult.isSafetyOrPolicy ? 'PENDING_REVIEW' : 'AUTO_PUBLISHED',
      aiModelUsed: aiResult.aiModelUsed,
      isDemo: aiResult.isDemo,
    };

    if (isFirebaseConfigured()) {
      try {
        await updatePostStatusInFirestore(params.id, updatedData.inspectionStatus, updatedData);
      } catch {}
    }

    try {
      const updated = await prisma.post.update({
        where: { id: params.id },
        data: updatedData,
      });
      return NextResponse.json({ success: true, post: updated, aiResult });
    } catch {
      const updated = { ...post, ...updatedData };
      return NextResponse.json({ success: true, post: updated, aiResult });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

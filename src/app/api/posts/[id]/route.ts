import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { transformContentWithOpenAI } from '@/lib/ai-pipeline';
import { FALLBACK_POSTS } from '@/lib/fallback-posts';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    let post: any = null;
    try {
      post = await prisma.post.findUnique({
        where: { id: params.id },
      });
    } catch (e) {
      console.warn('Prisma get post error, searching fallback:', e);
    }

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

    const dataToUpdate: any = {};
    if (inspectionStatus) dataToUpdate.inspectionStatus = inspectionStatus;
    if (summary !== undefined) dataToUpdate.summary = summary;
    if (easyExplanation !== undefined) dataToUpdate.easyExplanation = easyExplanation;
    if (voiceScript !== undefined) dataToUpdate.voiceScript = voiceScript;

    const updated = await prisma.post.update({
      where: { id: params.id },
      data: dataToUpdate,
    });

    return NextResponse.json({ success: true, post: updated });
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
    try {
      post = await prisma.post.findUnique({
        where: { id: params.id },
      });
    } catch (e) {}

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

    try {
      const updated = await prisma.post.update({
        where: { id: params.id },
        data: {
          summary: aiResult.summary,
          easyExplanation: aiResult.easyExplanation,
          voiceScript: aiResult.voiceScript,
          qnaPairs: JSON.stringify(aiResult.qnaPairs),
          isSafetyOrPolicy: aiResult.isSafetyOrPolicy,
          policyKeywords: aiResult.policyKeywords.join(', '),
          inspectionStatus: aiResult.isSafetyOrPolicy ? 'PENDING_REVIEW' : 'AUTO_PUBLISHED',
          aiModelUsed: aiResult.aiModelUsed,
          isDemo: aiResult.isDemo,
        },
      });
      return NextResponse.json({ success: true, post: updated, aiResult });
    } catch {
      // In-memory response if DB is read-only
      const updated = {
        ...post,
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
      return NextResponse.json({ success: true, post: updated, aiResult });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { transformContentWithOpenAI } from '@/lib/ai-pipeline';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const post = await prisma.post.findUnique({
      where: { id: params.id },
    });

    if (!post) {
      return NextResponse.json({ success: false, error: '게시물을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, post });
  } catch (error: any) {
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
    const post = await prisma.post.findUnique({
      where: { id: params.id },
    });

    if (!post) {
      return NextResponse.json({ success: false, error: '게시물을 찾을 수 없습니다.' }, { status: 404 });
    }

    const cardImages = post.cardImages ? JSON.parse(post.cardImages) : [];

    const aiResult = await transformContentWithOpenAI(
      post.title,
      post.rawContent,
      post.boardType,
      cardImages.length
    );

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
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

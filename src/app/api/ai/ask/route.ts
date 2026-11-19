import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { question, postId } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ success: false, error: '질문 내용을 입력해 주세요.' }, { status: 400 });
    }

    const trimmedQuestion = question.trim();
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const modelName = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';

    let relevantPost = null;
    if (postId) {
      relevantPost = await prisma.post.findUnique({ where: { id: postId } });
    } else {
      // 키워드로 관련 게시물 검색
      const terms = trimmedQuestion.split(' ').filter(t => t.length > 1);
      if (terms.length > 0) {
        relevantPost = await prisma.post.findFirst({
          where: {
            OR: terms.map(term => ({
              OR: [
                { title: { contains: term } },
                { summary: { contains: term } },
                { easyExplanation: { contains: term } },
              ],
            })),
            inspectionStatus: { in: ['AUTO_PUBLISHED', 'APPROVED'] },
          },
          orderBy: { registeredDate: 'desc' },
        });
      }

      if (!relevantPost) {
        relevantPost = await prisma.post.findFirst({
          where: { inspectionStatus: { in: ['AUTO_PUBLISHED', 'APPROVED'] } },
          orderBy: { registeredDate: 'desc' },
        });
      }
    }

    let answer = '';
    let voiceScript = '';
    let isDemo = true;

    if (apiKey && relevantPost) {
      // 실제 OpenAI 연동 모드
      try {
        const openai = new OpenAI({ apiKey });
        const systemPrompt = `당신은 한국어촌어항공단(FiPA)의 디지털 취약계층 어르신을 위한 친절한 음성 안내 상담원입니다.
아래 제공된 [공식 공단 게시물 정보]만을 근거로 정확하게 답변하십시오.
- 원문에 없는 가상의 사실, 일정, 전화번호는 절대 지어내지 마십시오.
- 원문에 정보가 없다면 "죄송합니다, 해당 공지 내용에는 안내되어 있지 않습니다. 정확한 사항은 공단 대표전화나 홈페이지를 통해 문의해 주세요."라고 정중히 답하십시오.
- 어르신을 위해 이해하기 쉽고 따뜻한 존댓말(~합니다, ~하세요)로 2~3문장 이내로 답변하십시오.`;

        const userPrompt = `[공식 공단 게시물 정보]
제목: ${relevantPost.title}
등록일: ${relevantPost.registeredDate}
쉬운 설명: ${relevantPost.easyExplanation}
원문 내용: ${relevantPost.rawContent.slice(0, 2000)}

어르신의 질문: "${trimmedQuestion}"`;

        const response = await openai.chat.completions.create({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
        });

        answer = response.choices[0]?.message?.content?.trim() || '답변을 생성하지 못했습니다.';
        voiceScript = answer;
        isDemo = false;
      } catch (err: any) {
        console.error('OpenAI 질의응답 오류:', err.message);
        // 오류 시 규칙 기반으로 폴백
      }
    }

    if (!answer) {
      // 데모 모드 (API 키 미설정 또는 폴백)
      if (relevantPost) {
        let qnaPairs: Array<{ q: string; a: string }> = [];
        try {
          if (relevantPost.qnaPairs) {
            qnaPairs = JSON.parse(relevantPost.qnaPairs);
          }
        } catch {}

        // 질문과 매칭되는 FAQ가 있는지 탐색
        const matched = qnaPairs.find(pair =>
          trimmedQuestion.includes('내용') && pair.q.includes('내용') ||
          trimmedQuestion.includes('언제') && pair.q.includes('일정') ||
          trimmedQuestion.includes('문의') && pair.q.includes('문의') ||
          trimmedQuestion.includes('신청') && pair.q.includes('일정')
        );

        if (matched) {
          answer = `[데모 안내] ${matched.a}`;
          voiceScript = `${matched.a}`;
        } else {
          answer = `[데모 안내] 문의하신 [${relevantPost.title}] 소식의 핵심 내용은 다음과 같습니다.\n${relevantPost.summary}\n더 자세한 사항은 원문 링크나 담당 부서로 확인하실 수 있습니다.`;
          voiceScript = `문의하신 ${relevantPost.title} 소식의 핵심 내용입니다. ${relevantPost.summary}`;
        }
      } else {
        answer = `[데모 안내] 죄송합니다. 질문과 관련된 공단 소식을 찾지 못했습니다. 게시판 목록에서 원하시는 소식을 선택하신 후 질문해 주시면 더욱 정확하게 답변해 드릴 수 있습니다.`;
        voiceScript = `죄송합니다. 관련 소식을 찾지 못했습니다. 목록에서 소식을 선택하신 후 질문해 주세요.`;
      }
    }

    // 질문-답변 로그 저장
    await prisma.qnaInteraction.create({
      data: {
        postId: relevantPost?.id || null,
        postTitle: relevantPost?.title || null,
        question: trimmedQuestion,
        answer,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      answer,
      voiceScript,
      isDemo,
      sourcePost: relevantPost ? {
        id: relevantPost.id,
        title: relevantPost.title,
        boardName: relevantPost.boardName,
        registeredDate: relevantPost.registeredDate,
        originalUrl: relevantPost.originalUrl,
      } : null,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

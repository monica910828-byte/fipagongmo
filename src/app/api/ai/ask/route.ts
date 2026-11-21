import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import prisma from '@/lib/prisma';
import { FALLBACK_POSTS } from '@/lib/fallback-posts';
import { saveQnaToFirestore } from '@/lib/firestore-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { question, postId } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ success: false, error: '질문 내용을 입력해 주세요.' }, { status: 400 });
    }

    const trimmedQuestion = question.trim();
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const modelName = process.env.OPENAI_MODEL?.trim() || 'gpt-4o';

    let relevantPost: any = null;
    if (postId) {
      try {
        relevantPost = await prisma.post.findUnique({ where: { id: postId } });
      } catch {}
      if (!relevantPost) {
        relevantPost = FALLBACK_POSTS.find(p => p.id === postId || p.nttSn === postId) || null;
      }
    } else {
      // 키워드로 관련 게시물 검색
      const terms = trimmedQuestion.split(' ').filter(t => t.length > 1);
      if (terms.length > 0) {
        try {
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
        } catch {}
      }

      if (!relevantPost) {
        try {
          relevantPost = await prisma.post.findFirst({
            where: { inspectionStatus: { in: ['AUTO_PUBLISHED', 'APPROVED'] } },
            orderBy: { registeredDate: 'desc' },
          });
        } catch {}
      }

      if (!relevantPost) {
        relevantPost = FALLBACK_POSTS[0] || null;
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
- 어르신들이 듣기 편하도록 부드러운 한국어 경어체(~합니다, ~하세요)로 작성하십시오.
- 답변은 2~4문장 내외로 간결하게 핵심만 답변하십시오.`;

        const userPrompt = `[질문]
${trimmedQuestion}

[공식 공단 게시물 정보]
- 제목: ${relevantPost.title}
- 구분: ${relevantPost.boardName}
- 게시일: ${relevantPost.registeredDate}
- 주요내용: ${relevantPost.rawContent || relevantPost.summary}
- 쉬운설명: ${relevantPost.easyExplanation}
- 첨부파일/문의: ${relevantPost.attachments || '공단 홈페이지 문의'}`;

        let response;
        try {
          response = await openai.chat.completions.create({
            model: modelName,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 400,
          });
        } catch (mErr: any) {
          // If model permission fails, fallback to gpt-4o
          if (modelName !== 'gpt-4o') {
            response = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.2,
              max_tokens: 400,
            });
          } else {
            throw mErr;
          }
        }

        answer = response.choices[0]?.message?.content?.trim() || '';
        voiceScript = answer;
        isDemo = false;
      } catch (err: any) {
        console.error('OpenAI 실시간 질문 답변 실패:', err.message);
      }
    }

    // 데모 모드이거나 OpenAI 실패 시의 폴백 답변
    if (!answer) {
      if (relevantPost) {
        answer = `한국어촌어항공단 "${relevantPost.title}" 소식에 대해 알려드릴게요.\n\n${relevantPost.easyExplanation}`;
        voiceScript = `네, 한국어촌어항공단 소식에 대해 말씀드릴게요. ${relevantPost.summary}`;
      } else {
        answer = '질문해 주신 내용에 대해 공단 게시판에서 소식을 찾고 있습니다. 자세한 문의는 한국어촌어항공단 대표전화로 연락 주시면 친절히 안내받으실 수 있습니다.';
        voiceScript = answer;
      }
      isDemo = true;
    }

    // 질의응답 이력 로깅 (Prisma & Firestore 양방향 안전 저장)
    try {
      await prisma.qnaInteraction.create({
        data: {
          postId: relevantPost?.id || null,
          postTitle: relevantPost?.title || null,
          question: trimmedQuestion,
          answer,
        },
      });
    } catch {}

    try {
      await saveQnaToFirestore(trimmedQuestion, answer, relevantPost?.id, relevantPost?.title);
    } catch {}

    return NextResponse.json({
      success: true,
      answer,
      voiceScript,
      isDemo,
      relevantPost: relevantPost ? { id: relevantPost.id, title: relevantPost.title } : null,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

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

    // 1. 모든 게시글 로드 (Prisma -> Firestore -> Fallback)
    let allPosts: any[] = [];
    try {
      allPosts = await prisma.post.findMany({
        where: { inspectionStatus: { not: 'REJECTED' } },
      });
    } catch {}

    if (!allPosts || allPosts.length === 0) {
      allPosts = [...FALLBACK_POSTS];
    }

    let relevantPost: any = null;
    let extraContextPosts: any[] = [];

    if (postId) {
      relevantPost = allPosts.find(p => p.id === postId || p.nttSn === postId) || null;
    }

    if (!relevantPost) {
      // 키워드 불용어 필터링 후 검색
      const STOPWORDS = new Set([
        '대해', '대하여', '관해', '관하여', '관련', '알려줘', '알려주세요', '알려줘요',
        '무엇인가요', '무엇인가', '어떻게', '어떤', '언제', '인가요', '있나요', '있을까요',
        '내용', '정보', '소식', '좀', '은', '는', '이', '가', '을', '를', '에', '의', '대한',
        '알고', '싶어요', '부탁해', '해줘', '있어'
      ]);

      const words = trimmedQuestion
        .replace(/[?.,!~^'"‘’“”()[\]]/g, ' ')
        .split(/\s+/)
        .map(w => w.trim().replace(/(에서|에게|으로|까지|부터|에|을|를|은|는|이|가|의|로|과|와|도)$/, ''))
        .filter(w => w.length >= 2 && !STOPWORDS.has(w));

      if (words.length > 0) {
        // 각 게시물 매칭 스코어 계산 (제목 가중치 10점, 키워드 5점, 요약 3점, 본문 1점)
        const scored = allPosts.map(post => {
          let score = 0;
          const title = (post.title || '').toLowerCase();
          const summary = (post.summary || '').toLowerCase();
          const easy = (post.easyExplanation || '').toLowerCase();
          const raw = (post.rawContent || '').toLowerCase();
          const kw = (post.policyKeywords || '').toLowerCase();

          words.forEach(word => {
            const w = word.toLowerCase();
            if (title.includes(w)) score += 10;
            if (kw.includes(w)) score += 5;
            if (easy.includes(w)) score += 3;
            if (summary.includes(w)) score += 2;
            if (raw.includes(w)) score += 1;
          });

          return { post, score };
        }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);

        if (scored.length > 0) {
          relevantPost = scored[0].post;
          extraContextPosts = scored.slice(1, 3).map(s => s.post);
        }
      }

      if (!relevantPost) {
        relevantPost = allPosts[0] || FALLBACK_POSTS[0];
      }
    }

    let answer = '';
    let voiceScript = '';
    let isDemo = true;

    if (apiKey && relevantPost) {
      // 실제 OpenAI 연동 모드
      try {
        const openai = new OpenAI({ apiKey });
        const systemPrompt = `당신은 한국어촌어항공단(FiPA)의 공식 캐릭터이자 어르신과 국민을 위한 친절한 인공지능 마스코트 '어동이'입니다.
한국어촌어항공단(FiPA)은 어촌 및 어항의 개발과 관리, 어촌관광 활성화, 수산공익직불제 법정의무교육, 귀어귀촌 지원 등을 수행하는 해양수산부 산하 공공기관입니다.
아래 제공된 [공단 공식 소식 정보]를 근거로 사용자의 질문에 가장 친절하고 정확하게 답변해 주세요.
- 어르신 등 디지털 취약계층 분들이 듣기 편하도록 부드럽고 다정한 한국어 경어체(~합니다, ~해 드릴게요)로 알기 쉽게 설명해 주세요.
- 원문에 포함된 신청 기간, 대상, 방법, 문의처가 있다면 핵심만 2~4문장 내외로 명쾌하게 짚어주세요.
- 원문에 없는 가상의 사실이나 전화번호는 지어내지 마시고, 더 자세한 안내는 공단 대표전화나 홈페이지를 통해 문의하시도록 정중히 덧붙여 주세요.`;

        let contextText = `[주요 공단 소식 정보]
- 소식 제목: ${relevantPost.title}
- 소식 구분: ${relevantPost.boardName}
- 게시일자: ${relevantPost.registeredDate}
- 공식 소식 전문: ${relevantPost.rawContent || relevantPost.summary}
- 쉬운 설명: ${relevantPost.easyExplanation}
- 첨부파일/문의: ${relevantPost.attachments || '공단 홈페이지 문의'}`;

        if (extraContextPosts.length > 0) {
          contextText += `\n\n[추가 관련 공단 소식]
` + extraContextPosts.map(p => `- ${p.title} (${p.boardName}): ${p.summary}`).join('\n');
        }

        const userPrompt = `[질문자 질문]
${trimmedQuestion}

${contextText}`;

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

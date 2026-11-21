import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import prisma from '@/lib/prisma';
import { FALLBACK_POSTS } from '@/lib/fallback-posts';
import { saveQnaToFirestore } from '@/lib/firestore-service';
import { verifyFirebaseToken, checkRateLimit, getClientIp } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';
// Vercel Serverless Functions 타임아웃을 30초로 지정하여 긴 AI 응답 대기 보장
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { question, postId } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ success: false, error: '질문 내용을 입력해 주세요.' }, { status: 400 });
    }

    const trimmedQuestion = question.trim();

    // 1. Firebase 인증 토큰 및 요청 제한(Rate Limit) 점검
    const authResult = await verifyFirebaseToken(req);
    const clientIp = getClientIp(req);
    const rateLimitKey = authResult.isValid && authResult.user?.uid
      ? `auth:${authResult.user.uid}`
      : `anon:${clientIp}`;

    const rateCheck = checkRateLimit(rateLimitKey, authResult.isValid);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `질문 요청이 너무 많습니다. 약 ${rateCheck.retryAfterSeconds}초 뒤에 다시 질문해 주세요.`,
          rateLimited: true,
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    // 2. 환경변수 확인 (서버 전용 환경변수에서 안전하게 조회)
    const apiKey = (
      process.env.OPENAI_API_KEY ||
      process.env.VITE_OPENAI_API_KEY ||
      process.env.NEXT_PUBLIC_OPENAI_API_KEY
    )?.trim();

    const modelName = (
      process.env.OPENAI_MODEL ||
      process.env.VITE_OPENAI_MODEL ||
      'gpt-4o'
    ).trim();

    const isDemoModeForced = process.env.DEMO_MODE === 'true';

    // 3. 모든 게시글 로드 (Prisma -> Fallback)
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
      // 키워드 불용어 필터링 후 가중치 검색
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

    // 4. OpenAI 호출 또는 데모/폴백 처리
    let answer = '';
    let voiceScript = '';
    let isDemo = true;
    let diagnosticInfo: any = {
      apiKeyConfigured: Boolean(apiKey),
      modelConfigured: modelName,
      isDemoModeForced,
      authenticated: authResult.isValid,
    };

    if (isDemoModeForced) {
      // DEMO_MODE=true 가 명시적으로 설정된 경우 실제 호출 없이 가상 데모 응답
      diagnosticInfo.status = 'DEMO_MODE_ACTIVE';
      diagnosticInfo.message = 'DEMO_MODE=true 설정으로 인해 인공지능 가상 데모 응답으로 제공되었습니다.';
    } else if (!apiKey) {
      // Vercel 환경변수에 OPENAI_API_KEY가 미등록된 경우
      diagnosticInfo.status = 'MISSING_API_KEY';
      diagnosticInfo.message = '서버(Vercel) 환경변수에 OPENAI_API_KEY가 등록되지 않았습니다. Vercel 프로젝트 환경변수를 확인해 주세요.';
    } else if (relevantPost) {
      // 실제 OpenAI 연동 모드 실행
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
          contextText += `\n\n[추가 관련 공단 소식]\n` + extraContextPosts.map(p => `- ${p.title} (${p.boardName}): ${p.summary}`).join('\n');
        }

        const userPrompt = `[질문자 질문]\n${trimmedQuestion}\n\n${contextText}`;

        let response;
        try {
          response = await openai.chat.completions.create({
            model: modelName,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 450,
          });
        } catch (mErr: any) {
          // 지정된 모델 권한 오류 시 gpt-4o 또는 gpt-4o-mini 로 자동 대체
          const fallbackModel = modelName === 'gpt-4o' ? 'gpt-4o-mini' : 'gpt-4o';
          response = await openai.chat.completions.create({
            model: fallbackModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 450,
          });
          diagnosticInfo.modelUsed = fallbackModel;
        }

        answer = response.choices[0]?.message?.content?.trim() || '';
        voiceScript = answer;
        isDemo = false;
        diagnosticInfo.status = 'SUCCESS';
        diagnosticInfo.modelUsed = diagnosticInfo.modelUsed || modelName;
      } catch (err: any) {
        // OpenAI API 호출 실패 시 원인 분류 (키/개인정보는 절대 로그에 남기지 않음)
        let errorReason = 'OPENAI_ERROR';
        if (err.status === 401) {
          errorReason = 'INVALID_API_KEY';
        } else if (err.status === 429) {
          errorReason = 'QUOTA_EXCEEDED';
        } else if (err.status === 404) {
          errorReason = 'MODEL_NOT_FOUND';
        }

        console.error(`[OpenAI Call Failed] status: ${err.status}, reason: ${errorReason}`);
        diagnosticInfo.status = errorReason;
        diagnosticInfo.httpStatus = err.status;
        diagnosticInfo.message = err.message || 'OpenAI 서버와의 통신 중 오류가 발생했습니다.';
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
      diagnostics: diagnosticInfo,
    });
  } catch (error: any) {
    console.error('[API /api/ai/ask Error]:', error.message);
    return NextResponse.json({ success: false, error: '답변 처리 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

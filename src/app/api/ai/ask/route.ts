import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import prisma from '@/lib/prisma';
import { FALLBACK_POSTS } from '@/lib/fallback-posts';
import { saveQnaToFirestore } from '@/lib/firestore-service';
import { verifyFirebaseToken, checkRateLimit, getClientIp } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel Serverless Functions 타임아웃을 30초로 지정하여 긴 AI 응답 대기 보장
export const maxDuration = 30;

interface OpenAiRuntimeConfig {
  apiKey: string;
  apiKeyConfigured: boolean;
  modelName: string;
  vercelEnv: string;
  nodeEnv: string;
  isProductionEnv: boolean;
  demoModeEnvConfigured: boolean;
  isDemoModeForced: boolean;
  commitSha: string | null;
}

/**
 * 서버 전용 OpenAI 환경변수 및 실행 환경 설정을 안전하게 조회합니다.
 * - process.env.OPENAI_API_KEY만 사용합니다 (VITE_ / NEXT_PUBLIC_ 대체 경로 미사용).
 * - 운영 환경(Production)에서는 DEMO_MODE=true가 설정되어 있어도 실제 OpenAI API를 호출합니다.
 */
function getOpenAiRuntimeConfig(): OpenAiRuntimeConfig {
  const rawApiKey = process.env.OPENAI_API_KEY;
  const apiKey = typeof rawApiKey === 'string' ? rawApiKey.trim() : '';
  const apiKeyConfigured = apiKey.length > 0;

  const modelName = (process.env.OPENAI_MODEL || '').trim() || 'gpt-4o';

  const vercelEnvRaw = process.env.VERCEL_ENV || null; // 'production' | 'preview' | 'development' | null
  const nodeEnv = process.env.NODE_ENV || 'unknown';
  const isProductionEnv = vercelEnvRaw === 'production' || (nodeEnv === 'production' && !vercelEnvRaw);

  const demoModeEnvConfigured = (process.env.DEMO_MODE || '').trim().toLowerCase() === 'true';
  // 운영 환경에서는 DEMO_MODE=true로 인한 가상 응답 차단을 방지하고 실제 OpenAI API를 우선 호출
  const isDemoModeForced = !isProductionEnv && demoModeEnvConfigured;

  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA
    ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
    : null;

  return {
    apiKey,
    apiKeyConfigured,
    modelName,
    vercelEnv: vercelEnvRaw || 'local',
    nodeEnv,
    isProductionEnv,
    demoModeEnvConfigured,
    isDemoModeForced,
    commitSha,
  };
}

function classifyOpenAiError(err: any): {
  status: string;
  httpStatus: number | null;
  errorCode: string | null;
  message: string;
} {
  const httpStatus: number | null = typeof err?.status === 'number' ? err.status : null;
  const errorCode: string | null = err?.code || err?.type || null;

  if (httpStatus === 401) {
    return {
      status: 'INVALID_API_KEY',
      httpStatus,
      errorCode,
      message:
        '서버에서 OPENAI_API_KEY는 인식되었으나 OpenAI 인증(401)에 실패했습니다. 키가 유효하거나 만료되지 않았는지 확인해 주세요. [상태: INVALID_API_KEY]',
    };
  }
  if (httpStatus === 429) {
    return {
      status: 'QUOTA_EXCEEDED',
      httpStatus,
      errorCode,
      message:
        'OpenAI API 호출 한도 또는 크레딧(429)이 초과되었습니다. OpenAI 계정의 결제/사용량 한도를 확인해 주세요. [상태: QUOTA_EXCEEDED]',
    };
  }
  if (httpStatus === 404) {
    return {
      status: 'MODEL_NOT_FOUND',
      httpStatus,
      errorCode,
      message:
        '지정된 OpenAI 모델에 접근할 수 없습니다(404). OPENAI_MODEL 환경변수를 확인해 주세요. [상태: MODEL_NOT_FOUND]',
    };
  }
  if (httpStatus === 403) {
    return {
      status: 'PERMISSION_DENIED',
      httpStatus,
      errorCode,
      message:
        'OpenAI API 요청 권한이 거부되었습니다(403). 프로젝트 권한 및 키 범위를 확인해 주세요. [상태: PERMISSION_DENIED]',
    };
  }
  if (err?.name === 'APIConnectionTimeoutError' || err?.code === 'ETIMEDOUT' || httpStatus === 408) {
    return {
      status: 'OPENAI_TIMEOUT',
      httpStatus,
      errorCode,
      message:
        'OpenAI 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요. [상태: OPENAI_TIMEOUT]',
    };
  }
  if (
    err?.name === 'APIConnectionError' ||
    err?.code === 'ENOTFOUND' ||
    err?.code === 'ECONNREFUSED'
  ) {
    return {
      status: 'OPENAI_CONNECTION_ERROR',
      httpStatus,
      errorCode,
      message:
        'OpenAI 서버와 연결하지 못했습니다. 네트워크 상태를 확인해 주세요. [상태: OPENAI_CONNECTION_ERROR]',
    };
  }
  return {
    status: 'OPENAI_API_FAILED',
    httpStatus,
    errorCode,
    message:
      '서버에서 OPENAI_API_KEY는 인식되었으나 OpenAI API 호출 중 오류가 발생했습니다. 서버 로그를 확인해 주세요. [상태: OPENAI_API_FAILED]',
  };
}

/**
 * Vercel 서버 함수 환경변수 인식 상태 진단 엔드포인트 (GET /api/ai/ask)
 * - API 키 값이나 일부 문자열은 절대 출력하지 않고 Boolean(apiKeyConfigured)만 반환합니다.
 */
export async function GET() {
  const cfg = getOpenAiRuntimeConfig();

  console.info('[API GET /api/ai/ask] Runtime env check:', {
    apiKeyConfigured: cfg.apiKeyConfigured,
    modelConfigured: cfg.modelName,
    isDemoModeForced: cfg.isDemoModeForced,
    demoModeEnvConfigured: cfg.demoModeEnvConfigured,
    isProductionEnv: cfg.isProductionEnv,
    vercelEnv: cfg.vercelEnv,
    nodeEnv: cfg.nodeEnv,
    commitSha: cfg.commitSha,
  });

  const status = cfg.isDemoModeForced
    ? 'DEMO_MODE_ACTIVE'
    : !cfg.apiKeyConfigured
    ? 'MISSING_API_KEY'
    : 'READY';

  const message =
    status === 'READY'
      ? '서버 환경변수 OPENAI_API_KEY가 정상적으로 인식되었습니다.'
      : status === 'DEMO_MODE_ACTIVE'
      ? '개발 환경에서 DEMO_MODE=true 설정이 활성화되어 있습니다.'
      : '서버 환경변수 OPENAI_API_KEY를 읽지 못했습니다. Vercel 환경변수(Production/Preview 범위) 등록 및 재배포 상태를 확인해 주세요.';

  return NextResponse.json(
    {
      success: true,
      diagnostics: {
        status,
        failureCategory: status === 'MISSING_API_KEY' ? 'CONFIG_ERROR' : status === 'DEMO_MODE_ACTIVE' ? 'DEMO_MODE' : null,
        apiKeyConfigured: cfg.apiKeyConfigured,
        modelConfigured: cfg.modelName,
        isDemoModeForced: cfg.isDemoModeForced,
        demoModeEnvConfigured: cfg.demoModeEnvConfigured,
        isProductionEnv: cfg.isProductionEnv,
        vercelEnv: cfg.vercelEnv,
        nodeEnv: cfg.nodeEnv,
        runtime: 'nodejs',
        commitSha: cfg.commitSha,
        message,
        checkedAt: new Date().toISOString(),
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}

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

    // 2. 서버 전용 환경변수 확인 (process.env.OPENAI_API_KEY만 사용)
    const cfg = getOpenAiRuntimeConfig();

    // 서버 실행 시 API 키 존재 여부를 Boolean으로만 기록하는 안전한 진단 로그 (키 원문 절대 출력 금지)
    console.info('[API POST /api/ai/ask] Runtime env check:', {
      apiKeyConfigured: cfg.apiKeyConfigured,
      modelConfigured: cfg.modelName,
      isDemoModeForced: cfg.isDemoModeForced,
      demoModeEnvConfigured: cfg.demoModeEnvConfigured,
      isProductionEnv: cfg.isProductionEnv,
      vercelEnv: cfg.vercelEnv,
      nodeEnv: cfg.nodeEnv,
      commitSha: cfg.commitSha,
    });

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

    // 4. OpenAI 호출 또는 데모/폴백 처리 (키 부재 vs API 호출 실패 명확히 구분)
    let answer = '';
    let voiceScript = '';
    let isDemo = true;
    const diagnosticInfo: Record<string, any> = {
      status: 'PENDING',
      failureCategory: null,
      apiKeyConfigured: cfg.apiKeyConfigured,
      openAiAttempted: false,
      modelConfigured: cfg.modelName,
      isDemoModeForced: cfg.isDemoModeForced,
      demoModeEnvConfigured: cfg.demoModeEnvConfigured,
      isProductionEnv: cfg.isProductionEnv,
      vercelEnv: cfg.vercelEnv,
      nodeEnv: cfg.nodeEnv,
      runtime: 'nodejs',
      commitSha: cfg.commitSha,
      authenticated: authResult.isValid,
    };

    if (cfg.isDemoModeForced) {
      // 개발 환경에서 DEMO_MODE=true 가 명시적으로 설정된 경우 실제 호출 없이 가상 데모 응답
      diagnosticInfo.status = 'DEMO_MODE_ACTIVE';
      diagnosticInfo.failureCategory = 'DEMO_MODE';
      diagnosticInfo.message =
        '개발 환경의 DEMO_MODE=true 설정으로 인해 가상 데모 응답으로 제공되었습니다. [상태: DEMO_MODE_ACTIVE]';
    } else if (!cfg.apiKeyConfigured) {
      // 서버 환경변수 process.env.OPENAI_API_KEY가 비어 있거나 미등록된 경우 (API 호출 시도 전 차단)
      diagnosticInfo.status = 'MISSING_API_KEY';
      diagnosticInfo.failureCategory = 'CONFIG_ERROR';
      diagnosticInfo.message =
        '서버 환경변수 OPENAI_API_KEY를 읽지 못했습니다. Vercel 프로젝트 환경변수(Production/Preview 적용 범위) 등록 및 재배포 상태를 확인해 주세요. [상태: MISSING_API_KEY]';
    } else {
      // 실제 OpenAI 연동 모드 실행 (API 키 존재 확인됨)
      diagnosticInfo.openAiAttempted = true;
      try {
        const openai = new OpenAI({ apiKey: cfg.apiKey });
        const systemPrompt = `당신은 한국어촌어항공단(FiPA)의 공식 캐릭터이자 어르신과 국민을 위한 친절한 인공지능 마스코트 '어동이'입니다.
한국어촌어항공단(FiPA)은 어촌 및 어항의 개발과 관리, 어촌관광 활성화, 수산공익직불제 법정의무교육, 귀어귀촌 지원 등을 수행하는 해양수산부 산하 공공기관입니다.
아래 제공된 [공단 공식 소식 정보]를 근거로 사용자의 질문에 가장 친절하고 정확하게 답변해 주세요.
- 어르신 등 디지털 취약계층 분들이 듣기 편하도록 부드럽고 다정한 한국어 경어체(~합니다, ~해 드릴게요)로 알기 쉽게 설명해 주세요.
- 원문에 포함된 신청 기간, 대상, 방법, 문의처가 있다면 핵심만 2~4문장 내외로 명쾌하게 짚어주세요.
- 원문에 없는 가상의 사실이나 전화번호는 지어내지 마시고, 더 자세한 안내는 공단 대표전화나 홈페이지를 통해 문의하시도록 정중히 덧붙여 주세요.`;

        let contextText = relevantPost
          ? `[주요 공단 소식 정보]
- 소식 제목: ${relevantPost.title}
- 소식 구분: ${relevantPost.boardName}
- 게시일자: ${relevantPost.registeredDate}
- 공식 소식 전문: ${relevantPost.rawContent || relevantPost.summary}
- 쉬운 설명: ${relevantPost.easyExplanation}
- 첨부파일/문의: ${relevantPost.attachments || '공단 홈페이지 문의'}`
          : '[주요 공단 소식 정보]\n등록된 관련 게시글이 없어 한국어촌어항공단 일반 안내 기준으로 답변합니다.';

        if (extraContextPosts.length > 0) {
          contextText += `\n\n[추가 관련 공단 소식]\n` + extraContextPosts.map(p => `- ${p.title} (${p.boardName}): ${p.summary}`).join('\n');
        }

        const userPrompt = `[질문자 질문]\n${trimmedQuestion}\n\n${contextText}`;

        let response;
        try {
          response = await openai.chat.completions.create({
            model: cfg.modelName,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 450,
          });
        } catch (mErr: any) {
          // 모델명 오류(404/400/model_not_found)인 경우에만 대체 모델로 1회 재시도
          const isModelIssue =
            mErr?.status === 404 || mErr?.status === 400 || mErr?.code === 'model_not_found';
          if (!isModelIssue) {
            throw mErr;
          }
          const fallbackModel = cfg.modelName === 'gpt-4o' ? 'gpt-4o-mini' : 'gpt-4o';
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

        const aiContent = response.choices[0]?.message?.content?.trim() || '';
        if (aiContent) {
          answer = aiContent;
          voiceScript = answer;
          isDemo = false;
          diagnosticInfo.status = 'SUCCESS';
          diagnosticInfo.failureCategory = null;
          diagnosticInfo.modelUsed = diagnosticInfo.modelUsed || cfg.modelName;
        } else {
          diagnosticInfo.status = 'OPENAI_EMPTY_RESPONSE';
          diagnosticInfo.failureCategory = 'OPENAI_API_ERROR';
          diagnosticInfo.message =
            '서버에서 OPENAI_API_KEY는 인식되었으나 OpenAI로부터 빈 응답이 반환되었습니다. [상태: OPENAI_EMPTY_RESPONSE]';
        }
      } catch (err: any) {
        // OpenAI API 호출 실패 시 원인 분류 (키 원문 및 민감 정보는 절대 로그/응답에 남기지 않음)
        const classified = classifyOpenAiError(err);

        console.error('[API POST /api/ai/ask] OpenAI API call failed:', {
          apiKeyConfigured: cfg.apiKeyConfigured,
          status: classified.status,
          httpStatus: classified.httpStatus,
          errorCode: classified.errorCode,
          modelConfigured: cfg.modelName,
          vercelEnv: cfg.vercelEnv,
        });

        diagnosticInfo.status = classified.status;
        diagnosticInfo.failureCategory = 'OPENAI_API_ERROR';
        diagnosticInfo.httpStatus = classified.httpStatus;
        diagnosticInfo.errorCode = classified.errorCode;
        diagnosticInfo.message = classified.message;
      }
    }

    // 데모 모드이거나 키 부재/OpenAI 호출 실패 시의 안전한 폴백 답변
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

    return NextResponse.json(
      {
        success: true,
        answer,
        voiceScript,
        isDemo,
        relevantPost: relevantPost ? { id: relevantPost.id, title: relevantPost.title } : null,
        diagnostics: diagnosticInfo,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('[API /api/ai/ask Error]:', {
      name: error?.name || 'Error',
      code: error?.code || null,
    });
    return NextResponse.json({ success: false, error: '답변 처리 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import prisma from '@/lib/prisma';
import { FALLBACK_POSTS } from '@/lib/fallback-posts';
import { saveQnaToFirestore, getFirestorePosts } from '@/lib/firestore-service';
import { verifyFirebaseToken, checkRateLimit, getClientIp } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel Serverless Functions 타임아웃을 30초로 지정하여 긴 AI 응답 대기 보장
export const maxDuration = 30;

// 한국어촌어항공단(FiPA) 공식 홈페이지 종합 안내 기본 지식 (전체 질문 모드용)
const FIPA_HOMEPAGE_OVERVIEW = `[한국어촌어항공단(FiPA) 공식 홈페이지 종합 안내]
- 기관명: 한국어촌어항공단 (FiPA, 해양수산부 산하 위탁집행형 준정부기관)
- 공식 홈페이지: https://www.fipa.or.kr
- 설립 목적: 어촌과 어항의 개발·관리, 어촌관광 활성화, 어장 정화, 귀어귀촌 및 수산인력 육성 등을 통해 풍요롭고 살기 좋은 어촌·어항을 조성하는 공공기관입니다.
- 주요 사업 및 서비스:
  1) 어항 개발·관리 및 안전점검: 국가어항 및 지방어항의 건설·유지보수, 어항시설 안전점검, 어항 정화선 운영을 통한 청정어항 환경 관리
  2) 어촌신활력증진사업 및 어촌뉴딜: 낙후된 어촌·어항의 정주여건 개선, 생활인프라 확충, 지역 경제 활성화 지원
  3) 어촌관광 활성화 및 바다여행: 전국 어촌체험휴양마을 안내, 어촌관광 정보 제공 (바다여행 포털: https://www.seantour.kr)
  4) 귀어귀촌 종합지원: 귀어귀촌 희망자 상담·교육·창업·정착 정보 제공 (귀어귀촌종합센터: https://www.sealife.go.kr / 상담전화: 1899-9597)
  5) 수산공익직불제 법정의무교육 및 수산인력 교육: 어업인 대상 의무교육·온라인 교육·AI 상담 운영 (수산교육포털: https://www.susanedu.kr / 안내전화: 1600-3256)
  6) 친환경 양식어업 육성 및 양식장 임대사업: 스마트·친환경 양식 기술 보급 및 공공 양식장 임대 지원
  7) 공단 공식 게시판: 보도자료, 카드뉴스, 공지사항, 공고·공모(입찰·채용·지원사업 등)`;

interface OpenAiRuntimeConfig {
  apiKey: string;
  hasOpenAiApiKey: boolean;
  isOpenAiApiKeyEmpty: boolean;
  apiKeyConfigured: boolean;
  hasOpenAiModel: boolean;
  modelName: string;
  vercelEnv: 'production' | 'preview' | 'development';
  nodeEnv: string;
  isProductionEnv: boolean;
  demoModeEnvConfigured: boolean;
  isDemoModeForced: boolean;
  commitSha: string | null;
}

/**
 * 서버 전용 OpenAI 환경변수 및 실행 환경 설정을 런타임 시점에 동적으로 조회합니다.
 * - process.env['OPENAI_API_KEY']만 사용합니다 (VITE_ / NEXT_PUBLIC_ 대체 경로 미사용).
 * - 운영 환경(Production)에서는 DEMO_MODE=true가 설정되어 있어도 실제 OpenAI API를 호출합니다.
 */
function getOpenAiRuntimeConfig(): OpenAiRuntimeConfig {
  const rawApiKey = process.env['OPENAI_API_KEY'];
  const hasOpenAiApiKey = typeof rawApiKey === 'string';
  const apiKey = hasOpenAiApiKey ? rawApiKey.trim() : '';
  const isOpenAiApiKeyEmpty = apiKey.length === 0;
  const apiKeyConfigured = hasOpenAiApiKey && !isOpenAiApiKeyEmpty;

  const rawModel = process.env['OPENAI_MODEL'];
  const hasOpenAiModel = typeof rawModel === 'string' && rawModel.trim().length > 0;
  const modelName = hasOpenAiModel ? rawModel.trim() : 'gpt-4o-mini';

  const vercelEnvRaw = process.env['VERCEL_ENV'];
  const nodeEnv = process.env['NODE_ENV'] || 'development';
  const vercelEnv: 'production' | 'preview' | 'development' =
    vercelEnvRaw === 'production' || vercelEnvRaw === 'preview' || vercelEnvRaw === 'development'
      ? vercelEnvRaw
      : nodeEnv === 'production'
      ? 'production'
      : 'development';

  const isProductionEnv = vercelEnv === 'production';

  const demoModeEnvConfigured = (process.env['DEMO_MODE'] || '').trim().toLowerCase() === 'true';
  // 운영 환경(Production)에서는 DEMO_MODE=true로 인한 가상 응답 차단을 방지하고 실제 OpenAI API를 호출
  const isDemoModeForced = !isProductionEnv && demoModeEnvConfigured;

  const commitShaRaw = process.env['VERCEL_GIT_COMMIT_SHA'];
  const commitSha = typeof commitShaRaw === 'string' && commitShaRaw.length > 0
    ? commitShaRaw.slice(0, 7)
    : null;

  return {
    apiKey,
    hasOpenAiApiKey,
    isOpenAiApiKeyEmpty,
    apiKeyConfigured,
    hasOpenAiModel,
    modelName,
    vercelEnv,
    nodeEnv,
    isProductionEnv,
    demoModeEnvConfigured,
    isDemoModeForced,
    commitSha,
  };
}

/**
 * 보안 안전한 서버 로그 진단 출력
 * - VERCEL_ENV, OPENAI_API_KEY 존재 여부(true/false), DEMO_MODE 설정 여부, 실행 중인 Git 커밋 식별자만 기록합니다.
 * - API 키 원문/일부 문자열 및 전체 환경변수 목록은 절대 출력하지 않습니다.
 */
function logSafeEnvDiagnostics(method: 'GET' | 'POST', cfg: OpenAiRuntimeConfig) {
  console.info(`[API ${method} /api/ai/ask] Runtime env diagnostics:`, {
    VERCEL_ENV: cfg.vercelEnv,
    hasOpenAiApiKey: cfg.apiKeyConfigured,
    demoModeConfigured: cfg.demoModeEnvConfigured,
    commitSha: cfg.commitSha,
  });
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
 * 인증된 관리자 전용 환경변수 진단 엔드포인트 (GET /api/ai/ask)
 * - 비인증 사용자에게는 진단 정보를 제공하지 않고 401을 반환합니다.
 * - API 키 원문이나 일부 문자열은 절대 반환하거나 로그에 출력하지 않습니다.
 */
export async function GET(req: NextRequest) {
  const authResult = await verifyFirebaseToken(req);
  if (!authResult.isValid) {
    return NextResponse.json(
      {
        success: false,
        error: '인증된 관리자만 환경변수 진단 정보를 조회할 수 있습니다.',
      },
      {
        status: 401,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  }

  const cfg = getOpenAiRuntimeConfig();
  logSafeEnvDiagnostics('GET', cfg);

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
      : cfg.hasOpenAiApiKey && cfg.isOpenAiApiKeyEmpty
      ? '서버 환경변수 OPENAI_API_KEY는 존재하지만 값이 비어 있습니다. Vercel 환경변수 값을 확인해 주세요.'
      : '서버 환경변수 OPENAI_API_KEY를 읽지 못했습니다. Vercel 프로젝트 환경변수(Production/Preview 적용 범위) 등록 및 재배포 상태를 확인해 주세요.';

  return NextResponse.json(
    {
      success: true,
      diagnostics: {
        status,
        failureCategory:
          status === 'MISSING_API_KEY'
            ? 'CONFIG_ERROR'
            : status === 'DEMO_MODE_ACTIVE'
            ? 'DEMO_MODE'
            : null,
        vercelEnv: cfg.vercelEnv,
        hasOpenAiApiKey: cfg.hasOpenAiApiKey,
        isOpenAiApiKeyEmpty: cfg.isOpenAiApiKeyEmpty,
        apiKeyConfigured: cfg.apiKeyConfigured,
        hasOpenAiModel: cfg.hasOpenAiModel,
        modelConfigured: cfg.modelName,
        isDemoModeActive: cfg.isDemoModeForced,
        isDemoModeForced: cfg.isDemoModeForced,
        demoModeEnvConfigured: cfg.demoModeEnvConfigured,
        isProductionEnv: cfg.isProductionEnv,
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
    const { question, postId, scope } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ success: false, error: '질문 내용을 입력해 주세요.' }, { status: 400 });
    }

    const trimmedQuestion = question.trim();
    const isGeneralMode = scope === 'ALL' || !postId;

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

    // 2. 서버 전용 환경변수 확인 (process.env['OPENAI_API_KEY']만 사용)
    const cfg = getOpenAiRuntimeConfig();

    // 서버 로그에 보안 안전한 진단 항목만 기록 (API 키 원문/일부/전체 목록 출력 금지)
    logSafeEnvDiagnostics('POST', cfg);

    // 3. 모든 게시글 로드 (Firestore + Prisma + Fallback 통합·중복 제거)
    let allPosts: any[] = [];
    const seenKeys = new Set<string>();
    const addPostsUnique = (items: any[]) => {
      for (const p of items) {
        const dedupKey = p?.nttSn || p?.id || p?.title;
        if (dedupKey && !seenKeys.has(dedupKey)) {
          seenKeys.add(dedupKey);
          allPosts.push(p);
        }
      }
    };

    try {
      const firestorePosts = await getFirestorePosts({ boardType: 'ALL' });
      if (firestorePosts.length > 0) addPostsUnique(firestorePosts);
    } catch {}

    try {
      const prismaPosts = await prisma.post.findMany({
        where: { inspectionStatus: { not: 'REJECTED' } },
        orderBy: { registeredDate: 'desc' },
      });
      if (prismaPosts.length > 0) addPostsUnique(prismaPosts);
    } catch {}

    addPostsUnique(FALLBACK_POSTS);

    // 최신 게시일자순 정렬
    allPosts.sort((a, b) => String(b.registeredDate || '').localeCompare(String(a.registeredDate || '')));

    let relevantPost: any = null;
    let extraContextPosts: any[] = [];
    let matchedPostsForResponse: any[] = [];

    if (!isGeneralMode && postId) {
      relevantPost = allPosts.find(p => p.id === postId || p.nttSn === postId) || null;
    }

    if (isGeneralMode || !relevantPost) {
      // 키워드 불용어 필터링 후 가중치 검색 (전체 공단 소식 대상)
      const STOPWORDS = new Set([
        '대해', '대하여', '관해', '관하여', '관련', '알려줘', '알려주세요', '알려줘요',
        '무엇인가요', '무엇인가', '어떻게', '어떤', '언제', '인가요', '있나요', '있을까요',
        '내용', '정보', '소식', '좀', '은', '는', '이', '가', '을', '를', '에', '의', '대한',
        '알고', '싶어요', '부탁해', '해줘', '있어', '한국어촌어항공단', '공단', '홈페이지'
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
          const board = (post.boardName || '').toLowerCase();
          const summary = (post.summary || '').toLowerCase();
          const easy = (post.easyExplanation || '').toLowerCase();
          const raw = (post.rawContent || '').toLowerCase();
          const kw = (post.policyKeywords || '').toLowerCase();

          words.forEach(word => {
            const w = word.toLowerCase();
            if (title.includes(w)) score += 10;
            if (board.includes(w)) score += 6;
            if (kw.includes(w)) score += 5;
            if (easy.includes(w)) score += 3;
            if (summary.includes(w)) score += 2;
            if (raw.includes(w)) score += 1;
          });

          return { post, score };
        }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);

        if (scored.length > 0) {
          relevantPost = scored[0].post;
          extraContextPosts = scored.slice(1, isGeneralMode ? 5 : 3).map(s => s.post);
          matchedPostsForResponse = scored.slice(0, 3).map(s => s.post);
        }
      }

      if (!relevantPost && !isGeneralMode) {
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
      vercelEnv: cfg.vercelEnv,
      hasOpenAiApiKey: cfg.hasOpenAiApiKey,
      isOpenAiApiKeyEmpty: cfg.isOpenAiApiKeyEmpty,
      apiKeyConfigured: cfg.apiKeyConfigured,
      openAiAttempted: false,
      hasOpenAiModel: cfg.hasOpenAiModel,
      modelConfigured: cfg.modelName,
      isDemoModeActive: cfg.isDemoModeForced,
      isDemoModeForced: cfg.isDemoModeForced,
      demoModeEnvConfigured: cfg.demoModeEnvConfigured,
      isProductionEnv: cfg.isProductionEnv,
      runtime: 'nodejs',
      commitSha: cfg.commitSha,
      authenticated: authResult.isValid,
      scope: isGeneralMode ? 'ALL' : 'POST',
    };

    if (cfg.isDemoModeForced) {
      // 개발 환경에서 DEMO_MODE=true 가 명시적으로 설정된 경우 실제 호출 없이 가상 데모 응답
      diagnosticInfo.status = 'DEMO_MODE_ACTIVE';
      diagnosticInfo.failureCategory = 'DEMO_MODE';
      diagnosticInfo.message =
        '개발 환경의 DEMO_MODE=true 설정으로 인해 가상 데모 응답으로 제공되었습니다. [상태: DEMO_MODE_ACTIVE]';
    } else if (!cfg.apiKeyConfigured) {
      // 서버 환경변수 process.env['OPENAI_API_KEY']가 비어 있거나 미등록된 경우 (API 호출 시도 전 차단)
      diagnosticInfo.status = 'MISSING_API_KEY';
      diagnosticInfo.failureCategory = 'CONFIG_ERROR';
      diagnosticInfo.message = cfg.hasOpenAiApiKey && cfg.isOpenAiApiKeyEmpty
        ? '서버 환경변수 OPENAI_API_KEY는 존재하지만 값이 비어 있습니다. Vercel 환경변수 값을 확인해 주세요. [상태: MISSING_API_KEY]'
        : '서버 환경변수 OPENAI_API_KEY를 읽지 못했습니다. Vercel 프로젝트 환경변수(Production/Preview 적용 범위) 등록 및 재배포 상태를 확인해 주세요. [상태: MISSING_API_KEY]';
    } else {
      // 실제 OpenAI 연동 모드 실행 (API 키 존재 확인됨)
      diagnosticInfo.openAiAttempted = true;
      try {
        const openai = new OpenAI({ apiKey: cfg.apiKey });
        const systemPrompt = isGeneralMode
          ? `당신은 한국어촌어항공단(FiPA)의 공식 캐릭터이자 어르신과 국민을 위한 친절한 종합 안내 인공지능 마스코트 '어동이'입니다.
아래 제공되는 [한국어촌어항공단(FiPA) 공식 홈페이지 종합 안내], [관련 공단 소식 상세], [최신 공단 소식 전체 목록]을 바탕으로 한국어촌어항공단 홈페이지의 모든 내용과 소식에 대해 친절하고 정확하게 답변해 주세요.
- 어르신 등 디지털 취약계층 분들이 읽기·듣기 편하도록 부드럽고 다정한 한국어 경어체(~합니다, ~해 드릴게요)로 설명해 주세요.
- 질문과 관련된 공단 사업, 포털, 신청 기간, 대상, 방법, 문의처가 있다면 핵심을 3~5문장 내외로 알기 쉽게 정리해 주세요.
- 여러 소식이나 사업이 관련되어 있으면 항목별로 깔끔하게 정리해 안내해 주세요.
- 제공된 정보에 없는 가상의 일정·금액·전화번호는 절대 지어내지 마시고, 더 자세한 안내는 한국어촌어항공단 공식 홈페이지(https://www.fipa.or.kr)나 관련 안내 창구를 이용하시도록 정중히 덧붙여 주세요.`
          : `당신은 한국어촌어항공단(FiPA)의 공식 캐릭터이자 어르신과 국민을 위한 친절한 인공지능 마스코트 '어동이'입니다.
한국어촌어항공단(FiPA)은 어촌 및 어항의 개발과 관리, 어촌관광 활성화, 수산공익직불제 법정의무교육, 귀어귀촌 지원 등을 수행하는 해양수산부 산하 공공기관입니다.
아래 제공된 [공단 공식 소식 정보]를 근거로 사용자의 질문에 가장 친절하고 정확하게 답변해 주세요.
- 어르신 등 디지털 취약계층 분들이 듣기 편하도록 부드럽고 다정한 한국어 경어체(~합니다, ~해 드릴게요)로 알기 쉽게 설명해 주세요.
- 원문에 포함된 신청 기간, 대상, 방법, 문의처가 있다면 핵심만 2~4문장 내외로 명쾌하게 짚어주세요.
- 원문에 없는 가상의 사실이나 전화번호는 지어내지 마시고, 더 자세한 안내는 공단 대표전화나 홈페이지를 통해 문의하시도록 정중히 덧붙여 주세요.`;

        let contextText = '';
        if (isGeneralMode) {
          contextText = `${FIPA_HOMEPAGE_OVERVIEW}\n\n`;

          const topMatched = [relevantPost, ...extraContextPosts].filter(Boolean);
          if (topMatched.length > 0) {
            contextText += `[질문과 연관된 공단 소식 상세]\n` + topMatched
              .map((p, idx) => `${idx + 1}. [${p.boardName} | ${p.registeredDate}] ${p.title}\n- 요약: ${p.summary}\n- 쉬운 설명: ${p.easyExplanation}\n- 원문 발췌: ${(p.rawContent || '').slice(0, 700)}`)
              .join('\n\n');
            contextText += '\n\n';
          }

          const latestCatalog = allPosts.slice(0, 15)
            .map((p, idx) => `${idx + 1}. [${p.boardName} | ${p.registeredDate}] ${p.title} — ${(p.summary || '').slice(0, 110)}`)
            .join('\n');
          contextText += `[최신 공단 홈페이지 소식 전체 목록 (총 ${allPosts.length}건 중 최신 ${Math.min(allPosts.length, 15)}건)]\n${latestCatalog}`;
        } else {
          contextText = relevantPost
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
        }

        const userPrompt = `[질문자 질문]\n${trimmedQuestion}\n\n${contextText}`;
        const maxTokens = isGeneralMode ? 550 : 450;

        let response;
        try {
          response = await openai.chat.completions.create({
            model: cfg.modelName,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: maxTokens,
          });
        } catch (mErr: any) {
          // 모델명 오류(404/400/model_not_found)인 경우에만 대체 모델로 1회 재시도
          const isModelIssue =
            mErr?.status === 404 || mErr?.status === 400 || mErr?.code === 'model_not_found';
          if (!isModelIssue) {
            throw mErr;
          }
          const fallbackModel = cfg.modelName === 'gpt-4o-mini' ? 'gpt-4o' : 'gpt-4o-mini';
          response = await openai.chat.completions.create({
            model: fallbackModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: maxTokens,
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
          vercelEnv: cfg.vercelEnv,
          hasOpenAiApiKey: cfg.hasOpenAiApiKey,
          isOpenAiApiKeyEmpty: cfg.isOpenAiApiKeyEmpty,
          status: classified.status,
          httpStatus: classified.httpStatus,
          errorCode: classified.errorCode,
          hasOpenAiModel: cfg.hasOpenAiModel,
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
        answer = '한국어촌어항공단(FiPA)은 어촌·어항 개발과 관리, 어촌신활력증진사업, 어촌관광(바다여행), 귀어귀촌 종합지원(1899-9597), 수산공익직불제 의무교육(1600-3256) 등을 수행하는 공공기관입니다. 더 자세한 내용은 공단 홈페이지(https://www.fipa.or.kr)에서 확인하실 수 있습니다.';
        voiceScript = answer;
      }
      isDemo = true;
    }

    // 질의응답 이력 로깅 (Prisma & Firestore 양방향 안전 저장)
    try {
      await prisma.qnaInteraction.create({
        data: {
          postId: isGeneralMode ? (relevantPost?.id || null) : (relevantPost?.id || null),
          postTitle: isGeneralMode ? (relevantPost ? `[전체질문] ${relevantPost.title}` : '[전체질문] 공단 종합 안내') : (relevantPost?.title || null),
          question: trimmedQuestion,
          answer,
        },
      });
    } catch {}

    try {
      await saveQnaToFirestore(
        trimmedQuestion,
        answer,
        relevantPost?.id,
        isGeneralMode ? (relevantPost ? `[전체질문] ${relevantPost.title}` : '[전체질문] 공단 종합 안내') : relevantPost?.title
      );
    } catch {}

    const relatedPosts = matchedPostsForResponse.map(p => ({
      id: p.id,
      title: p.title,
      boardName: p.boardName,
      registeredDate: p.registeredDate,
    }));

    // 보안 원칙: 내부 환경변수/실행환경 진단 정보는 Firebase 인증된 사용자(관리자)에게만 반환
    return NextResponse.json(
      {
        success: true,
        answer,
        voiceScript,
        isDemo,
        scope: isGeneralMode ? 'ALL' : 'POST',
        relevantPost: relevantPost ? { id: relevantPost.id, title: relevantPost.title } : null,
        relatedPosts,
        ...(authResult.isValid ? { diagnostics: diagnosticInfo } : {}),
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

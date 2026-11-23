import * as cheerio from 'cheerio';
import crypto from 'crypto';
import prisma from './prisma';
import { transformContentWithOpenAI } from './ai-pipeline';
import { isFirebaseConfigured } from './firebase';
import {
  getFirestorePosts,
  savePostToFirestore,
  saveSyncLogToFirestore,
} from './firestore-service';

export interface BoardDefinition {
  boardType: 'PRESS' | 'CARD_NEWS' | 'NOTICE' | 'RECRUIT';
  boardName: string;
  boardId: string;
  listUrl: string;
}

export const TARGET_BOARDS: BoardDefinition[] = [
  {
    boardType: 'PRESS',
    boardName: '보도자료',
    boardId: 'i-171',
    listUrl: 'https://www.fipa.or.kr/fipa/bbs/i-171/list.do',
  },
  {
    boardType: 'NOTICE',
    boardName: '공지사항',
    boardId: 'i-167',
    listUrl: 'https://www.fipa.or.kr/fipa/bbs/i-167/list.do',
  },
  {
    boardType: 'RECRUIT',
    boardName: '공고/공모',
    boardId: 'i-326',
    listUrl: 'https://www.fipa.or.kr/fipa/bbs/i-326/list.do',
  },
];

export interface ScrapedListItem {
  boardId: string;
  nttSn: string;
  title: string;
  registeredDate: string;
  thumbnailUrl: string | null;
  detailUrl: string;
}

export interface ScrapedAttachment {
  name: string;
  url: string;
  ext: string;
  isSupported: boolean;
  note: string;
}

export interface ScrapedPostDetail {
  title: string;
  registeredDate: string;
  views: number;
  author: string;
  attachments: ScrapedAttachment[];
  cardImages: string[];
  rawHtml: string;
  textContent: string;
}

/**
 * 향후 공식 API 도입 시 교체 가능한 데이터 공급자 추상 인터페이스
 */
export interface ContentProvider {
  fetchBoardList(board: BoardDefinition): Promise<ScrapedListItem[]>;
  fetchPostDetail(board: BoardDefinition, nttSn: string): Promise<ScrapedPostDetail>;
}

/**
 * SSRF 방지 검증: 오직 한국어촌어항공단 공식 도메인(www.fipa.or.kr)만 허용
 */
export function validateSafeUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`지원하지 않는 프로토콜: ${parsed.protocol}`);
    }
    if (parsed.hostname !== 'www.fipa.or.kr' && parsed.hostname !== 'fipa.or.kr') {
      throw new Error(`허용되지 않은 외부 호스트(SSRF 차단): ${parsed.hostname}`);
    }
    return parsed.href;
  } catch (err: any) {
    throw new Error(`유효하지 않거나 안전하지 않은 URL입니다: ${err.message}`);
  }
}

/**
 * 지수 백오프 및 에러 재시도 fetch 래퍼
 */
async function fetchWithRetry(url: string, maxRetries = 3, baseDelayMs = 600): Promise<string> {
  const safeUrl = validateSafeUrl(url);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(safeUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 FiPADeullyeodeurim/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`HTTP 상태 코드 오류: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      return html;
    } catch (error: any) {
      if (attempt === maxRetries) {
        throw new Error(`[${maxRetries}회 재시도 실패] URL: ${safeUrl}, 사유: ${error.message}`);
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw new Error('요청 실패');
}

/**
 * 공식 홈페이지의 공개 HTML을 분석하는 서버 측 수집기 구현체
 */
export class FipaHtmlScraper implements ContentProvider {
  /**
   * 게시판 목록 파싱
   */
  async fetchBoardList(board: BoardDefinition): Promise<ScrapedListItem[]> {
    const html = await fetchWithRetry(board.listUrl);
    const $ = cheerio.load(html);
    const items: ScrapedListItem[] = [];

    if (board.boardType === 'CARD_NEWS') {
      // 카드뉴스 (list_pic_news 형태)
      $('.list_pic_news li').each((_, el) => {
        const $li = $(el);
        const link = $li.find('.tit a').attr('href') || '';
        const match = link.match(/ntt_sn=(\d+)/);
        if (!match) return;
        const nttSn = match[1];
        const title = $li.find('.tit a').text().trim().replace(/\s+/g, ' ');
        const imgSrc = $li.find('.img img').attr('src') || '';
        const regDate = $li.find('.info .time').text().trim();

        items.push({
          boardId: board.boardId,
          nttSn,
          title,
          registeredDate: regDate,
          thumbnailUrl: imgSrc ? (imgSrc.startsWith('http') ? imgSrc : `https://www.fipa.or.kr${imgSrc}`) : null,
          detailUrl: `https://www.fipa.or.kr/fipa/bbs/${board.boardId}/detail.do?ntt_sn=${nttSn}`,
        });
      });
    } else {
      // 보도자료, 공지사항, 공고/공모 (board_box 형태)
      $('.list_board .board_box, .list_card_img .board_box, .board_box').each((_, el) => {
        const $box = $(el);
        const link = $box.find('.tit a').attr('href') || '';
        const match = link.match(/ntt_sn=(\d+)/);
        if (!match) return;
        const nttSn = match[1];
        const title = $box.find('.tit a').text().trim().replace(/\s+/g, ' ');
        const imgSrc = $box.find('.img img').attr('src') || '';
        let regDate = '';

        $box.find('.list_square li').each((_, li) => {
          const txt = $(li).text().trim();
          if (txt.includes('등록일')) {
            regDate = txt.replace(/등록일\s*:\s*/, '').trim();
          }
        });

        items.push({
          boardId: board.boardId,
          nttSn,
          title,
          registeredDate: regDate,
          thumbnailUrl: imgSrc ? (imgSrc.startsWith('http') ? imgSrc : `https://www.fipa.or.kr${imgSrc}`) : null,
          detailUrl: `https://www.fipa.or.kr/fipa/bbs/${board.boardId}/detail.do?ntt_sn=${nttSn}`,
        });
      });
    }

    return items;
  }

  /**
   * 상세 페이지 파싱
   */
  async fetchPostDetail(board: BoardDefinition, nttSn: string): Promise<ScrapedPostDetail> {
    const detailUrl = `https://www.fipa.or.kr/fipa/bbs/${board.boardId}/detail.do?ntt_sn=${nttSn}`;
    const html = await fetchWithRetry(detailUrl);
    const $ = cheerio.load(html);
    const $wrap = $('.view_wrap');

    if ($wrap.length === 0) {
      throw new Error(`상세 페이지의 본문 래퍼(.view_wrap)를 찾을 수 없습니다: ${detailUrl}`);
    }

    // 제목 추출
    const title = $wrap.find('.view_tit strong').text().trim().replace(/\s+/g, ' ') ||
                  $wrap.find('.view_tit .tit strong').text().trim().replace(/\s+/g, ' ');

    // 등록일 및 조회수, 작성자
    let registeredDate = '';
    let views = 0;
    let author = '한국어촌어항공단';

    $wrap.find('.view_tit .list_square li').each((_, li) => {
      const txt = $(li).text().trim();
      if (txt.includes('등록일')) {
        registeredDate = txt.replace(/등록일\s*:\s*/, '').trim();
      } else if (txt.includes('조회수')) {
        const vMatch = txt.match(/\d+/);
        if (vMatch) views = parseInt(vMatch[0], 10);
      } else if (txt.includes('작성자')) {
        author = txt.replace(/작성자\s*:\s*/, '').trim();
      }
    });

    // 첨부파일 추출
    const attachments: ScrapedAttachment[] = [];
    $wrap.find('.view_add_file li').each((_, li) => {
      const $li = $(li);
      const downloadHref = $li.find('a').attr('href') || '';
      const fullText = $li.text().replace(/\[다운로드\]/g, '').trim();
      const extMatch = fullText.match(/\.([a-zA-Z0-9]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : '';
      const isSupported = ['txt', 'pdf'].includes(ext);

      let fullDownloadUrl = '';
      if (downloadHref) {
        if (downloadHref.startsWith('http')) {
          fullDownloadUrl = downloadHref;
        } else {
          fullDownloadUrl = `https://www.fipa.or.kr/fipa/bbs/${board.boardId}/${downloadHref.replace(/^\.\//, '')}`;
        }
      }

      attachments.push({
        name: fullText,
        url: fullDownloadUrl,
        ext,
        isSupported,
        note: isSupported ? '분석 지원 형식' : '첨부파일 분석 미지원 (보안 및 표준 포맷 권장)',
      });
    });

    // 카드뉴스 이미지 및 본문 이미지 추출 (순서 보장)
    const cardImages: string[] = [];
    $wrap.find('.view_con img').each((_, img) => {
      const src = $(img).attr('src') || '';
      if (src && !src.includes('bbs_default_thumbnail')) {
        const fullSrc = src.startsWith('http') ? src : `https://www.fipa.or.kr${src}`;
        if (!cardImages.includes(fullSrc)) {
          cardImages.push(fullSrc);
        }
      }
    });

    // 본문 클린업: 불필요한 스크립트, 스타일, 네비게이션 태그 제거
    const $con = $wrap.find('.view_con').clone();
    $con.find('script, style, iframe, form, noscript, svg, button').remove();
    const rawHtml = $con.html()?.trim() || '';
    const textContent = $con.text().replace(/\s+/g, ' ').trim();

    return {
      title,
      registeredDate,
      views,
      author,
      attachments,
      cardImages,
      rawHtml,
      textContent,
    };
  }
}

/**
 * 단일 게시판 동기화 실행 함수
 */
export async function syncBoard(
  board: BoardDefinition,
  provider: ContentProvider = new FipaHtmlScraper(),
  itemLimit = 10
): Promise<{ found: number; newItems: number; updated: number; failed: number; firestoreSaved: number }> {
  let found = 0;
  let newItems = 0;
  let updated = 0;
  let failed = 0;
  let firestoreSaved = 0;

  try {
    // 1. 기존 저장된 게시물 조회 (Firestore 우선 + Prisma 보조, Vercel 읽기 전용 파일시스템 안전 대응)
    const existingByNttSn = new Map<string, any>();
    const firebaseReady = isFirebaseConfigured();

    if (firebaseReady) {
      try {
        const fsPosts = await getFirestorePosts({ boardType: board.boardType, forAdmin: true });
        for (const p of fsPosts) {
          if (p.nttSn) existingByNttSn.set(String(p.nttSn), p);
        }
      } catch (e: any) {
        console.warn(`[Firestore 기존목록 조회 경고] ${board.boardName}:`, e?.message);
      }
    }

    try {
      const dbPosts = await prisma.post.findMany({ where: { boardId: board.boardId } });
      for (const p of dbPosts) {
        if (p.nttSn && !existingByNttSn.has(String(p.nttSn))) {
          existingByNttSn.set(String(p.nttSn), p);
        }
      }
    } catch {
      // Vercel 서버리스 SQLite 읽기 전용 환경에서는 Prisma 조회 실패 시 무시하고 Firestore 기준으로 진행
    }

    const list = await provider.fetchBoardList(board);
    found = list.length;
    const targetSlice = list.slice(0, itemLimit);

    for (const item of targetSlice) {
      try {
        // 기존 게시물 확인 (Firestore + Prisma 통합 맵)
        const existing = existingByNttSn.get(String(item.nttSn)) || null;

        // 상세 데이터 수집
        const detail = await provider.fetchPostDetail(board, item.nttSn);

        // 컨텐츠 변경 감지용 해시
        const combinedContent = `${detail.title}|${detail.registeredDate}|${detail.textContent}|${detail.cardImages.join(',')}`;
        const contentHash = crypto.createHash('sha256').update(combinedContent).digest('hex');

        const isUnchanged =
          existing &&
          ((existing.contentHash && existing.contentHash === contentHash) ||
            (!existing.contentHash && existing.title === detail.title && existing.registeredDate === (detail.registeredDate || item.registeredDate)));

        if (isUnchanged) {
          // 변경사항 없음: 로컬 Prisma가 쓰기 가능한 경우에만 최종 확인 시각 갱신
          try {
            if (existing.id) {
              await prisma.post.update({
                where: { id: existing.id },
                data: {
                  lastCheckedAt: new Date(),
                  isDeletedOnSource: false,
                },
              });
            }
          } catch {}
          continue;
        }

        // 신규 또는 내용 변경됨: AI 변환 파이프라인 가동
        const aiResult = await transformContentWithOpenAI(
          detail.title,
          detail.textContent,
          board.boardType,
          detail.cardImages.length
        );

        const stableId = existing?.id || `fipa_${board.boardId}_${item.nttSn}`;
        // 관리자가 명시적으로 숨김/거부 처리한 기존 글이 아니라면 자동 발행하여 메인에 즉시 반영
        const preservedHidden =
          existing?.inspectionStatus === 'UNPUBLISHED' || existing?.inspectionStatus === 'REJECTED';
        const resolvedStatus = preservedHidden ? existing.inspectionStatus : 'AUTO_PUBLISHED';

        const nowIso = new Date().toISOString();
        const postPayload = {
          id: stableId,
          boardType: board.boardType,
          boardName: board.boardName,
          boardId: board.boardId,
          nttSn: item.nttSn,
          title: detail.title,
          registeredDate: detail.registeredDate || item.registeredDate,
          views: detail.views,
          author: detail.author,
          originalUrl: item.detailUrl,
          thumbnailUrl: item.thumbnailUrl || detail.cardImages[0] || null,
          cardImages: JSON.stringify(detail.cardImages),
          attachments: JSON.stringify(detail.attachments),
          rawContent: detail.textContent,
          summary: aiResult.summary,
          easyExplanation: aiResult.easyExplanation,
          voiceScript: aiResult.voiceScript,
          qnaPairs: JSON.stringify(aiResult.qnaPairs),
          contentHash,
          isSafetyOrPolicy: aiResult.isSafetyOrPolicy,
          policyKeywords: aiResult.policyKeywords.join(', '),
          inspectionStatus: resolvedStatus,
          aiModelUsed: aiResult.aiModelUsed,
          isDemo: aiResult.isDemo,
          isDeletedOnSource: false,
          lastCheckedAt: nowIso,
        };

        // 2. Firebase Firestore 영구 저장 (Vercel 운영 환경 핵심 저장소)
        if (firebaseReady) {
          const saved = await savePostToFirestore(postPayload);
          if (saved) firestoreSaved++;
        }

        // 3. 로컬 SQLite(Prisma) 동기화 (Vercel 서버리스에서는 읽기 전용일 수 있으므로 비치명적 처리)
        try {
          const { id: _ignoreId, lastCheckedAt: _ignoreTs, ...prismaData } = postPayload;
          await prisma.post.upsert({
            where: {
              boardId_nttSn: {
                boardId: board.boardId,
                nttSn: item.nttSn,
              },
            },
            update: {
              ...prismaData,
              lastCheckedAt: new Date(),
            },
            create: {
              ...prismaData,
              lastCheckedAt: new Date(),
            },
          });
        } catch {
          // Vercel 읽기 전용 SQLite 환경 무시 (Firestore 저장 완료)
        }

        if (existing) {
          updated++;
        } else {
          newItems++;
        }

        // 공단 서버 부하 방지를 위한 정중한 지연(250ms)
        await new Promise(r => setTimeout(r, 250));
      } catch (err: any) {
        console.error(`[동기화 오류] ${board.boardName} ntt_sn=${item.nttSn}:`, err.message);
        failed++;
      }
    }
  } catch (err: any) {
    console.error(`[게시판 목록 수집 실패] ${board.boardName}:`, err.message);
    throw err;
  }

  return { found, newItems, updated, failed, firestoreSaved };
}

/**
 * 전체 3개 활성 게시판 통합 동기화 (보도자료/공지사항/공고·공모)
 * - Firestore 우선 영구 저장 + 로컬 Prisma 보조 저장 (Vercel 서버리스 완벽 호환)
 */
export async function syncAllBoards(itemLimit = 5, triggerSource = 'MANUAL') {
  const startedAt = new Date();
  let prismaLogId: number | null = null;

  try {
    const log = await prisma.syncLog.create({
      data: {
        boardId: 'ALL',
        boardName: '전체 공단 게시판 (보도자료/공지사항/공고·공모)',
        status: 'RUNNING',
        startedAt,
      },
    });
    prismaLogId = log.id;
  } catch {
    // Vercel 서버리스 읽기 전용 SQLite 환경에서는 Prisma 로그 생성을 건너뜀
  }

  let totalFound = 0;
  let totalNew = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let totalFirestoreSaved = 0;
  let errorMessage: string | null = null;
  const boardResults: Array<{
    boardName: string;
    found: number;
    newItems: number;
    updated: number;
    failed: number;
  }> = [];

  try {
    for (const board of TARGET_BOARDS) {
      try {
        const res = await syncBoard(board, new FipaHtmlScraper(), itemLimit);
        totalFound += res.found;
        totalNew += res.newItems;
        totalUpdated += res.updated;
        totalFailed += res.failed;
        totalFirestoreSaved += res.firestoreSaved;
        boardResults.push({
          boardName: board.boardName,
          found: res.found,
          newItems: res.newItems,
          updated: res.updated,
          failed: res.failed,
        });
      } catch (e: any) {
        totalFailed++;
        errorMessage = (errorMessage ? errorMessage + '; ' : '') + `[${board.boardName}] ${e.message}`;
      }
    }

    const completedAt = new Date();
    const finalStatus = totalFailed > 0 && totalNew === 0 && totalUpdated === 0 && totalFound === 0 ? 'FAILED' : 'SUCCESS';

    // Firestore 동기화 로그 기록 (운영 대시보드 및 중복 실행 방지용)
    if (isFirebaseConfigured()) {
      await saveSyncLogToFirestore({
        boardId: 'ALL',
        boardName: '전체 공단 게시판 (보도자료/공지사항/공고·공모)',
        status: finalStatus,
        itemsFound: totalFound,
        itemsNew: totalNew,
        itemsUpdated: totalUpdated,
        itemsFailed: totalFailed,
        triggerSource,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        errorMessage,
      });
    }

    if (prismaLogId !== null) {
      try {
        await prisma.syncLog.update({
          where: { id: prismaLogId },
          data: {
            status: finalStatus,
            itemsFound: totalFound,
            itemsNew: totalNew,
            itemsUpdated: totalUpdated,
            itemsFailed: totalFailed,
            errorMessage,
            completedAt,
          },
        });
      } catch {}
    }

    return {
      success: finalStatus === 'SUCCESS',
      status: finalStatus,
      triggerSource,
      totalFound,
      totalNew,
      totalUpdated,
      totalFailed,
      totalFirestoreSaved,
      boardResults,
      errorMessage,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    };
  } catch (err: any) {
    if (isFirebaseConfigured()) {
      await saveSyncLogToFirestore({
        boardId: 'ALL',
        boardName: '전체 공단 게시판 (보도자료/공지사항/공고·공모)',
        status: 'FAILED',
        itemsFound: totalFound,
        itemsNew: totalNew,
        itemsUpdated: totalUpdated,
        itemsFailed: totalFailed + 1,
        triggerSource,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        errorMessage: err.message,
      }).catch(() => {});
    }
    if (prismaLogId !== null) {
      try {
        await prisma.syncLog.update({
          where: { id: prismaLogId },
          data: {
            status: 'FAILED',
            errorMessage: err.message,
            completedAt: new Date(),
          },
        });
      } catch {}
    }
    throw err;
  }
}

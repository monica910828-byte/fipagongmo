import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';
import crypto from 'crypto';

const prisma = new PrismaClient();

const TARGET_BOARDS = [
  {
    boardType: 'PRESS',
    boardName: '보도자료',
    boardId: 'i-171',
    listUrl: 'https://www.fipa.or.kr/fipa/bbs/i-171/list.do',
  },
  {
    boardType: 'CARD_NEWS',
    boardName: '카드뉴스',
    boardId: 'i-170',
    listUrl: 'https://www.fipa.or.kr/fipa/bbs/i-170/list.do',
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

const POLICY_KEYWORDS = [
  '의무교육', '법정의무', '수산공익직불제', '직불금', '보조금', '지원금',
  '신청자격', '지급조건', '안전지침', '생명', '재난', '인명피해',
  '마감일', '제출기한', '과태료', '법적책임', '벌칙', '공모접수'
];

function checkSafetyOrPolicy(text, title) {
  const combined = `${title} ${text}`;
  const matched = POLICY_KEYWORDS.filter(kw => combined.includes(kw));
  return {
    isSafetyOrPolicy: matched.length > 0,
    matchedKeywords: matched,
  };
}

function extractKeyFacts(text) {
  const phoneMatches = text.match(/(?:0\d{1,2}-\d{3,4}-\d{4}|1\d{3}-\d{4})/g) || [];
  const dateMatches = text.match(/(?:\d{4}[.\-년]\s*\d{1,2}[.\-월]\s*\d{1,2}[일]?)/g) || [];
  return {
    phones: Array.from(new Set(phoneMatches)),
    dates: Array.from(new Set(dateMatches)),
  };
}

function transformWithRuleEngine(title, rawText, boardType, cardImagesCount = 0) {
  const { isSafetyOrPolicy, matchedKeywords } = checkSafetyOrPolicy(rawText, title);
  const keyFacts = extractKeyFacts(rawText);

  const sentences = rawText
    .replace(/\s+/g, ' ')
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15 && !s.includes('저작권') && !s.includes('무단전재'));

  const leadSentences = sentences.slice(0, 3).join(' ');

  let summary = '';
  let easyExplanation = '';
  let voiceScript = '';

  if (boardType === 'CARD_NEWS') {
    summary = `[카드뉴스] ${title} 소식입니다. 총 ${cardImagesCount}장의 그림과 핵심 안내로 구성되어 있습니다.`;
    easyExplanation = `한국어촌어항공단에서 알기 쉽게 그림으로 전하는 소식입니다.\n\n[소식 안내]\n${title}\n\n어르신들께서 한눈에 이해하실 수 있도록 카드 형태의 시각 자료로 제작되었습니다.\n궁금하신 사항은 화면 아래 음성 안내 버튼을 누르시면 편안하게 들으실 수 있습니다.`;
    voiceScript = `안녕하세요, 한국어촌어항공단 들려드림 카드뉴스 안내입니다. 오늘의 소식은 ${title}입니다. 총 ${cardImagesCount}장의 알기 쉬운 그림 자료로 준비되어 있습니다. 스마트폰 화면을 옆으로 넘기시면서 큰 그림과 함께 내용을 살펴보실 수 있습니다.`;
  } else {
    summary = leadSentences.length > 20 ? leadSentences : `${title}에 대한 한국어촌어항공단의 공지 안내입니다.`;

    let extraInfo = '';
    if (keyFacts.dates.length > 0) {
      extraInfo += `\n• 관련 일정: ${keyFacts.dates.slice(0, 3).join(', ')}`;
    }
    if (keyFacts.phones.length > 0) {
      extraInfo += `\n• 문의 전화: ${keyFacts.phones.slice(0, 2).join(', ')}`;
    }

    easyExplanation = `한국어촌어항공단에서 전해드리는 소식입니다.\n\n[핵심 내용]\n${summary}\n${extraInfo}\n\n글자가 작아 읽기 어려우시다면 상단의 큰 음성 듣기 버튼을 누르시면 친절한 목소리로 차근차근 읽어드립니다.`;

    const phoneVoice = keyFacts.phones.length > 0
      ? `문의 사항이 있으시면 전화번호 ${keyFacts.phones[0]} 번으로 연락하시면 친절히 안내받으실 수 있습니다.`
      : '자세한 사항은 공단 홈페이지 또는 담당 부서를 통해 확인하실 수 있습니다.';

    voiceScript = `안녕하세요. 한국어촌어항공단 소식을 들려드립니다. ${title}에 대해 안내해 드리겠습니다. ${summary} ${phoneVoice} 감사합니다.`;
  }

  const qnaPairs = [
    {
      q: '이 소식의 주요 내용은 무엇인가요?',
      a: summary,
    },
  ];

  if (keyFacts.dates.length > 0) {
    qnaPairs.push({
      q: '관련 일정이나 기간은 언제인가요?',
      a: `안내된 관련 일정은 ${keyFacts.dates.join(', ')} 입니다. 정확한 마감 시각은 공단 원문을 참고해 주세요.`,
    });
  }

  if (keyFacts.phones.length > 0) {
    qnaPairs.push({
      q: '어디로 문의해야 하나요?',
      a: `문의 전화는 ${keyFacts.phones.join(', ')} 입니다. 평일 업무시간에 전화하시면 상담원과 연결됩니다.`,
    });
  }

  const inspectionStatus = isSafetyOrPolicy ? 'PENDING_REVIEW' : 'AUTO_PUBLISHED';

  return {
    summary,
    easyExplanation,
    voiceScript,
    qnaPairs,
    isSafetyOrPolicy,
    policyKeywords: matchedKeywords,
    inspectionStatus,
    aiModelUsed: 'demo-rule-engine',
    isDemo: true,
  };
}

async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 FiPADeullyeodeurim/1.0',
        },
      });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      return await response.text();
    } catch (e) {
      if (attempt === maxRetries) throw e;
      await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt - 1)));
    }
  }
}

async function scrapeBoard(board, limit = 5) {
  console.log(`\n[수집 시작] ${board.boardName} (${board.listUrl})`);
  const html = await fetchWithRetry(board.listUrl);
  const $ = cheerio.load(html);
  const items = [];

  if (board.boardType === 'CARD_NEWS') {
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
        nttSn,
        title,
        registeredDate: regDate,
        thumbnailUrl: imgSrc ? (imgSrc.startsWith('http') ? imgSrc : `https://www.fipa.or.kr${imgSrc}`) : null,
        detailUrl: `https://www.fipa.or.kr/fipa/bbs/${board.boardId}/detail.do?ntt_sn=${nttSn}`,
      });
    });
  } else {
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
        nttSn,
        title,
        registeredDate: regDate,
        thumbnailUrl: imgSrc ? (imgSrc.startsWith('http') ? imgSrc : `https://www.fipa.or.kr${imgSrc}`) : null,
        detailUrl: `https://www.fipa.or.kr/fipa/bbs/${board.boardId}/detail.do?ntt_sn=${nttSn}`,
      });
    });
  }

  console.log(`-> 발견된 게시물: ${items.length}개 (상위 ${Math.min(items.length, limit)}개 수집 진행)`);

  let newItems = 0;
  let updated = 0;

  for (const item of items.slice(0, limit)) {
    try {
      const detailHtml = await fetchWithRetry(item.detailUrl);
      const $d = cheerio.load(detailHtml);
      const $wrap = $d('.view_wrap');
      if ($wrap.length === 0) continue;

      const title = $wrap.find('.view_tit strong').text().trim().replace(/\s+/g, ' ') || item.title;
      let regDate = item.registeredDate;
      let views = 0;
      let author = '한국어촌어항공단';

      $wrap.find('.view_tit .list_square li').each((_, li) => {
        const txt = $d(li).text().trim();
        if (txt.includes('등록일')) regDate = txt.replace(/등록일\s*:\s*/, '').trim();
        if (txt.includes('조회수')) {
          const m = txt.match(/\d+/);
          if (m) views = parseInt(m[0], 10);
        }
        if (txt.includes('작성자')) author = txt.replace(/작성자\s*:\s*/, '').trim();
      });

      // 첨부파일
      const attachments = [];
      $wrap.find('.view_add_file li').each((_, li) => {
        const $li = $d(li);
        const downloadHref = $li.find('a').attr('href') || '';
        const fullText = $li.text().replace(/\[다운로드\]/g, '').trim();
        const extMatch = fullText.match(/\.([a-zA-Z0-9]+)$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : '';
        const isSupported = ['txt', 'pdf'].includes(ext);

        let fullDownloadUrl = '';
        if (downloadHref) {
          fullDownloadUrl = downloadHref.startsWith('http')
            ? downloadHref
            : `https://www.fipa.or.kr/fipa/bbs/${board.boardId}/${downloadHref.replace(/^\.\//, '')}`;
        }
        attachments.push({
          name: fullText,
          url: fullDownloadUrl,
          ext,
          isSupported,
          note: isSupported ? '분석 지원 파일' : '첨부파일 분석 미지원 (보안 및 표준 포맷 권장)',
        });
      });

      // 카드뉴스 이미지
      const cardImages = [];
      $wrap.find('.view_con img').each((_, img) => {
        const src = $d(img).attr('src') || '';
        if (src && !src.includes('bbs_default_thumbnail')) {
          const fullSrc = src.startsWith('http') ? src : `https://www.fipa.or.kr${src}`;
          if (!cardImages.includes(fullSrc)) cardImages.push(fullSrc);
        }
      });

      // 본문 정제
      const $con = $wrap.find('.view_con').clone();
      $con.find('script, style, iframe, form, noscript, svg, button').remove();
      const textContent = $con.text().replace(/\s+/g, ' ').trim();

      const combinedContent = `${title}|${regDate}|${textContent}|${cardImages.join(',')}`;
      const contentHash = crypto.createHash('sha256').update(combinedContent).digest('hex');

      const existing = await prisma.post.findUnique({
        where: {
          boardId_nttSn: {
            boardId: board.boardId,
            nttSn: item.nttSn,
          },
        },
      });

      const ai = transformWithRuleEngine(title, textContent, board.boardType, cardImages.length);

      if (existing) {
        if (existing.contentHash === contentHash) {
          await prisma.post.update({
            where: { id: existing.id },
            data: { lastCheckedAt: new Date(), isDeletedOnSource: false },
          });
        } else {
          await prisma.post.update({
            where: { id: existing.id },
            data: {
              title,
              registeredDate: regDate,
              views,
              rawContent: textContent,
              thumbnailUrl: item.thumbnailUrl || cardImages[0] || null,
              cardImages: JSON.stringify(cardImages),
              attachments: JSON.stringify(attachments),
              summary: ai.summary,
              easyExplanation: ai.easyExplanation,
              voiceScript: ai.voiceScript,
              qnaPairs: JSON.stringify(ai.qnaPairs),
              contentHash,
              isSafetyOrPolicy: ai.isSafetyOrPolicy,
              policyKeywords: ai.policyKeywords.join(', '),
              inspectionStatus: ai.isSafetyOrPolicy ? 'PENDING_REVIEW' : existing.inspectionStatus,
              lastCheckedAt: new Date(),
            },
          });
          updated++;
          console.log(`  [갱신] ${item.nttSn}: ${title.substring(0, 30)}...`);
        }
      } else {
        await prisma.post.create({
          data: {
            boardType: board.boardType,
            boardName: board.boardName,
            boardId: board.boardId,
            nttSn: item.nttSn,
            title,
            registeredDate: regDate,
            views,
            author,
            originalUrl: item.detailUrl,
            thumbnailUrl: item.thumbnailUrl || cardImages[0] || null,
            cardImages: JSON.stringify(cardImages),
            attachments: JSON.stringify(attachments),
            rawContent: textContent,
            summary: ai.summary,
            easyExplanation: ai.easyExplanation,
            voiceScript: ai.voiceScript,
            qnaPairs: JSON.stringify(ai.qnaPairs),
            contentHash,
            isSafetyOrPolicy: ai.isSafetyOrPolicy,
            policyKeywords: ai.policyKeywords.join(', '),
            inspectionStatus: ai.inspectionStatus,
            aiModelUsed: ai.aiModelUsed,
            isDemo: ai.isDemo,
            lastCheckedAt: new Date(),
          },
        });
        newItems++;
        console.log(`  [신규 등록] ${item.nttSn}: ${title.substring(0, 30)}... (상태: ${ai.inspectionStatus})`);
      }

      await new Promise(r => setTimeout(r, 400));
    } catch (err) {
      console.error(`  [오류] ${item.nttSn}:`, err.message);
    }
  }

  return { found: items.length, newItems, updated };
}

async function main() {
  console.log('====================================================');
  console.log('   FiPA 들려드림 — 공단 홈페이지 자동 연계 동기화   ');
  console.log('====================================================');

  const log = await prisma.syncLog.create({
    data: {
      boardId: 'ALL',
      boardName: '전체 4대 게시판 동기화',
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  let totalFound = 0;
  let totalNew = 0;
  let totalUpdated = 0;

  for (const board of TARGET_BOARDS) {
    try {
      const res = await scrapeBoard(board, 5);
      totalFound += res.found;
      totalNew += res.newItems;
      totalUpdated += res.updated;
    } catch (e) {
      console.error(`게시판 ${board.boardName} 동기화 실패:`, e.message);
    }
  }

  await prisma.syncLog.update({
    where: { id: log.id },
    data: {
      status: 'SUCCESS',
      itemsFound: totalFound,
      itemsNew: totalNew,
      itemsUpdated: totalUpdated,
      completedAt: new Date(),
    },
  });

  console.log('\n====================================================');
  console.log(`동기화 완료: 발견 ${totalFound}건, 신규 ${totalNew}건, 갱신 ${totalUpdated}건`);
  console.log('====================================================');

  const totalPosts = await prisma.post.count();
  const pendingCount = await prisma.post.count({ where: { inspectionStatus: 'PENDING_REVIEW' } });
  const publishedCount = await prisma.post.count({ where: { inspectionStatus: 'AUTO_PUBLISHED' } });

  console.log(`DB 현황: 총 ${totalPosts}건 (자동발행: ${publishedCount}건, 검수대기: ${pendingCount}건)`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('동기화 치명적 에러:', e);
  await prisma.$disconnect();
  process.exit(1);
});

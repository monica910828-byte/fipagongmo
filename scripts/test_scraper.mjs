import * as cheerio from 'cheerio';
import fs from 'fs';

// Test HTML files we downloaded
const pressListHtml = fs.readFileSync('fipa_press_list.html', 'utf8');
const pressDetailHtml = fs.readFileSync('fipa_detail_10126.html', 'utf8');
const cardListHtml = fs.readFileSync('fipa_card_list.html', 'utf8');
const cardDetailHtml = fs.readFileSync('fipa_card_detail_9176.html', 'utf8');
const noticeListHtml = fs.readFileSync('fipa_notice_list.html', 'utf8');
const recruitListHtml = fs.readFileSync('fipa_recruit_list.html', 'utf8');
const recruitDetailHtml = fs.readFileSync('fipa_recruit_detail_9444.html', 'utf8');

console.log('Testing scrapers on real downloaded HTML...');

// 1. Press List Parser
function parsePressList(html) {
  const $ = cheerio.load(html);
  const items = [];
  $('.list_board .board_box, .list_card_img .board_box').each((_, el) => {
    const $box = $(el);
    const link = $box.find('.tit a').attr('href') || '';
    const match = link.match(/ntt_sn=(\d+)/);
    if (!match) return;
    const nttSn = match[1];
    const title = $box.find('.tit a').text().trim().replace(/\s+/g, ' ');
    const summary = $box.find('.con a').text().trim().replace(/\s+/g, ' ');
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
      summary,
      imgSrc: imgSrc ? (imgSrc.startsWith('http') ? imgSrc : `https://www.fipa.or.kr${imgSrc}`) : null,
      regDate,
      detailUrl: `https://www.fipa.or.kr/fipa/bbs/i-171/detail.do?ntt_sn=${nttSn}`
    });
  });
  return items;
}

const pressItems = parsePressList(pressListHtml);
console.log(`Parsed ${pressItems.length} press releases. Sample:`, pressItems[0]);

// 2. Card News List Parser
function parseCardList(html) {
  const $ = cheerio.load(html);
  const items = [];
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
      imgSrc: imgSrc ? (imgSrc.startsWith('http') ? imgSrc : `https://www.fipa.or.kr${imgSrc}`) : null,
      regDate,
      detailUrl: `https://www.fipa.or.kr/fipa/bbs/i-170/detail.do?ntt_sn=${nttSn}`
    });
  });
  return items;
}

const cardItems = parseCardList(cardListHtml);
console.log(`Parsed ${cardItems.length} card news. Sample:`, cardItems[0]);

// 3. Detail Page Parser (General)
function parseDetailPage(html, boardType) {
  const $ = cheerio.load(html);
  const $wrap = $('.view_wrap');
  if ($wrap.length === 0) return null;

  const title = $wrap.find('.view_tit strong').text().trim().replace(/\s+/g, ' ');
  let regDate = '';
  let views = 0;
  $wrap.find('.view_tit .list_square li').each((_, li) => {
    const txt = $(li).text().trim();
    if (txt.includes('등록일')) {
      regDate = txt.replace(/등록일\s*:\s*/, '').trim();
    } else if (txt.includes('조회수')) {
      const vMatch = txt.match(/\d+/);
      if (vMatch) views = parseInt(vMatch[0], 10);
    }
  });

  // Extract attachments
  const attachments = [];
  $wrap.find('.view_add_file li').each((_, li) => {
    const $li = $(li);
    const downloadHref = $li.find('a').attr('href') || '';
    // text before [다운로드]
    const fullText = $li.text().replace(/\[다운로드\]/g, '').trim();
    const extMatch = fullText.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : '';
    const isSupported = ['txt', 'pdf'].includes(ext);
    attachments.push({
      name: fullText,
      url: downloadHref ? (downloadHref.startsWith('http') ? downloadHref : `https://www.fipa.or.kr/fipa/bbs/i-171/${downloadHref.replace(/^\.\//, '')}`) : '',
      ext,
      isSupported,
      note: isSupported ? '지원 가능 파일' : '첨부파일 분석 미지원 (보안 및 표준 포맷 권장)'
    });
  });

  // Extract card images or body images
  const cardImages = [];
  $wrap.find('.view_con img').each((_, img) => {
    const src = $(img).attr('src') || '';
    if (src) {
      cardImages.push(src.startsWith('http') ? src : `https://www.fipa.or.kr${src}`);
    }
  });

  // Clean body content: remove scripts, styles, iframes, etc.
  const $con = $wrap.find('.view_con').clone();
  $con.find('script, style, iframe, form, noscript').remove();
  const rawHtml = $con.html()?.trim() || '';
  const textContent = $con.text().replace(/\s+/g, ' ').trim();

  return {
    title,
    regDate,
    views,
    attachments,
    cardImages,
    rawHtml,
    textContent
  };
}

const pressDetail = parseDetailPage(pressDetailHtml, 'PRESS');
console.log('Press Detail parsed:');
console.log('Title:', pressDetail.title);
console.log('Date:', pressDetail.regDate);
console.log('Attachments:', pressDetail.attachments);
console.log('Text snippet:', pressDetail.textContent.substring(0, 150));

const cardDetail = parseDetailPage(cardDetailHtml, 'CARD_NEWS');
console.log('Card Detail parsed:');
console.log('Images found:', cardDetail.cardImages.length, cardDetail.cardImages);
console.log('Recruit detail title:', parseDetailPage(recruitDetailHtml, 'RECRUIT').title);

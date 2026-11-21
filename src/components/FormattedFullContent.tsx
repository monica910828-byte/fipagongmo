'use client';

import React from 'react';
import { AlertCircle, ExternalLink, Phone, Mail } from 'lucide-react';

interface FormattedFullContentProps {
  content: string;
  textClass?: string;
  highContrast?: boolean;
}

interface ContentBlock {
  type: 'header' | 'subitem' | 'bullet' | 'notice' | 'press-subtitle' | 'paragraph';
  text: string;
}

export default function FormattedFullContent({
  content,
  textClass = 'text-base',
  highContrast = false,
}: FormattedFullContentProps) {
  if (!content || !content.trim()) {
    return <p className="text-slate-400 font-cute">등록된 상세 내용이 없습니다.</p>;
  }

  // 1. 안전한 기호 단위 줄바꿈 정돈 (문장 끊김 방지 및 온전한 문장 보존)
  let text = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  // (1) 대제목 기호 (■, ◆, ▶, □, ▲, ●, ★, 【) 앞에 빈 줄 추가
  text = text.replace(/([^\n])\s*([■◆▶□▲●★]|【[^】]+】)/g, '$1\n\n$2');

  // (2) 공공기관 특유의 불릿 'ㅇ ' 분리 (반드시 독립된 'ㅇ' 뒤에 공백이 있을 때만 분리)
  text = text.replace(/([^\n])\s+ㅇ\s+/g, '$1\nㅇ ');

  // (3) 참고/유의사항 특수문자 '※' 앞에 줄바꿈
  text = text.replace(/([^\n])\s*※\s*/g, '$1\n\n※ ');

  // (4) 보도자료 부제 형태: 앞뒤 공백과 한글이 포함된 "- 부제 -" 또는 "-- 부제 --"
  text = text.replace(/(^|\n|\s)(-{1,2}\s+[가-힣][가-힣0-9\s·,\/]{3,80}\s+-{1,2})(\s|$)/g, '$1\n\n$2\n\n$3');

  // 2. 줄 단위 분할 및 블록 분류
  const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const blocks: ContentBlock[] = [];

  for (const line of rawLines) {
    // A. 대제목 (■, ◆, ▶, □, ▲, ●, ★, 【...】)
    if (/^[■◆▶□▲●★]/.test(line) || /^【[^】]+】$/.test(line)) {
      const cleanText = line.replace(/^[■◆▶□▲●★【】\s]+/, '').replace(/[【】]/g, '').trim();
      blocks.push({ type: 'header', text: cleanText });
      continue;
    }

    // B. 보도자료 부제 (- 소제목 -)
    if (/^-{1,2}\s+[가-힣].+\s+-{1,2}$/.test(line)) {
      const cleanSub = line.replace(/^-{1,2}\s*/, '').replace(/\s*-{1,2}$/, '').trim();
      blocks.push({ type: 'press-subtitle', text: cleanSub });
      continue;
    }

    // C. 참고 및 유의사항 (※)
    if (/^※/.test(line)) {
      const cleanNotice = line.replace(/^※\s*/, '').trim();
      blocks.push({ type: 'notice', text: cleanNotice });
      continue;
    }

    // D. 세부 항목 ('ㅇ (공모기간)...' 또는 'ㅇ 추진배경...')
    if (/^ㅇ\s+/.test(line)) {
      const cleanSubitem = line.replace(/^ㅇ\s+/, '').trim();
      blocks.push({ type: 'subitem', text: cleanSubitem });
      continue;
    }

    // E. 글머리 기호 (- 내용, * 내용)
    if (/^[-*·•]\s+/.test(line)) {
      const cleanBullet = line.replace(/^[-*·•]\s+/, '').trim();
      blocks.push({ type: 'bullet', text: cleanBullet });
      continue;
    }

    // F. 일반 본문 문단 (보도자료 등 긴 줄글)
    // 250자를 초과하는 긴 줄글의 경우, 마침표 뒤의 온전한 문장 단위로 2~3문장씩 묶어 가독성 극대화
    if (line.length > 250) {
      // 마침표(.), 물음표(?), 느낌표(!) 뒤의 공백을 기준으로 분리하여 문장 끝이 잘리지 않도록 보존
      const sentences = line.split(/(?<=[.!?])\s+(?=[가-힣A-Z“"‘'0-9])/);
      let chunk = '';
      let sentenceCount = 0;

      for (const sent of sentences) {
        if (!chunk) {
          chunk = sent;
          sentenceCount = 1;
        } else if (sentenceCount >= 2 || (chunk + ' ' + sent).length > 220) {
          blocks.push({ type: 'paragraph', text: chunk.trim() });
          chunk = sent;
          sentenceCount = 1;
        } else {
          chunk += ' ' + sent;
          sentenceCount++;
        }
      }
      if (chunk.trim()) {
        blocks.push({ type: 'paragraph', text: chunk.trim() });
      }
    } else {
      blocks.push({
        type: 'paragraph',
        text: line,
      });
    }
  }

  // 3. 인라인 링크(URL, 전화번호, 이메일) 렌더링
  const renderInlineText = (lineText: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const phoneRegex = /(0[0-9]{1,2}-[0-9]{3,4}-[0-9]{4})/g;
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

    const parts = lineText.split(urlRegex);
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-sky-100 text-sky-800 hover:bg-sky-200 hover:text-sky-950 font-bold underline transition-colors break-all mx-1 align-baseline shadow-2xs"
          >
            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{part}</span>
          </a>
        );
      }

      // 전화번호 또는 이메일 검출
      if (phoneRegex.test(part) || emailRegex.test(part)) {
        const subParts = part.split(/(0[0-9]{1,2}-[0-9]{3,4}-[0-9]{4}|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
        return (
          <span key={index}>
            {subParts.map((sub, sIdx) => {
              if (phoneRegex.test(sub)) {
                return (
                  <a
                    key={sIdx}
                    href={`tel:${sub}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 font-bold hover:bg-emerald-200 transition-colors mx-1"
                    title="전화 걸기"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>{sub}</span>
                  </a>
                );
              }
              if (emailRegex.test(sub)) {
                return (
                  <a
                    key={sIdx}
                    href={`mailto:${sub}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-900 font-bold hover:bg-indigo-200 transition-colors mx-1"
                    title="이메일 보내기"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>{sub}</span>
                  </a>
                );
              }
              return <span key={sIdx}>{sub}</span>;
            })}
          </span>
        );
      }

      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className={`space-y-3 font-cute break-keep [overflow-wrap:anywhere] ${textClass}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'header':
            return (
              <div
                key={idx}
                className="mt-6 mb-3 pt-3 border-t-2 border-sky-100 first:mt-0 first:pt-0 first:border-0"
              >
                <div
                  className={`inline-flex flex-wrap items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-2xl shadow-sm text-base md:text-lg font-bold max-w-full ${
                    highContrast
                      ? 'bg-yellow-400 text-black'
                      : 'bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 text-white'
                  }`}
                >
                  <span className="text-amber-200 flex-shrink-0">📌</span>
                  <span className="break-keep [overflow-wrap:anywhere]">{block.text}</span>
                </div>
              </div>
            );

          case 'press-subtitle':
            return (
              <div
                key={idx}
                className={`my-3 p-3 text-center rounded-2xl border font-bold text-base md:text-lg break-keep [overflow-wrap:anywhere] ${
                  highContrast
                    ? 'bg-zinc-900 border-yellow-400 text-yellow-300'
                    : 'bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 border-sky-200 text-blue-950'
                }`}
              >
                <span>{block.text}</span>
              </div>
            );

          case 'subitem': {
            // (공모기간), (신청자격) 등 시작 부분에 괄호 키워드가 있으면 강조 태그로 표시
            const match = block.text.match(/^(\([가-힣A-Za-z0-9\s·\/\-_]+\))\s*(.*)$/);
            const tag = match ? match[1] : null;
            const rest = match ? match[2] : block.text;

            return (
              <div
                key={idx}
                className={`p-3 md:p-3.5 rounded-2xl border flex items-start gap-2 sm:gap-2.5 transition-colors ${
                  highContrast
                    ? 'bg-zinc-900 border-yellow-400/80 text-yellow-100'
                    : 'bg-sky-50/70 border-sky-200/80 hover:bg-sky-50 text-slate-800'
                }`}
              >
                <span className="text-sky-600 font-bold mt-0.5 text-base flex-shrink-0">🔹</span>
                <div className="flex-1 min-w-0 leading-relaxed break-keep [overflow-wrap:anywhere]">
                  {tag && (
                    <strong
                      className={`mr-2 mb-1 font-bold px-2 py-0.5 rounded-lg text-sm md:text-base inline-block ${
                        highContrast
                          ? 'bg-yellow-400 text-black'
                          : 'bg-sky-200/90 text-blue-950 border border-sky-300'
                      }`}
                    >
                      {tag}
                    </strong>
                  )}
                  {renderInlineText(rest)}
                </div>
              </div>
            );
          }

          case 'bullet':
            return (
              <div
                key={idx}
                className={`pl-2.5 sm:pl-3 pr-2 py-1.5 flex items-start gap-2 rounded-xl transition-colors ${
                  highContrast
                    ? 'text-yellow-200 hover:bg-zinc-900'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="text-amber-500 font-bold mt-1 text-sm flex-shrink-0">•</span>
                <div className="flex-1 min-w-0 leading-relaxed break-keep [overflow-wrap:anywhere]">
                  {renderInlineText(block.text)}
                </div>
              </div>
            );

          case 'notice':
            return (
              <div
                key={idx}
                className={`my-3 p-3.5 rounded-2xl border-2 flex items-start gap-2.5 shadow-xs ${
                  highContrast
                    ? 'bg-zinc-900 border-yellow-400 text-yellow-200'
                    : 'bg-amber-50/90 border-amber-300 text-amber-950'
                }`}
              >
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 text-sm md:text-base leading-relaxed break-keep [overflow-wrap:anywhere]">
                  <strong className="text-amber-900 mr-1.5 font-bold">[안내/유의사항]</strong>
                  {renderInlineText(block.text)}
                </div>
              </div>
            );

          case 'paragraph':
          default:
            return (
              <p
                key={idx}
                className={`leading-relaxed break-keep [overflow-wrap:anywhere] my-2.5 ${
                  highContrast ? 'text-yellow-100' : 'text-slate-800'
                }`}
              >
                {renderInlineText(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}

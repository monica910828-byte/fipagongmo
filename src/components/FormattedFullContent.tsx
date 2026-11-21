'use client';

import React from 'react';
import { AlertCircle, ExternalLink, Phone, Mail, ChevronRight, Check } from 'lucide-react';

interface FormattedFullContentProps {
  content: string;
  textClass?: string;
  highContrast?: boolean;
}

interface ContentBlock {
  type: 'header' | 'subitem' | 'bullet' | 'notice' | 'press-subtitle' | 'paragraph';
  text: string;
  badge?: string;
}

export default function FormattedFullContent({
  content,
  textClass = 'text-base',
  highContrast = false,
}: FormattedFullContentProps) {
  if (!content || !content.trim()) {
    return <p className="text-slate-400 font-cute">등록된 상세 내용이 없습니다.</p>;
  }

  // 1. 텍스트 정규화 및 기호 단위 줄바꿈 정돈 (내용 유실 0%)
  let normalized = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // 대제목 기호 앞에 빈 줄 2개 보장 (■, ◆, ▶, □, ▲, ●, 【, [공모, [안내 등)
  normalized = normalized.replace(/([^\n])\s*(■|◆|▶|□|▲|●|【)\s*/g, '$1\n\n$2 ');
  // 번호형 대제목 (1. 사업 개요, 2. 지원 자격 등)
  normalized = normalized.replace(/([^\n])\s*(\b[0-9]{1,2}\.\s+[가-힣A-Za-z])/g, '$1\n\n$2');
  // 세부 항목 기호 앞에 줄바꿈 보장 (ㅇ, ㅁ, 가., 나., 다., 1), 2) 등)
  normalized = normalized.replace(/([^\n])\s*(ㅇ|ㅁ|\([0-9가-힣]+\)|[가-하]\.|\d{1,2}\))\s*/g, '$1\n$2 ');
  // 글머리 기호 (-, *, ·, •)
  normalized = normalized.replace(/([^\n])\s*([·•\*\-]\s+[^\n]+)/g, '$1\n$2');
  // 유의사항 / 주의사항 (※, 주의:, 참고:)
  normalized = normalized.replace(/([^\n])\s*(※\s*)/g, '$1\n\n$2');
  // 보도자료 부제/소제목 형태 (- 부산 동삼... - 또는 -- 수산물... --)
  normalized = normalized.replace(/([^\n])\s*(-{1,2}\s*[가-힣0-9A-Za-z\s·,·]{5,80}\s*-{1,2})/g, '$1\n\n$2\n');

  // 2. 줄 단위 파싱 및 블록 생성
  const rawLines = normalized.split('\n');
  const blocks: ContentBlock[] = [];

  for (let rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;

    // 대제목 패턴
    if (/^[■◆▶□▲●【]/.test(line) || /^\d{1,2}\.\s+[가-힣A-Za-z]/.test(line)) {
      const cleanText = line.replace(/^[■◆▶□▲●【】\s]+/, '').replace(/^(\d{1,2}\.\s*)/, '$1').trim();
      blocks.push({
        type: 'header',
        text: cleanText,
        badge: line.charAt(0) === '■' ? '공단 소식' : line.charAt(0) === '◆' ? '핵심 사항' : '주요 안내',
      });
      continue;
    }

    // 보도자료 부제 형태 (- 소제목 -)
    if (/^-{1,2}\s*.+\s*-{1,2}$/.test(line)) {
      blocks.push({
        type: 'press-subtitle',
        text: line.replace(/^-{1,2}\s*/, '').replace(/\s*-{1,2}$/, '').trim(),
      });
      continue;
    }

    // 유의사항 / 참고 (※)
    if (/^※/.test(line) || /^!/.test(line) || /^주의:/.test(line) || /^참고:/.test(line)) {
      blocks.push({
        type: 'notice',
        text: line.replace(/^※\s*/, '').replace(/^!\s*/, '').trim(),
      });
      continue;
    }

    // 세부 항목 (ㅇ, ㅁ, 가., 나., 1), 2))
    if (/^(ㅇ|ㅁ|\([0-9가-힣]+\)|[가-하]\.|\d{1,2}\))/.test(line)) {
      blocks.push({
        type: 'subitem',
        text: line,
      });
      continue;
    }

    // 글머리 기호 (-, *, ·, •)
    if (/^[-*·•]/.test(line)) {
      blocks.push({
        type: 'bullet',
        text: line.replace(/^[-*·•]\s*/, '').trim(),
      });
      continue;
    }

    // 일반 설명 문단
    // 만약 문장이 너무 길다면(250자 초과), 자연스러운 마침표 단위로 2~3문장씩 나눠서 가독성 극대화
    if (line.length > 250) {
      const sentenceParts = line.split(/(?<=[.!?다함음요오])\s+(?=[가-힣A-Z“"‘'0-9])/);
      let currentChunk = '';
      for (const sent of sentenceParts) {
        if ((currentChunk + ' ' + sent).length > 220 && currentChunk) {
          blocks.push({ type: 'paragraph', text: currentChunk.trim() });
          currentChunk = sent;
        } else {
          currentChunk = currentChunk ? `${currentChunk} ${sent}` : sent;
        }
      }
      if (currentChunk.trim()) {
        blocks.push({ type: 'paragraph', text: currentChunk.trim() });
      }
    } else {
      blocks.push({
        type: 'paragraph',
        text: line,
      });
    }
  }

  // 3. 인라인 텍스트 렌더링 (URL 링크, 이메일, 전화번호, 괄호 강조)
  const renderInlineText = (text: string) => {
    // URL 매칭 정규식
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    // 이메일 정규식
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    // 전화번호 정규식 (02-XXXX-XXXX, 010-XXXX-XXXX 등)
    const phoneRegex = /(0[0-9]{1,2}-[0-9]{3,4}-[0-9]{4})/g;

    // 괄호 안의 핵심 항목 (예: (공모기간), (신청자격), (ESG 분야))
    const itemTagRegex = /(ㅇ\s*)?(\([가-힣A-Za-z0-9\s·\/\-_]+\))/;

    // 분할 토큰 처리
    const parts = text.split(urlRegex);
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-sky-100 text-sky-800 hover:bg-sky-200 hover:text-sky-950 font-bold underline transition-colors break-all mx-1 align-baseline shadow-xs"
          >
            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{part}</span>
          </a>
        );
      }

      // 전화번호 또는 이메일 포함 확인
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

              // 괄호 항목 볼드 처리
              return renderBracketHighlight(sub, sIdx);
            })}
          </span>
        );
      }

      return renderBracketHighlight(part, index);
    });
  };

  const renderBracketHighlight = (text: string, key: string | number) => {
    // (공모기간), (접수방법) 등의 키워드에 볼드 & 하이라이트
    const segments = text.split(/(\([가-힣A-Za-z0-9\s·\/\-_]{2,15}\))/g);
    if (segments.length <= 1) {
      return <span key={key}>{text}</span>;
    }
    return (
      <span key={key}>
        {segments.map((seg, i) => {
          if (/^\([가-힣A-Za-z0-9\s·\/\-_]{2,15}\)$/.test(seg)) {
            return (
              <strong
                key={i}
                className={highContrast ? 'text-yellow-300 font-black' : 'text-blue-900 font-bold bg-sky-100/70 px-1.5 py-0.5 rounded'}
              >
                {seg}
              </strong>
            );
          }
          return <span key={i}>{seg}</span>;
        })}
      </span>
    );
  };

  return (
    <div className={`space-y-3 font-cute ${textClass}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'header':
            return (
              <div
                key={idx}
                className="mt-6 mb-3 pt-3 border-t-2 border-sky-100 first:mt-0 first:pt-0 first:border-0"
              >
                <div
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-2xl shadow-sm text-base md:text-lg font-bold ${
                    highContrast
                      ? 'bg-yellow-400 text-black'
                      : 'bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 text-white'
                  }`}
                >
                  <span className="text-amber-200">📌</span>
                  <span>{block.text}</span>
                </div>
              </div>
            );

          case 'press-subtitle':
            return (
              <div
                key={idx}
                className={`my-3 p-3 text-center rounded-2xl border font-bold text-base md:text-lg ${
                  highContrast
                    ? 'bg-zinc-900 border-yellow-400 text-yellow-300'
                    : 'bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 border-sky-200 text-blue-950'
                }`}
              >
                <span>{block.text}</span>
              </div>
            );

          case 'subitem':
            return (
              <div
                key={idx}
                className={`p-3 md:p-3.5 rounded-2xl border flex items-start gap-2.5 transition-colors ${
                  highContrast
                    ? 'bg-zinc-900 border-yellow-400/80 text-yellow-100'
                    : 'bg-sky-50/70 border-sky-200/80 hover:bg-sky-50 text-slate-800'
                }`}
              >
                <span className="text-sky-600 font-bold mt-0.5 text-base flex-shrink-0">🔹</span>
                <div className="flex-1 leading-relaxed break-words">
                  {renderInlineText(block.text)}
                </div>
              </div>
            );

          case 'bullet':
            return (
              <div
                key={idx}
                className={`pl-3 pr-2 py-1.5 flex items-start gap-2 rounded-xl transition-colors ${
                  highContrast
                    ? 'text-yellow-200 hover:bg-zinc-900'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="text-amber-500 font-bold mt-1 text-sm">•</span>
                <div className="flex-1 leading-relaxed break-words">
                  {renderInlineText(block.text)}
                </div>
              </div>
            );

          case 'notice':
            return (
              <div
                key={idx}
                className={`my-2 p-3.5 rounded-2xl border-2 flex items-start gap-2.5 shadow-xs ${
                  highContrast
                    ? 'bg-zinc-900 border-yellow-400 text-yellow-200'
                    : 'bg-amber-50/90 border-amber-300 text-amber-950'
                }`}
              >
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-sm md:text-base leading-relaxed break-words">
                  <strong className="text-amber-900 mr-1.5 font-bold">[유의사항]</strong>
                  {renderInlineText(block.text)}
                </div>
              </div>
            );

          case 'paragraph':
          default:
            return (
              <p
                key={idx}
                className={`leading-relaxed break-words ${
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

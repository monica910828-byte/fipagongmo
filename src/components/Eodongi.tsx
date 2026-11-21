'use client';

import React from 'react';

export type EodongiPose = 'greeting' | 'reading' | 'listening' | 'searching' | 'happy' | 'mini' | 'safety' | 'heart';

interface EodongiProps {
  pose?: EodongiPose;
  size?: number;
  className?: string;
  speechText?: string;
  showSparkle?: boolean;
}

// 각 포즈별 귀여운 장식 뱃지/이모지
const POSE_BADGES: Record<EodongiPose, { emoji: string; bg: string; title: string }> = {
  greeting: { emoji: '👋', bg: 'bg-amber-300', title: '안녕!' },
  happy: { emoji: '✨', bg: 'bg-pink-300', title: '반가워!' },
  reading: { emoji: '📢', bg: 'bg-sky-300', title: '읽어줄게!' },
  listening: { emoji: '👂', bg: 'bg-emerald-300', title: '말해줘!' },
  safety: { emoji: '🛡️', bg: 'bg-blue-300', title: '안전제일' },
  searching: { emoji: '🔍', bg: 'bg-indigo-300', title: '찾는 중' },
  mini: { emoji: '🐚', bg: 'bg-amber-200', title: '어동이' },
  heart: { emoji: '💖', bg: 'bg-rose-300', title: '사랑해' },
};

export default function Eodongi({
  pose = 'greeting',
  size = 110,
  className = '',
  speechText,
  showSparkle = true,
}: EodongiProps) {
  const badge = POSE_BADGES[pose] || POSE_BADGES.greeting;

  return (
    <div className={`inline-flex flex-col items-center select-none relative group ${className}`}>
      {/* 아기자기한 말풍선 */}
      {speechText && (
        <div className="relative mb-2 px-3.5 py-1.5 bg-white text-blue-950 font-cute text-sm md:text-base rounded-2xl shadow-md border-2 border-sky-300 animate-cute-bounce">
          <span className="flex items-center gap-1">
            <span>{speechText}</span>
          </span>
          {/* 말풍선 꼬리 */}
          <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-0 h-0 border-x-6 border-x-transparent border-t-8 border-t-white" />
          <div className="absolute left-1/2 -bottom-2.5 -translate-x-1/2 -z-10 w-0 h-0 border-x-7 border-x-transparent border-t-8 border-t-sky-300" />
        </div>
      )}

      {/* 공식 마스코트 캐릭터 컨테이너 */}
      <div
        className="relative flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
        style={{ width: size, height: size }}
      >
        {/* 귀여운 파스텔 후광 효과 */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-sky-200/60 via-amber-100/50 to-pink-200/60 blur-md transform scale-95 group-hover:scale-110 transition-transform" />

        {/* 공식 캐릭터 이미지 (소라 모자 + 불가사리 + 파도 앞머리 + 나뭇잎 망토 + 공단 로고 수영복) */}
        <img
          src="/eodongi_official.png"
          alt="한국어촌어항공단 공식 마스코트 어동이"
          className="relative z-10 w-full h-full object-contain filter drop-shadow-md"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = '/eodongi.png';
          }}
        />

        {/* 포즈별 미니 귀요미 뱃지 */}
        <span className={`absolute -bottom-1 -right-1 z-20 ${badge.bg} text-blue-950 text-xs px-1.5 py-0.5 rounded-full shadow-md font-cute border border-white flex items-center justify-center animate-bounce`}>
          {badge.emoji}
        </span>

        {/* 아기자기한 반짝이 효과 */}
        {showSparkle && (
          <>
            <span className="absolute -top-1.5 -right-1.5 text-base animate-pulse z-20">✨</span>
            <span className="absolute -top-1 -left-1 text-xs animate-bounce z-20 text-amber-400">⭐</span>
          </>
        )}
      </div>
    </div>
  );
}

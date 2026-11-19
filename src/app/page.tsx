'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2, VolumeX, Play, Pause, RotateCcw, Search,
  ExternalLink, Mic, MicOff, Send, QrCode,
  CheckCircle, ChevronLeft, ChevronRight, X, AlertCircle, Sparkles, Sliders
} from 'lucide-react';

interface Post {
  id: string;
  boardType: string;
  boardName: string;
  boardId: string;
  nttSn: string;
  title: string;
  registeredDate: string;
  views: number;
  author?: string;
  originalUrl: string;
  thumbnailUrl?: string | null;
  cardImages?: string | null;
  attachments?: string | null;
  summary: string;
  easyExplanation: string;
  voiceScript: string;
  qnaPairs?: string | null;
  isSafetyOrPolicy: boolean;
  policyKeywords?: string | null;
  inspectionStatus: string;
  aiModelUsed: string;
  isDemo: boolean;
}

export default function SeniorHomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBoard, setSelectedBoard] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // 접근성 설정 (고령자 맞춤)
  const [fontSizeLevel, setFontSizeLevel] = useState<'normal' | 'large' | 'xlarge'>('large');
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [highContrast, setHighContrast] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  // 상세 모달 및 오디오 재생 상태
  const [activePost, setActivePost] = useState<Post | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  // 음성/텍스트 질의응답
  const [userQuestion, setUserQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<{ text: string; voiceScript: string; isDemo: boolean } | null>(null);

  // 브라우저 TTS SpeechSynthesis 관리
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }
    loadPosts();
    loadQrCode();

    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  async function loadPosts() {
    setLoading(true);
    try {
      const res = await fetch('/api/posts');
      const data = await res.json();
      if (data.success) {
        setPosts(data.posts);
      }
    } catch (e) {
      console.error('게시물 조회 오류:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadQrCode() {
    try {
      const currentUrl = typeof window !== 'undefined' ? window.location.href : 'https://www.fipa.or.kr';
      const res = await fetch(`/api/qrcode?url=${encodeURIComponent(currentUrl)}`);
      const data = await res.json();
      if (data.success) {
        setQrDataUrl(data.qrDataUrl);
      }
    } catch (e) {
      console.error('QR 코드 생성 오류:', e);
    }
  }

  // TTS 음성 재생 함수
  function playVoice(textToSpeak: string) {
    if (!synthRef.current) {
      alert('사용하시는 기기에서 브라우저 음성 안내(TTS)를 지원하지 않습니다.');
      return;
    }

    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'ko-KR';
    utterance.rate = speechRate;
    utterance.pitch = 1.0;

    // 한국어 음성 탐색
    const voices = synthRef.current.getVoices();
    const koreanVoice = voices.find(v => v.lang.includes('ko') || v.lang.includes('KO'));
    if (koreanVoice) {
      utterance.voice = koreanVoice;
    }

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);

    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  }

  function stopVoice() {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsPlaying(false);
    }
  }

  function toggleVoice(textToSpeak: string) {
    if (isPlaying) {
      stopVoice();
    } else {
      playVoice(textToSpeak);
    }
  }

  // 음성 인식 (STT) 시작
  function startVoiceRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('음성 인식을 지원하지 않는 브라우저입니다. 텍스트 입력창을 이용해 주세요.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setUserQuestion(transcript);
      setIsListening(false);
      handleAskQuestion(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  }

  // 질문 전송 처리
  async function handleAskQuestion(query?: string) {
    const q = (query || userQuestion).trim();
    if (!q) return;

    setIsAsking(true);
    setAiAnswer(null);

    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          postId: activePost?.id || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAiAnswer({
          text: data.answer,
          voiceScript: data.voiceScript,
          isDemo: data.isDemo,
        });
        // 답변 자동 음성 출력
        playVoice(data.voiceScript);
      } else {
        alert(data.error || '답변을 불러오지 못했습니다.');
      }
    } catch (e) {
      console.error('질문 전송 오류:', e);
    } finally {
      setIsAsking(false);
    }
  }

  // 글자 크기 클래스 매핑
  const textClass = {
    normal: 'font-normal-senior',
    large: 'font-large-senior',
    xlarge: 'font-xlarge-senior',
  }[fontSizeLevel];

  // 필터링된 게시물
  const filteredPosts = posts.filter(post => {
    const matchesBoard = selectedBoard === 'ALL' || post.boardType === selectedBoard;
    const matchesSearch = !searchQuery.trim() ||
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.summary.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesBoard && matchesSearch;
  });

  return (
    <div className={`min-h-screen ${highContrast ? 'bg-black text-yellow-300' : 'bg-[#F4F7FB] text-slate-900'} pb-24 transition-colors`}>
      {/* 1. 상단 접근성 및 안내 헤더 */}
      <header className={`${highContrast ? 'bg-zinc-900 border-b-4 border-yellow-400' : 'bg-[#0A4E9B] text-white shadow-md'} sticky top-0 z-40 transition-colors`}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-lg p-1.5 shadow-sm">
              <span className="text-[#0A4E9B] font-black text-xl tracking-tight">FiPA</span>
            </div>
            <div>
              <h1 className="font-extrabold text-xl md:text-2xl tracking-tight flex items-center gap-1.5">
                <span>들려드림</span>
                <span className="text-xs bg-yellow-400 text-blue-950 font-bold px-2 py-0.5 rounded-full ml-1">쉬운 음성안내</span>
              </h1>
              <p className="text-xs opacity-90">한국어촌어항공단 소식 음성지원</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQrModal(true)}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1 border border-white/20 transition-all"
              title="스마트폰으로 보기 (QR코드)"
            >
              <QrCode className="w-4 h-4" />
              <span className="hidden sm:inline">스마트폰 보기</span>
            </button>
            <a
              href="/admin"
              className="px-2.5 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-blue-950 text-xs font-black shadow transition-all"
            >
              관리자
            </a>
          </div>
        </div>

        {/* 2. 고령자 전용 편의 조절 바 (글자 크기, 소리 속도, 고대비) */}
        <div className={`${highContrast ? 'bg-zinc-950 border-t border-yellow-400/50' : 'bg-[#063266] text-white/95'} px-4 py-2 border-t border-white/10`}>
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs md:text-sm">
            {/* 글자 크기 */}
            <div className="flex items-center gap-1.5">
              <span className="font-bold mr-1">글자 크기:</span>
              <button
                onClick={() => setFontSizeLevel('normal')}
                className={`px-2.5 py-1 rounded font-bold transition-all ${fontSizeLevel === 'normal' ? 'bg-yellow-400 text-blue-950 ring-2 ring-white' : 'bg-white/15 hover:bg-white/25'}`}
              >
                보통
              </button>
              <button
                onClick={() => setFontSizeLevel('large')}
                className={`px-2.5 py-1 rounded font-bold transition-all ${fontSizeLevel === 'large' ? 'bg-yellow-400 text-blue-950 ring-2 ring-white' : 'bg-white/15 hover:bg-white/25'}`}
              >
                크게
              </button>
              <button
                onClick={() => setFontSizeLevel('xlarge')}
                className={`px-2.5 py-1 rounded font-bold transition-all ${fontSizeLevel === 'xlarge' ? 'bg-yellow-400 text-blue-950 ring-2 ring-white' : 'bg-white/15 hover:bg-white/25'}`}
              >
                아주 크게
              </button>
            </div>

            {/* 음성 속도 & 고대비 */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="font-bold mr-1">음성 속도:</span>
                <button
                  onClick={() => setSpeechRate(0.8)}
                  className={`px-2 py-1 rounded font-bold transition-all ${speechRate === 0.8 ? 'bg-yellow-400 text-blue-950' : 'bg-white/15'}`}
                >
                  느리게
                </button>
                <button
                  onClick={() => setSpeechRate(1.0)}
                  className={`px-2 py-1 rounded font-bold transition-all ${speechRate === 1.0 ? 'bg-yellow-400 text-blue-950' : 'bg-white/15'}`}
                >
                  보통
                </button>
              </div>

              <button
                onClick={() => setHighContrast(!highContrast)}
                className={`px-2.5 py-1 rounded font-black border transition-all ${highContrast ? 'bg-yellow-400 text-black border-yellow-300' : 'bg-white/15 border-white/30'}`}
              >
                {highContrast ? '고대비 해제' : '고대비 켜기'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 컨테이너 */}
      <main className="max-w-4xl mx-auto px-4 pt-4">
        {/* 안내 배너 */}
        <div className={`mb-4 p-4 rounded-2xl ${highContrast ? 'bg-zinc-900 border-2 border-yellow-400' : 'bg-white border border-blue-100 shadow-sm'} flex items-start gap-3`}>
          <div className="p-2.5 bg-blue-100 text-[#0A4E9B] rounded-xl font-bold flex-shrink-0">
            <Volume2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-base md:text-lg mb-1">
              어르신을 위한 편안한 소식 안내
            </h2>
            <p className="text-sm opacity-80 leading-relaxed">
              공단 홈페이지에 새 소식이 올라오면 <strong>담당자가 별도로 등록하지 않아도 자동으로 수집</strong>되어 큰 글씨와 쉬운 음성으로 들려드립니다.
            </p>
          </div>
        </div>

        {/* 3. 소식 게시판 선택 탭 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none mb-4">
          {[
            { id: 'ALL', name: '전체 소식' },
            { id: 'PRESS', name: '보도자료' },
            { id: 'CARD_NEWS', name: '카드뉴스' },
            { id: 'NOTICE', name: '공지사항' },
            { id: 'RECRUIT', name: '공고/공모' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedBoard(tab.id)}
              className={`px-4 py-2.5 rounded-xl font-black text-sm md:text-base whitespace-nowrap transition-all flex-shrink-0 ${
                selectedBoard === tab.id
                  ? (highContrast ? 'bg-yellow-400 text-black shadow-md ring-2 ring-white' : 'bg-[#0A4E9B] text-white shadow-md')
                  : (highContrast ? 'bg-zinc-800 text-yellow-200 hover:bg-zinc-700' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200')
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>

        {/* 4. 검색창 */}
        <div className="relative mb-5">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="찾으시는 소식 제목을 입력하세요 (예: 교육, 공모, 지원)"
            className={`w-full py-3.5 pl-12 pr-10 rounded-2xl text-base md:text-lg font-medium border-2 transition-all ${
              highContrast
                ? 'bg-zinc-900 border-yellow-400 text-yellow-300 placeholder-yellow-500/60 focus:ring-4 focus:ring-yellow-300'
                : 'bg-white border-blue-200 text-slate-900 placeholder-slate-400 shadow-sm focus:border-[#0A4E9B] focus:ring-4 focus:ring-blue-100'
            }`}
          />
          <Search className={`w-6 h-6 absolute left-4 top-1/2 -translate-y-1/2 ${highContrast ? 'text-yellow-400' : 'text-[#0A4E9B]'}`} />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* 5. 게시물 목록 */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="inline-block animate-spin w-10 h-10 border-4 border-[#0A4E9B] border-t-transparent rounded-full mb-3" />
            <p className="font-bold text-lg">최신 공단 소식을 불러오고 있습니다...</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className={`p-10 text-center rounded-2xl ${highContrast ? 'bg-zinc-900 border border-yellow-400' : 'bg-white border border-slate-200'}`}>
            <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-400" />
            <p className="font-bold text-lg mb-1">검색 조건에 맞는 소식이 없습니다.</p>
            <p className="text-sm opacity-75">다른 검색어를 입력하시거나 카테고리를 변경해 보세요.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPosts.map((post) => {
              const cardImgs: string[] = post.cardImages ? JSON.parse(post.cardImages) : [];
              return (
                <article
                  key={post.id}
                  className={`p-5 rounded-2xl transition-all ${
                    highContrast
                      ? 'bg-zinc-900 border-2 border-yellow-400 hover:border-white shadow-md'
                      : 'bg-white border border-slate-200 hover:border-blue-400 hover:shadow-lg shadow-sm'
                  }`}
                >
                  {/* 상단 태그 및 등록일 */}
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-extrabold ${
                        post.boardType === 'CARD_NEWS'
                          ? 'bg-purple-100 text-purple-800'
                          : post.boardType === 'PRESS'
                          ? 'bg-blue-100 text-blue-800'
                          : post.boardType === 'RECRUIT'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {post.boardName}
                      </span>
                      {post.isSafetyOrPolicy && (
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 flex items-center gap-1">
                          중요 정책
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold opacity-75">{post.registeredDate}</span>
                  </div>

                  {/* 제목 */}
                  <h3
                    onClick={() => {
                      setActivePost(post);
                      setCurrentCardIndex(0);
                    }}
                    className={`font-black tracking-tight mb-2.5 cursor-pointer hover:underline ${
                      fontSizeLevel === 'normal' ? 'text-lg md:text-xl' : fontSizeLevel === 'large' ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl'
                    }`}
                  >
                    {post.title}
                  </h3>

                  {/* 카드뉴스 미리보기 썸네일 또는 일반 썸네일 */}
                  {post.thumbnailUrl && (
                    <div
                      onClick={() => {
                        setActivePost(post);
                        setCurrentCardIndex(0);
                      }}
                      className="mb-3 rounded-xl overflow-hidden cursor-pointer max-h-56 bg-slate-100 border border-slate-200 flex items-center justify-center"
                    >
                      <img
                        src={post.thumbnailUrl}
                        alt={post.title}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                    </div>
                  )}

                  {/* 쉬운 요약 본문 */}
                  <p className={`${textClass} line-clamp-3 mb-4 opacity-90 leading-relaxed`}>
                    {post.summary}
                  </p>

                  {/* 하단 큰 버튼 액션 영역 */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => toggleVoice(post.voiceScript)}
                      className={`flex-1 min-w-[140px] py-3 px-4 rounded-xl font-black text-base flex items-center justify-center gap-2 transition-all shadow-sm ${
                        highContrast
                          ? 'bg-yellow-400 text-black hover:bg-yellow-300'
                          : 'bg-[#0A4E9B] text-white hover:bg-[#063266]'
                      }`}
                    >
                      {isPlaying ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5 text-yellow-300" />}
                      <span>{isPlaying ? '음성 멈추기' : '큰 소리로 듣기'}</span>
                    </button>

                    <button
                      onClick={() => {
                        setActivePost(post);
                        setCurrentCardIndex(0);
                      }}
                      className={`py-3 px-4 rounded-xl font-bold text-base flex items-center gap-1.5 transition-all ${
                        highContrast
                          ? 'bg-zinc-800 text-yellow-300 hover:bg-zinc-700 border border-yellow-400'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                      }`}
                    >
                      <span>쉬운 설명 보기</span>
                    </button>

                    <a
                      href={post.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-all"
                      title="공단 홈페이지 원본 게시물 보기"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* 6. 상세 보기 및 쉬운 설명 / 카드뉴스 모달 */}
      {activePost && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className={`w-full max-w-2xl max-h-[92vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl ${
            highContrast ? 'bg-zinc-950 border-4 border-yellow-400 text-yellow-300' : 'bg-white text-slate-900'
          }`}>
            {/* 모달 헤더 */}
            <div className={`p-4 sm:p-5 flex items-center justify-between border-b ${
              highContrast ? 'border-yellow-400/50 bg-zinc-900' : 'border-slate-200 bg-[#0A4E9B] text-white'
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-yellow-400 text-blue-950">
                  {activePost.boardName}
                </span>
                <span className="text-xs opacity-80">{activePost.registeredDate}</span>
              </div>
              <button
                onClick={() => {
                  stopVoice();
                  setActivePost(null);
                  setAiAnswer(null);
                }}
                className="p-2 rounded-full hover:bg-white/20 transition-all"
                title="닫기"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* 모달 본문 스크롤 영역 */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
              {/* 제목 */}
              <h2 className={`font-black leading-snug ${
                fontSizeLevel === 'normal' ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'
              }`}>
                {activePost.title}
              </h2>

              {/* 음성 플레이어 컨트롤 바 */}
              <div className={`p-4 rounded-2xl flex items-center justify-between gap-3 ${
                highContrast ? 'bg-zinc-900 border-2 border-yellow-400' : 'bg-blue-50 border border-blue-200'
              }`}>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleVoice(activePost.voiceScript)}
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black shadow-md transition-all ${
                      isPlaying
                        ? 'bg-rose-600 text-white animate-pulse'
                        : (highContrast ? 'bg-yellow-400 text-black' : 'bg-[#0A4E9B] text-white')
                    }`}
                  >
                    {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
                  </button>
                  <div>
                    <p className="font-extrabold text-base md:text-lg">
                      {isPlaying ? '음성으로 안내 중입니다...' : '음성 안내 듣기'}
                    </p>
                    <p className="text-xs opacity-75">
                      배속: {speechRate}x • Web Speech API 기반
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => playVoice(activePost.voiceScript)}
                  className="p-3 rounded-xl bg-white/20 hover:bg-white/30 text-slate-700 transition-all"
                  title="처음부터 다시 듣기"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              </div>

              {/* 카드뉴스인 경우: 다중 이미지 슬라이드 뷰어 */}
              {activePost.boardType === 'CARD_NEWS' && (() => {
                const cardImgs: string[] = activePost.cardImages ? JSON.parse(activePost.cardImages) : [];
                if (cardImgs.length === 0) return null;
                return (
                  <div className="space-y-3">
                    <div className="relative rounded-2xl overflow-hidden bg-black flex items-center justify-center min-h-[300px] max-h-[500px]">
                      <img
                        src={cardImgs[currentCardIndex]}
                        alt={`카드뉴스 ${currentCardIndex + 1}장`}
                        className="max-h-[500px] w-auto object-contain"
                      />
                      {/* 이전 / 다음 버튼 */}
                      {cardImgs.length > 1 && (
                        <>
                          <button
                            onClick={() => setCurrentCardIndex((prev) => (prev > 0 ? prev - 1 : cardImgs.length - 1))}
                            className="absolute left-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 text-white hover:bg-black/80"
                          >
                            <ChevronLeft className="w-6 h-6" />
                          </button>
                          <button
                            onClick={() => setCurrentCardIndex((prev) => (prev < cardImgs.length - 1 ? prev + 1 : 0))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 text-white hover:bg-black/80"
                          >
                            <ChevronRight className="w-6 h-6" />
                          </button>
                        </>
                      )}
                    </div>
                    <div className="text-center font-bold text-sm">
                      {currentCardIndex + 1} / {cardImgs.length} 장 (좌우 화살표로 넘겨보세요)
                    </div>
                  </div>
                );
              })()}

              {/* 어르신 맞춤 쉬운 설명 */}
              <div className={`p-5 rounded-2xl ${
                highContrast ? 'bg-zinc-900 border border-yellow-400' : 'bg-slate-50 border border-slate-200'
              }`}>
                <h3 className="font-extrabold text-base md:text-lg mb-2 flex items-center gap-1.5 text-[#0A4E9B]">
                  <Sparkles className="w-5 h-5 text-yellow-500" />
                  <span>어르신을 위한 알기 쉬운 설명</span>
                </h3>
                <div className={`${textClass} whitespace-pre-line leading-relaxed`}>
                  {activePost.easyExplanation}
                </div>
              </div>

              {/* 첨부파일 안내 */}
              {activePost.attachments && (() => {
                let files: Array<{ name: string; url: string; ext: string; note: string }> = [];
                try {
                  files = JSON.parse(activePost.attachments);
                } catch {}
                if (files.length === 0) return null;

                return (
                  <div className="p-4 rounded-xl bg-slate-100 text-slate-800 text-xs md:text-sm">
                    <p className="font-bold mb-2">공식 첨부파일 목록:</p>
                    <ul className="space-y-1.5">
                      {files.map((f, i) => (
                        <li key={i} className="flex items-center justify-between gap-2">
                          <span className="truncate">{f.name}</span>
                          {f.url ? (
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-0.5 rounded bg-blue-600 text-white font-bold text-xs flex-shrink-0"
                            >
                              다운로드
                            </a>
                          ) : (
                            <span className="text-slate-400 text-xs">{f.note}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              {/* 7. 소식에 대해 질문하기 (음성 & 텍스트 Q&A) */}
              <div className={`p-5 rounded-2xl border-2 ${
                highContrast ? 'bg-zinc-900 border-yellow-400' : 'bg-emerald-50 border-emerald-300'
              }`}>
                <h3 className="font-black text-base md:text-lg mb-2 flex items-center gap-2">
                  <Mic className="w-5 h-5 text-emerald-600" />
                  <span>이 소식에 대해 질문하기</span>
                </h3>
                <p className="text-xs md:text-sm opacity-80 mb-3">
                  궁금하신 점을 말로 말씀하시거나 글자로 입력하시면 AI가 친절하게 설명해 드립니다.
                </p>

                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={userQuestion}
                    onChange={(e) => setUserQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
                    placeholder="예: 신청 자격이 어떻게 되나요?"
                    className={`flex-1 py-3 px-4 rounded-xl border font-medium text-sm md:text-base ${
                      highContrast ? 'bg-black border-yellow-400 text-yellow-200' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                  <button
                    onClick={startVoiceRecognition}
                    className={`p-3 rounded-xl font-bold flex items-center justify-center transition-all ${
                      isListening
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                    title="마이크로 말하기"
                  >
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={() => handleAskQuestion()}
                    disabled={isAsking}
                    className="py-3 px-4 rounded-xl bg-[#0A4E9B] hover:bg-[#063266] text-white font-black text-sm flex items-center gap-1 shadow"
                  >
                    <Send className="w-4 h-4" />
                    <span>질문</span>
                  </button>
                </div>

                {isAsking && (
                  <div className="p-3 text-center text-sm font-bold text-emerald-800 animate-pulse">
                    공단 소식 내용을 바탕으로 답변을 준비하고 있습니다...
                  </div>
                )}

                {aiAnswer && (
                  <div className={`p-4 rounded-xl mt-3 ${
                    highContrast ? 'bg-black border border-yellow-400 text-yellow-300' : 'bg-white border border-emerald-200 text-slate-900'
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-extrabold text-emerald-700 text-sm flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" />
                        답변 안내 {aiAnswer.isDemo && '(데모 상태)'}
                      </span>
                      <button
                        onClick={() => playVoice(aiAnswer.voiceScript)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-1"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>답변 다시 듣기</span>
                      </button>
                    </div>
                    <p className={`${textClass} whitespace-pre-line leading-relaxed`}>
                      {aiAnswer.text}
                    </p>
                  </div>
                )}
              </div>

              {/* 공단 원문 링크 */}
              <div className="pt-2 text-center">
                <a
                  href={activePost.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-[#0A4E9B] hover:underline"
                >
                  <span>한국어촌어항공단 공식 홈페이지 원문 확인하기</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. 스마트폰 QR 코드 모달 */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl relative">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-black text-xl mb-1 text-[#0A4E9B]">
              스마트폰으로 간편하게 듣기
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              스마트폰 기본 카메라로 아래 QR 코드를 비추시면 복잡한 주소 입력 없이 바로 열립니다.
            </p>
            {qrDataUrl ? (
              <div className="p-3 bg-slate-50 rounded-2xl inline-block border border-slate-200 mb-4">
                <img src={qrDataUrl} alt="스마트폰 접속 QR코드" className="w-48 h-48 mx-auto" />
              </div>
            ) : (
              <div className="w-48 h-48 bg-slate-100 rounded-2xl mx-auto flex items-center justify-center text-xs text-slate-400">
                QR 생성 중...
              </div>
            )}
            <p className="text-xs font-bold text-emerald-700 bg-emerald-50 py-2 rounded-xl">
              별도의 앱 설치나 로그인 없이 바로 이용하실 수 있습니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

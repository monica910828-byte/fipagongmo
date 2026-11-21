'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Volume2, VolumeX, Play, Pause, RotateCcw, Search,
  ExternalLink, Mic, MicOff, Send, QrCode,
  CheckCircle, ChevronLeft, ChevronRight, X, AlertCircle, Sparkles,
  Heart, Waves, Music, MessageCircle, Star, Compass, ShieldCheck
} from 'lucide-react';
import Eodongi from '@/components/Eodongi';
import { useFirebaseAuth } from '@/lib/useFirebaseAuth';
import AdminLoginModal from '@/components/AdminLoginModal';

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
  const router = useRouter();
  const { user } = useFirebaseAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBoard, setSelectedBoard] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // 고령자 및 누구나 맞춤 글자 크기 / 재생 속도 / 고대비
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
    utterance.pitch = 1.1; // 귀엽고 상냥한 밝은 어조

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
    <div className={`min-h-screen ${highContrast ? 'bg-zinc-950 text-yellow-300' : 'bg-[#F2F8FD] text-slate-900'} pb-24 transition-colors font-cute selection:bg-amber-200`}>
      
      {/* 1. 귀엽고 아기자기한 무지개빛 상단 헤더 */}
      <header className={`${highContrast ? 'bg-zinc-900 border-b-4 border-yellow-400' : 'bg-gradient-to-r from-[#38BDF8] via-[#0284C7] to-[#0369A1] text-white shadow-md'} sticky top-0 z-40 transition-colors`}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          
          {/* 공식 캐릭터와 귀여운 타이틀 */}
          <div className="flex items-center gap-2.5">
            <div 
              className="relative group cursor-pointer" 
              onClick={() => playVoice('공단 소식 도우미 어동이입니다! 듣고 싶은 소식을 쏙쏙 골라보세요!')}
              title="어동이 누르기"
            >
              <div className="w-13 h-13 rounded-2xl bg-white p-1.5 shadow-md flex items-center justify-center transform transition-transform group-hover:scale-110 group-hover:rotate-3 border-2 border-amber-300">
                <img 
                  src="/eodongi_official.png" 
                  alt="한국어촌어항공단 캐릭터 어동이" 
                  className="w-10 h-10 object-contain drop-shadow" 
                />
              </div>
              <span className="absolute -top-1 -right-1 text-sm animate-bounce">✨</span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-cute text-2xl md:text-3xl tracking-wide flex items-center text-white drop-shadow-sm">
                  <span>FiPA 들려드림</span>
                </h1>
                <span className="text-xs bg-amber-300 text-blue-950 font-cute px-2.5 py-0.5 rounded-full shadow-sm flex items-center gap-1 animate-cute-wiggle">
                  <span>어동이와 바다 여행</span> 🐬
                </span>
              </div>
              <p className="text-xs text-sky-100 font-cute flex items-center gap-1 opacity-95">
                <span>한국어촌어항공단 소식 쉬운 음성안내</span>
                <span className="inline-block text-amber-200">★</span>
              </p>
            </div>
          </div>

          {/* 우측 스마트폰 연결 & 관리자 버튼 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQrModal(true)}
              className="px-3 py-1.5 rounded-2xl bg-white/20 hover:bg-white/30 text-white text-xs md:text-sm font-cute flex items-center gap-1.5 border border-white/40 shadow-sm transition-all hover:scale-105 active:scale-95"
              title="스마트폰 카메라로 바로 열기"
            >
              <QrCode className="w-4 h-4 text-amber-300" />
              <span className="hidden sm:inline">스마트폰 연결</span>
            </button>
            <button
              onClick={() => {
                if (user) {
                  router.push('/admin');
                } else {
                  setShowLoginModal(true);
                }
              }}
              className="px-3.5 py-1.5 rounded-2xl bg-amber-300 hover:bg-amber-200 text-blue-950 text-xs md:text-sm font-cute shadow-md transition-all hover:scale-105 active:scale-95 border-2 border-white flex items-center gap-1.5"
              title="관리자 전용 대시보드"
            >
              <ShieldCheck className="w-4 h-4 text-blue-950" />
              <span>{user ? '관리자 대시보드' : '관리자 모드'}</span>
            </button>
          </div>
        </div>

        {/* 2. 유치원/시니어 친화 맞춤 설정 바 (알록달록 젤리 버튼) */}
        <div className={`${highContrast ? 'bg-zinc-950 border-t border-yellow-400/50' : 'bg-[#0275B1] text-white'} px-4 py-2 border-t border-white/20`}>
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs md:text-sm font-cute">
            
            {/* 글자 크기 조절 (젤리 모양) */}
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-sky-100 flex items-center gap-1">
                <span>글자 크기:</span>
              </span>
              <button
                onClick={() => setFontSizeLevel('normal')}
                className={`px-3 py-1 rounded-2xl font-cute transition-all shadow-sm ${fontSizeLevel === 'normal' ? 'bg-amber-300 text-blue-950 ring-2 ring-white scale-105' : 'bg-white/20 hover:bg-white/30 text-white'}`}
              >
                보통
              </button>
              <button
                onClick={() => setFontSizeLevel('large')}
                className={`px-3 py-1 rounded-2xl font-cute transition-all shadow-sm ${fontSizeLevel === 'large' ? 'bg-amber-300 text-blue-950 ring-2 ring-white scale-105' : 'bg-white/20 hover:bg-white/30 text-white'}`}
              >
                크게
              </button>
              <button
                onClick={() => setFontSizeLevel('xlarge')}
                className={`px-3 py-1 rounded-2xl font-cute transition-all shadow-sm ${fontSizeLevel === 'xlarge' ? 'bg-amber-300 text-blue-950 ring-2 ring-white scale-105' : 'bg-white/20 hover:bg-white/30 text-white'}`}
              >
                아주 크게
              </button>
            </div>

            {/* 음성 속도 & 고대비 모드 */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="mr-1 text-sky-100">말하기 속도:</span>
                <button
                  onClick={() => setSpeechRate(0.8)}
                  className={`px-2.5 py-1 rounded-2xl font-cute transition-all shadow-sm ${speechRate === 0.8 ? 'bg-amber-300 text-blue-950 ring-2 ring-white' : 'bg-white/20 hover:bg-white/30 text-white'}`}
                >
                  🐢 천천히
                </button>
                <button
                  onClick={() => setSpeechRate(1.0)}
                  className={`px-2.5 py-1 rounded-2xl font-cute transition-all shadow-sm ${speechRate === 1.0 ? 'bg-amber-300 text-blue-950 ring-2 ring-white' : 'bg-white/20 hover:bg-white/30 text-white'}`}
                >
                  🐰 보통
                </button>
              </div>

              <button
                onClick={() => setHighContrast(!highContrast)}
                className={`px-3 py-1 rounded-2xl font-cute border transition-all ${highContrast ? 'bg-yellow-400 text-black border-yellow-300 shadow' : 'bg-white/25 border-white/40 hover:bg-white/35 text-white'}`}
              >
                {highContrast ? '눈 편한 모드로' : '선명하게 보기'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 컨테이너 */}
      <main className="max-w-4xl mx-auto px-4 pt-4">
        
        {/* 3. 🌟 공식 어동이 캐릭터 웰컴 배너 (유치원생이 좋아하는 알록달록 디자인) */}
        <div className={`mb-5 p-5 md:p-6 rounded-[32px] ${highContrast
          ? 'bg-zinc-900 border-4 border-yellow-400'
          : 'bg-gradient-to-r from-sky-100 via-amber-50 to-pink-50 border-4 border-sky-200/90 shadow-md'
          } relative overflow-hidden transition-all`}>
          
          <div className="flex flex-col sm:flex-row items-center gap-5 relative z-10">
            {/* 공식 어동이 캐릭터 (홈페이지 공식 마스코트 활용) */}
            <div 
              className="flex-shrink-0 cursor-pointer" 
              onClick={() => playVoice('한국어촌어항공단 소식을 재미있고 쉽게 들려드릴게요! 원하는 소식을 꾹 눌러보세요!')}
              title="어동이 목소리 듣기"
            >
              <Eodongi
                pose="greeting"
                size={125}
                speechText="소식을 쏙쏙 들려줄게요! 🐬✨"
                showSparkle={true}
                className="hover:scale-105 transition-transform"
              />
            </div>

            {/* 귀여운 설명 텍스트 */}
            <div className="text-center sm:text-left flex-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/90 text-[#0284C7] font-cute text-xs md:text-sm mb-2 shadow-sm border border-sky-200">
                <Sparkles className="w-4 h-4 text-amber-500 animate-spin" />
                <span>공단 공식 캐릭터 어동이가 함께해요</span>
                <span className="text-pink-500">🌸</span>
              </div>
              <h2 className="font-cute text-xl md:text-2xl text-slate-900 mb-1.5 leading-snug">
                알기 쉬운 바다·어촌 이야기 🌊
              </h2>
              <p className="text-sm md:text-base text-slate-600 leading-relaxed font-cute">
                공단 홈페이지에 새 소식이 올라오면 <strong>홍보담당자가 따로 올리지 않아도 자동으로 쏙쏙 모아서</strong>, 어동이가 귀여운 글과 다정한 목소리로 읽어드립니다.
              </p>
            </div>
          </div>

          {/* 배경 귀여운 장식 스티커들 */}
          <div className="absolute right-3 -bottom-3 text-7xl opacity-15 pointer-events-none select-none">
            🐬
          </div>
          <div className="absolute left-6 -top-2 text-4xl opacity-15 pointer-events-none select-none">
            🎈
          </div>
        </div>

        {/* 4. 알록달록 조약돌 카테고리 탭 (마시멜로 버튼 스타일) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none mb-4">
          {[
            { id: 'ALL', name: '전체 소식', emoji: '🌊', color: 'from-sky-400 to-blue-500' },
            { id: 'PRESS', name: '보도자료', emoji: '📰', color: 'from-blue-400 to-indigo-500' },
            { id: 'CARD_NEWS', name: '카드뉴스', emoji: '🎨', color: 'from-purple-400 to-pink-500' },
            { id: 'NOTICE', name: '공지사항', emoji: '📢', color: 'from-emerald-400 to-teal-500' },
            { id: 'RECRUIT', name: '공고·공모', emoji: '📑', color: 'from-amber-400 to-orange-500' },
          ].map(tab => {
            const isSelected = selectedBoard === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedBoard(tab.id)}
                className={`px-4 py-2.5 rounded-[22px] font-cute text-base md:text-lg whitespace-nowrap transition-all flex items-center gap-1.5 shadow-sm flex-shrink-0 active:scale-95 ${isSelected
                  ? (highContrast ? 'bg-yellow-400 text-black shadow-md ring-4 ring-yellow-300' : `bg-gradient-to-r ${tab.color} text-white shadow-md scale-105 ring-2 ring-white`)
                  : (highContrast ? 'bg-zinc-800 text-yellow-200 hover:bg-zinc-700' : 'bg-white text-slate-700 hover:bg-sky-50 border-2 border-sky-100 hover:border-sky-300')
                  }`}
              >
                <span className="text-lg">{tab.emoji}</span>
                <span>{tab.name}</span>
              </button>
            );
          })}
        </div>

        {/* 5. 귀여운 검색창 (어동이 돋보기 테마) */}
        <div className="relative mb-5">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="어동이에게 찾고 싶은 소식을 물어보세요! (예: 교육, 공모, 지원금)"
            className={`w-full py-4 pl-12 pr-12 rounded-[28px] text-base md:text-lg font-cute border-4 transition-all ${highContrast
              ? 'bg-zinc-900 border-yellow-400 text-yellow-300 placeholder-yellow-500/60 focus:ring-4 focus:ring-yellow-300'
              : 'bg-white border-sky-200 text-slate-900 placeholder-slate-400 shadow-sm focus:border-sky-400 focus:ring-4 focus:ring-sky-100'
              }`}
          />
          <Search className={`w-6 h-6 absolute left-4 top-1/2 -translate-y-1/2 ${highContrast ? 'text-yellow-400' : 'text-[#0284C7]'}`} />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* 6. 게시물 목록 */}
        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block p-4 rounded-3xl bg-white border-4 border-sky-200 shadow-md mb-3 animate-cute-bounce">
              <img src="/eodongi_official.png" alt="로딩 중" className="w-24 h-24 object-contain mx-auto" />
            </div>
            <p className="font-cute text-xl text-sky-800">최신 공단 소식을 정성껏 모으고 있습니다... 🌊✨</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className={`p-10 text-center rounded-[32px] ${highContrast ? 'bg-zinc-900 border-4 border-yellow-400' : 'bg-white border-4 border-sky-100 shadow-sm'}`}>
            <img src="/eodongi_official.png" alt="결과 없음" className="w-24 h-24 object-contain mx-auto mb-3" />
            <p className="font-cute text-2xl mb-1.5 text-slate-800">찾으시는 소식이 아직 없어요 😢</p>
            <p className="text-base text-slate-500 font-cute">다른 단어로 검색하시거나 카테고리 탭을 눌러보세요.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPosts.map((post) => {
              return (
                <article
                  key={post.id}
                  className={`p-5 md:p-6 rounded-[30px] transition-all relative ${highContrast
                    ? 'bg-zinc-900 border-4 border-yellow-400 hover:border-white shadow-md'
                    : 'bg-white border-4 border-sky-100/80 hover:border-sky-300 hover:shadow-xl shadow-sm'
                    }`}
                >
                  {/* 상단 귀여운 뱃지 및 등록일 */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-2xl text-xs md:text-sm font-cute shadow-sm flex items-center gap-1 ${post.boardType === 'CARD_NEWS'
                        ? 'bg-purple-100 text-purple-900 border-2 border-purple-200'
                        : post.boardType === 'PRESS'
                          ? 'bg-blue-100 text-blue-900 border-2 border-blue-200'
                          : post.boardType === 'RECRUIT'
                            ? 'bg-amber-100 text-amber-900 border-2 border-amber-200'
                            : 'bg-emerald-100 text-emerald-900 border-2 border-emerald-200'
                        }`}>
                        {post.boardType === 'CARD_NEWS' && '🎨 '}
                        {post.boardType === 'PRESS' && '📰 '}
                        {post.boardType === 'RECRUIT' && '📑 '}
                        {post.boardType === 'NOTICE' && '📢 '}
                        {post.boardName}
                      </span>
                      {post.isSafetyOrPolicy && (
                        <span className="px-2.5 py-0.5 rounded-2xl text-xs font-cute bg-rose-100 text-rose-800 border-2 border-rose-200 flex items-center gap-1">
                          ⚠️ 중요 정책
                        </span>
                      )}
                    </div>
                    <span className="text-xs md:text-sm font-cute text-slate-500 bg-sky-50 px-3 py-1 rounded-xl border border-sky-100">
                      📅 {post.registeredDate}
                    </span>
                  </div>

                  {/* 제목 */}
                  <h3
                    onClick={() => {
                      setActivePost(post);
                      setCurrentCardIndex(0);
                    }}
                    className={`font-cute tracking-wide mb-3 cursor-pointer hover:text-[#0284C7] transition-colors leading-snug ${fontSizeLevel === 'normal' ? 'text-xl md:text-2xl' : fontSizeLevel === 'large' ? 'text-2xl md:text-3xl' : 'text-3xl md:text-4xl'
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
                      className="mb-4 rounded-2xl overflow-hidden cursor-pointer max-h-56 bg-slate-100 border-2 border-sky-100 flex items-center justify-center relative group"
                    >
                      <img
                        src={post.thumbnailUrl}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                      {post.boardType === 'CARD_NEWS' && (
                        <span className="absolute bottom-2.5 right-2.5 bg-purple-900/80 text-white text-xs md:text-sm font-cute px-3 py-1 rounded-xl backdrop-blur-sm shadow flex items-center gap-1">
                          <span>카드뉴스 그림 넘겨보기</span> 👉
                        </span>
                      )}
                    </div>
                  )}

                  {/* 쉬운 요약 본문 */}
                  <p className={`${textClass} line-clamp-3 mb-4 text-slate-700 leading-relaxed font-cute`}>
                    {post.summary}
                  </p>

                  {/* 하단 큰 버튼 액션 영역 (사탕처럼 톡톡 튀는 젤리 버튼) */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t-2 border-sky-100/60">
                    <button
                      onClick={() => toggleVoice(post.voiceScript)}
                      className={`flex-1 min-w-[160px] py-3.5 px-5 rounded-[22px] font-cute text-base md:text-lg flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 ${isPlaying
                        ? 'bg-rose-500 text-white animate-pulse'
                        : (highContrast ? 'bg-yellow-400 text-black hover:bg-yellow-300 ring-2 ring-yellow-200' : 'bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white hover:brightness-105 shadow-sky-200')
                        }`}
                    >
                      {isPlaying ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5 text-amber-300 animate-bounce" />}
                      <span>{isPlaying ? '음성 멈추기' : '🎵 어동이 목소리로 듣기'}</span>
                    </button>

                    <button
                      onClick={() => {
                        setActivePost(post);
                        setCurrentCardIndex(0);
                      }}
                      className={`py-3.5 px-5 rounded-[22px] font-cute text-base md:text-lg flex items-center gap-1.5 transition-all shadow-sm active:scale-95 ${highContrast
                        ? 'bg-zinc-800 text-yellow-300 hover:bg-zinc-700 border-2 border-yellow-400'
                        : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-2 border-amber-300'
                        }`}
                    >
                      <span>📖 쉬운 설명 보기</span>
                    </button>

                    <a
                      href={post.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3.5 rounded-[22px] bg-sky-50 hover:bg-sky-100 text-sky-700 hover:text-sky-900 transition-all shadow-sm border border-sky-200"
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

      {/* 7. 상세 보기 및 쉬운 설명 / 카드뉴스 모달 (동화책 팝업 스타일) */}
      {activePost && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
          <div className={`w-full max-w-2xl max-h-[92vh] rounded-[36px] overflow-hidden flex flex-col shadow-2xl border-4 ${highContrast ? 'bg-zinc-950 border-yellow-400 text-yellow-300' : 'bg-white border-sky-200 text-slate-900'
            }`}>
            
            {/* 모달 헤더 (공식 어동이 포함) */}
            <div className={`p-4 sm:p-5 flex items-center justify-between border-b ${highContrast ? 'border-yellow-400/50 bg-zinc-900' : 'bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-600 text-white'
              }`}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white p-1 shadow-md flex items-center justify-center border-2 border-amber-300">
                  <img src="/eodongi_official.png" alt="어동이" className="w-9 h-9 object-contain" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-cute px-2.5 py-0.5 rounded-full bg-amber-300 text-blue-950 shadow-xs">
                      {activePost.boardName}
                    </span>
                    <span className="text-xs opacity-90 font-cute">📅 {activePost.registeredDate}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  stopVoice();
                  setActivePost(null);
                  setAiAnswer(null);
                }}
                className="p-2 rounded-2xl bg-white/20 hover:bg-white/30 text-white transition-all"
                title="창 닫기"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* 모달 본문 스크롤 영역 */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 bg-bubble-pattern">
              
              {/* 제목 */}
              <h2 className={`font-cute leading-snug tracking-wide ${fontSizeLevel === 'normal' ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'
                }`}>
                {activePost.title}
              </h2>

              {/* 어동이 음성 플레이어 컨트롤 박스 (귀여운 카세트/라디오 느낌) */}
              <div className={`p-4 sm:p-5 rounded-[28px] flex flex-wrap items-center justify-between gap-3 ${highContrast ? 'bg-zinc-900 border-2 border-yellow-400' : 'bg-gradient-to-r from-sky-100 via-blue-50 to-pink-50 border-4 border-sky-200 shadow-sm'
                }`}>
                <div className="flex items-center gap-3.5">
                  <div className="flex-shrink-0">
                    <img src="/eodongi_official.png" alt="어동이 응원" className="w-16 h-16 object-contain drop-shadow" />
                  </div>
                  <div>
                    <button
                      onClick={() => toggleVoice(activePost.voiceScript)}
                      className={`px-5 py-3 rounded-2xl font-cute text-base md:text-lg shadow-md flex items-center gap-2 transition-all active:scale-95 ${isPlaying
                        ? 'bg-rose-500 text-white animate-pulse'
                        : (highContrast ? 'bg-yellow-400 text-black' : 'bg-gradient-to-r from-sky-400 to-blue-600 text-white hover:brightness-105')
                        }`}
                    >
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 text-amber-300" />}
                      <span>{isPlaying ? '음성 멈추기' : '🎵 어동이 목소리로 재생'}</span>
                    </button>
                    <p className="text-xs md:text-sm text-sky-800 font-cute mt-1.5">
                      속도: {speechRate}x • 쉬운 한국어 음성 📢
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => playVoice(activePost.voiceScript)}
                  className="px-4 py-3 rounded-2xl bg-white hover:bg-amber-100 text-blue-950 font-cute text-sm shadow-sm border-2 border-amber-300 transition-all flex items-center gap-1.5"
                  title="처음부터 다시 듣기"
                >
                  <RotateCcw className="w-4 h-4 text-[#0284C7]" />
                  <span>처음부터</span>
                </button>
              </div>

              {/* 카드뉴스인 경우: 다중 이미지 슬라이드 뷰어 */}
              {activePost.boardType === 'CARD_NEWS' && (() => {
                const cardImgs: string[] = activePost.cardImages ? JSON.parse(activePost.cardImages) : [];
                if (cardImgs.length === 0) return null;
                return (
                  <div className="space-y-3">
                    <div className="relative rounded-[28px] overflow-hidden bg-black flex items-center justify-center min-h-[300px] max-h-[500px] shadow-md border-4 border-purple-200">
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
                            className="absolute left-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 text-white hover:bg-black/80 transition-all active:scale-95"
                          >
                            <ChevronLeft className="w-8 h-8" />
                          </button>
                          <button
                            onClick={() => setCurrentCardIndex((prev) => (prev < cardImgs.length - 1 ? prev + 1 : 0))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 text-white hover:bg-black/80 transition-all active:scale-95"
                          >
                            <ChevronRight className="w-8 h-8" />
                          </button>
                        </>
                      )}
                    </div>
                    <div className="text-center font-cute text-base text-purple-900 bg-purple-100 py-2.5 rounded-2xl border-2 border-purple-200">
                      총 {cardImgs.length}장 중 <strong>{currentCardIndex + 1}장째</strong> 보고 계세요 (좌우 화살표를 눌러보세요)
                    </div>
                  </div>
                );
              })()}

              {/* 어르신 및 누구나 알기 쉬운 설명 상자 */}
              <div className={`p-5 md:p-6 rounded-[28px] ${highContrast ? 'bg-zinc-900 border-2 border-yellow-400' : 'bg-amber-50/90 border-4 border-amber-200 shadow-sm'
                }`}>
                <h3 className="font-cute text-lg md:text-xl mb-3 flex items-center gap-2 text-amber-950">
                  <Sparkles className="w-5 h-5 text-amber-500 animate-spin" />
                  <span>어동이가 알기 쉽게 정리한 소식 📖</span>
                </h3>
                <div className={`${textClass} whitespace-pre-line leading-relaxed font-cute text-slate-800`}>
                  {activePost.easyExplanation}
                </div>
              </div>

              {/* 첨부파일 안내 */}
              {activePost.attachments && (() => {
                let files: Array<{ name: string; url: string; ext: string; note: string }> = [];
                try {
                  files = JSON.parse(activePost.attachments);
                } catch { }
                if (files.length === 0) return null;

                return (
                  <div className="p-4 rounded-[24px] bg-sky-50 border-2 border-sky-200 text-slate-800 text-xs md:text-sm font-cute">
                    <p className="font-cute text-base text-sky-900 mb-2 flex items-center gap-1">
                      <span>📁 공식 첨부파일 안내:</span>
                    </p>
                    <ul className="space-y-2">
                      {files.map((f, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 p-2.5 bg-white rounded-xl border border-sky-200">
                          <span className="truncate font-cute text-sm">{f.name}</span>
                          {f.url ? (
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3.5 py-1.5 rounded-xl bg-[#0284C7] text-white font-cute text-xs flex-shrink-0 shadow hover:bg-[#0369A1]"
                            >
                              다운로드
                            </a>
                          ) : (
                            <span className="text-slate-400 text-xs font-cute">{f.note}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              {/* 8. 소식에 대해 질문하기 (어동이 경청 모드) */}
              <div className={`p-5 md:p-6 rounded-[28px] border-4 ${highContrast ? 'bg-zinc-900 border-yellow-400' : 'bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border-emerald-200 shadow-sm'
                }`}>
                <div className="flex items-center gap-3.5 mb-3">
                  <div className="flex-shrink-0">
                    <img src="/eodongi_official.png" alt="어동이 질문" className="w-16 h-16 object-contain drop-shadow" />
                  </div>
                  <div>
                    <h3 className="font-cute text-lg md:text-xl text-emerald-950">
                      어동이에게 질문해 보세요! 💬
                    </h3>
                    <p className="text-xs md:text-sm text-emerald-700 font-cute">
                      마이크 버튼을 누르고 말씀하시거나 글자로 물어보시면 답해드려요.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 mb-3 mt-3">
                  <input
                    type="text"
                    value={userQuestion}
                    onChange={(e) => setUserQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
                    placeholder="예: 신청 자격이 어떻게 되나요? 언제까지예요?"
                    className={`flex-1 py-3.5 px-4 rounded-2xl border-2 font-cute text-base md:text-lg ${highContrast ? 'bg-black border-yellow-400 text-yellow-200' : 'bg-white border-emerald-300 text-slate-900 shadow-sm focus:border-emerald-500'
                      }`}
                  />
                  <button
                    onClick={startVoiceRecognition}
                    className={`p-3.5 rounded-2xl font-cute flex items-center justify-center transition-all shadow-md active:scale-95 ${isListening
                      ? 'bg-rose-500 text-white animate-pulse'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    title="마이크로 말하기"
                  >
                    {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                  </button>
                  <button
                    onClick={() => handleAskQuestion()}
                    disabled={isAsking}
                    className="py-3.5 px-5 rounded-2xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-cute text-base flex items-center gap-1.5 shadow-md active:scale-95"
                  >
                    <Send className="w-5 h-5" />
                    <span>질문하기</span>
                  </button>
                </div>

                {isAsking && (
                  <div className="p-3 text-center text-sm font-cute text-emerald-800 animate-pulse bg-white/80 rounded-2xl border border-emerald-200">
                    어동이가 공단 소식에서 정답을 열심히 찾고 있습니다... 🐬✨
                  </div>
                )}

                {aiAnswer && (
                  <div className={`p-4 rounded-2xl mt-3 shadow-sm ${highContrast ? 'bg-black border border-yellow-400 text-yellow-300' : 'bg-white border-2 border-emerald-300 text-slate-900'
                    }`}>
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-emerald-100 font-cute">
                      <span className="text-emerald-800 text-base flex items-center gap-1.5">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        어동이의 답변 {aiAnswer.isDemo && '(데모 상태)'}
                      </span>
                      <button
                        onClick={() => playVoice(aiAnswer.voiceScript)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-xs font-cute flex items-center gap-1 shadow-sm"
                      >
                        <Volume2 className="w-4 h-4" />
                        <span>답변 다시 듣기</span>
                      </button>
                    </div>
                    <p className={`${textClass} whitespace-pre-line leading-relaxed font-cute`}>
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
                  className="inline-flex items-center gap-1.5 text-base font-cute text-[#0284C7] hover:underline"
                >
                  <span>한국어촌어항공단 공식 홈페이지 원문 확인하기</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. 스마트폰 QR 코드 모달 */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-[36px] p-6 max-w-sm w-full text-center shadow-2xl relative border-4 border-sky-200">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-2">
              <img src="/eodongi_official.png" alt="어동이 QR" className="w-20 h-20 object-contain mx-auto" />
            </div>

            <h3 className="font-cute text-2xl mb-1 text-[#0284C7]">
              스마트폰으로 간편하게 듣기 📱
            </h3>
            <p className="text-xs text-slate-500 mb-4 font-cute">
              스마트폰 기본 카메라로 아래 QR 코드를 비추시면 복잡한 주소 입력 없이 바로 열립니다.
            </p>
            {qrDataUrl ? (
              <div className="p-3 bg-sky-50 rounded-2xl inline-block border-2 border-sky-200 mb-4 shadow-inner">
                <img src={qrDataUrl} alt="스마트폰 접속 QR코드" className="w-48 h-48 mx-auto" />
              </div>
            ) : (
              <div className="w-48 h-48 bg-slate-100 rounded-2xl mx-auto flex items-center justify-center text-xs text-slate-400 font-cute">
                QR 생성 중...
              </div>
            )}
            <p className="text-xs font-cute text-emerald-900 bg-emerald-50 py-2.5 px-3 rounded-2xl border-2 border-emerald-200">
              별도의 앱 설치나 로그인 없이 바로 이용하실 수 있습니다 🐚
            </p>
          </div>
        </div>
      )}

      {/* 10. 관리자 로그인 모달 */}
      <AdminLoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSuccess={() => {
          setShowLoginModal(false);
          router.push('/admin');
        }}
      />
    </div>
  );
}

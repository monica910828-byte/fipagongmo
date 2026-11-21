'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Volume2, VolumeX, Play, Pause, RotateCcw, Search,
  ExternalLink, Mic, MicOff, Send, QrCode,
  CheckCircle, ChevronLeft, ChevronRight, X, AlertCircle, Sparkles,
  Heart, Waves, Music, MessageCircle, Star, Compass, ShieldCheck,
  Calendar, Headphones, SkipBack, SkipForward
} from 'lucide-react';
import Eodongi from '@/components/Eodongi';
import { useFirebaseAuth } from '@/lib/useFirebaseAuth';
import AdminLoginModal from '@/components/AdminLoginModal';
import FormattedFullContent from '@/components/FormattedFullContent';

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
  rawContent?: string;
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

  // 게시 일자별 검색 및 필터 상태
  const [selectedDate, setSelectedDate] = useState<string>('ALL');
  const [customDatePicker, setCustomDatePicker] = useState<string>('');

  // 게시 일자별 한번에 음성 듣기 (연속 재생 플레이리스트) 상태
  const [playlist, setPlaylist] = useState<Post[]>([]);
  const [playlistIndex, setPlaylistIndex] = useState<number>(0);
  const [isPlaylistActive, setIsPlaylistActive] = useState<boolean>(false);
  const [playlistDate, setPlaylistDate] = useState<string>('');
  const [isPlaylistPaused, setIsPlaylistPaused] = useState<boolean>(false);

  const playlistRef = useRef<Post[]>([]);
  const playlistIndexRef = useRef<number>(0);
  const isPlaylistActiveRef = useRef<boolean>(false);
  const isPlaylistPausedRef = useRef<boolean>(false);

  // 고령자 및 누구나 맞춤 글자 크기 / 재생 속도 / 고대비
  const [fontSizeLevel, setFontSizeLevel] = useState<'normal' | 'large' | 'xlarge'>('large');
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [highContrast, setHighContrast] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  // 상세 모달, 질문하기 모달 및 오디오 재생 상태
  const [activePost, setActivePost] = useState<Post | null>(null);
  const [askModalPost, setAskModalPost] = useState<Post | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  // 음성/텍스트 질의응답
  const [userQuestion, setUserQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<{ text: string; voiceScript: string; isDemo: boolean; diagnostics?: any } | null>(null);

  // 브라우저 TTS SpeechSynthesis 관리
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const openPost = (post: Post) => {
    setAskModalPost(null);
    setActivePost(post);
    setCurrentCardIndex(0);
    setUserQuestion('');
    setAiAnswer(null);
    // 소식 열람 횟수 비동기 집계
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'READ',
        postId: post.id,
        postTitle: post.title,
        boardName: post.boardName,
      }),
    }).catch(() => {});
  };

  const openAskModal = (post: Post) => {
    setActivePost(null);
    setAskModalPost(post);
    setUserQuestion('');
    setAiAnswer(null);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
      // 사용자가 이전에 선택한 글자 크기 복원
      const saved = localStorage.getItem('fipa_font_size_level');
      if (saved === 'normal' || saved === 'large' || saved === 'xlarge') {
        setFontSizeLevel(saved);
      }
    }
    loadPosts();
    loadQrCode();

    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  // 글자 크기 변경 시 <html> data-font-size 동기화 (globals.css의 PC/모바일 반응형 미디어쿼리로 안전하게 스케일링)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-font-size', fontSizeLevel);
      // 인라인 fontSize가 남아 모바일 미디어쿼리를 덮어쓰지 않도록 초기화
      document.documentElement.style.removeProperty('font-size');
      try {
        localStorage.setItem('fipa_font_size_level', fontSizeLevel);
      } catch (_) {}
    }
  }, [fontSizeLevel]);

  // 모달 열림 시 모바일 배경 스크롤 잠금 (iOS Safari 스크롤 뚫림 방지)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const isAnyModalOpen = Boolean(activePost || askModalPost || showQrModal || showLoginModal);
    if (isAnyModalOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [activePost, askModalPost, showQrModal, showLoginModal]);

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

  // TTS 발음 교정 (화면 텍스트는 유지하고 음성 읽기 시 FIPA/FiPA/fipa를 '피파'로 자연스럽게 발음)
  function normalizeTextForTts(text: string): string {
    return (text || '').replace(/(^|[^A-Za-z])fipa(?![A-Za-z])/gi, '$1피파');
  }

  // TTS 음성 재생 함수 (단일)
  function playVoice(textToSpeak: string) {
    if (!synthRef.current) {
      alert('사용하시는 기기에서 브라우저 음성 안내(TTS)를 지원하지 않습니다.');
      return;
    }

    // 만약 일자별 연속 재생 중이었다면 연속 재생 종료
    if (isPlaylistActiveRef.current) {
      setIsPlaylistActive(false);
      isPlaylistActiveRef.current = false;
      setIsPlaylistPaused(false);
      isPlaylistPausedRef.current = false;
    }

    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(normalizeTextForTts(textToSpeak));
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
    if (isPlaylistActiveRef.current) {
      setIsPlaylistActive(false);
      isPlaylistActiveRef.current = false;
      setIsPlaylistPaused(false);
      isPlaylistPausedRef.current = false;
    }
  }

  function toggleVoice(textToSpeak: string) {
    if (isPlaying) {
      stopVoice();
    } else {
      playVoice(textToSpeak);
    }
  }

  // 게시 일자별 한 번에 음성 듣기 (연속 재생)
  function startPlaylist(targetDate: string) {
    if (!synthRef.current) {
      alert('사용하시는 기기에서 브라우저 음성 안내(TTS)를 지원하지 않습니다.');
      return;
    }

    const targetPosts = posts.filter(p => p.registeredDate === targetDate);
    if (targetPosts.length === 0) {
      alert(`${targetDate}에 등록된 소식이 없습니다.`);
      return;
    }

    synthRef.current.cancel();
    setPlaylist(targetPosts);
    playlistRef.current = targetPosts;
    setPlaylistIndex(0);
    playlistIndexRef.current = 0;
    setPlaylistDate(targetDate);
    setIsPlaylistActive(true);
    isPlaylistActiveRef.current = true;
    setIsPlaylistPaused(false);
    isPlaylistPausedRef.current = false;

    playPlaylistItem(0, targetPosts, targetDate, true);
  }

  function playPlaylistItem(index: number, items: Post[], dateLabel: string, isFirst = false) {
    if (!synthRef.current) return;
    synthRef.current.cancel();

    if (index >= items.length) {
      // 모든 소식 재생 완료
      const finishUtterance = new SpeechSynthesisUtterance(
        normalizeTextForTts(
          `${dateLabel} 등록된 공단 소식 총 ${items.length}건을 모두 들려드렸습니다. 바다와 어촌 소식에 관심 가져주셔서 감사합니다!`
        )
      );
      finishUtterance.lang = 'ko-KR';
      finishUtterance.rate = speechRate;
      finishUtterance.pitch = 1.1;
      const voices = synthRef.current.getVoices();
      const koreanVoice = voices.find(v => v.lang.includes('ko') || v.lang.includes('KO'));
      if (koreanVoice) finishUtterance.voice = koreanVoice;

      finishUtterance.onend = () => {
        setIsPlaying(false);
        setIsPlaylistActive(false);
        isPlaylistActiveRef.current = false;
      };
      synthRef.current.speak(finishUtterance);
      return;
    }

    const currentPost = items[index];
    setPlaylistIndex(index);
    playlistIndexRef.current = index;

    // 소식 열람 횟수 비동기 집계
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'READ',
        postId: currentPost.id,
        postTitle: currentPost.title,
        boardName: currentPost.boardName,
      }),
    }).catch(() => {});

    let textToSpeak = '';
    const postBody = currentPost.voiceScript || currentPost.easyExplanation || currentPost.summary;
    if (isFirst) {
      textToSpeak = `${dateLabel} 등록 공단 소식 총 ${items.length}건을 차례대로 들려드릴게요. 첫 번째 소식입니다. ${currentPost.title}. ${postBody}`;
    } else {
      textToSpeak = `${index + 1}번째 소식입니다. ${currentPost.title}. ${postBody}`;
    }

    const utterance = new SpeechSynthesisUtterance(normalizeTextForTts(textToSpeak));
    utterance.lang = 'ko-KR';
    utterance.rate = speechRate;
    utterance.pitch = 1.1;

    const voices = synthRef.current.getVoices();
    const koreanVoice = voices.find(v => v.lang.includes('ko') || v.lang.includes('KO'));
    if (koreanVoice) utterance.voice = koreanVoice;

    utterance.onstart = () => {
      setIsPlaying(true);
    };

    utterance.onend = () => {
      if (!isPlaylistActiveRef.current || isPlaylistPausedRef.current) {
        setIsPlaying(false);
        return;
      }
      setTimeout(() => {
        if (isPlaylistActiveRef.current && !isPlaylistPausedRef.current) {
          playPlaylistItem(index + 1, items, dateLabel, false);
        }
      }, 900);
    };

    utterance.onerror = (e) => {
      console.error('연속 재생 오류:', e);
      setIsPlaying(false);
    };

    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  }

  function skipToNextPost() {
    const curIdx = playlistIndexRef.current;
    const items = playlistRef.current;
    if (curIdx + 1 < items.length) {
      playPlaylistItem(curIdx + 1, items, playlistDate, false);
    } else {
      stopPlaylist();
    }
  }

  function skipToPrevPost() {
    const curIdx = playlistIndexRef.current;
    const items = playlistRef.current;
    if (curIdx > 0) {
      playPlaylistItem(curIdx - 1, items, playlistDate, false);
    } else {
      playPlaylistItem(0, items, playlistDate, false);
    }
  }

  function togglePlaylistPause() {
    if (!synthRef.current) return;
    if (isPlaylistPaused) {
      synthRef.current.resume();
      setIsPlaylistPaused(false);
      isPlaylistPausedRef.current = false;
      setIsPlaying(true);
    } else {
      synthRef.current.pause();
      setIsPlaylistPaused(true);
      isPlaylistPausedRef.current = true;
      setIsPlaying(false);
    }
  }

  function stopPlaylist() {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsPlaylistActive(false);
    isPlaylistActiveRef.current = false;
    setIsPlaylistPaused(false);
    isPlaylistPausedRef.current = false;
    setIsPlaying(false);
  }

  // 어동이 5줄 이내 핵심 소식 요약 생성
  function getExecutiveSummary(post: Post) {
    let text = post.easyExplanation || post.summary || '';

    // 공통 보일러플레이트 문구 제거
    text = text.replace(/한국어촌어항공단에서 전해드리는 소식입니다\.?/g, '');
    text = text.replace(/글자가 작아 읽기 어려우시다면[^]*?읽어드립니다\.?/g, '');
    text = text.replace(/\[핵심 내용\]/g, '');

    // 일정 및 문의처 추출
    const dateMatch = text.match(/• 관련 일정:?\s*([^\n]+)/);
    const phoneMatch = text.match(/• 문의 전화:?\s*([^\n]+)/);

    text = text.replace(/• 관련 일정:?[^\n]+/g, '');
    text = text.replace(/• 문의 전화:?[^\n]+/g, '');

    // 공백 정돈
    let clean = text
      .replace(/\r\n/g, ' ')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 제목/부제 반복 제거
    clean = clean.replace(/^[“"][^"”]+["”]\s*-?\s*/, '');
    clean = clean.replace(/^-{1,2}\s*[^-\n]+\s*-{1,2}\s*/, '');
    clean = clean.replace(/^[■◆▶□▲●★]\s*[가-힣\s]+\s*(ㅇ\s*)?/, '');

    // 문장 단위로 분리하여 1~2개 핵심 문장 추출 (최대 160자 내외)
    const sentences = clean.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5);
    let summarySentences: string[] = [];
    let curLength = 0;

    for (const s of sentences) {
      if (summarySentences.length < 2 && (curLength + s.length) <= 170) {
        summarySentences.push(s.trim());
        curLength += s.length;
      }
    }

    if (summarySentences.length === 0 && sentences[0]) {
      summarySentences.push(sentences[0].slice(0, 140) + '...');
    }

    return {
      summaryText: summarySentences.join(' ') || clean.slice(0, 140),
      dateInfo: dateMatch ? dateMatch[1].trim() : null,
      phoneInfo: phoneMatch ? phoneMatch[1].trim() : null,
    };
  }

  // 음성 인식 (STT) 시작
  function startVoiceRecognition(targetPostId?: string) {
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
      handleAskQuestion(transcript, targetPostId);
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
  async function handleAskQuestion(query?: string, targetPostId?: string) {
    const q = (query || userQuestion).trim();
    if (!q) return;

    setIsAsking(true);
    setAiAnswer(null);

    try {
      let idToken = '';
      if (user) {
        try {
          idToken = await user.getIdToken();
        } catch {}
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const resolvedPostId = targetPostId || askModalPost?.id || activePost?.id || undefined;

      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question: q,
          postId: resolvedPostId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAiAnswer({
          text: data.answer,
          voiceScript: data.voiceScript,
          isDemo: data.isDemo,
          diagnostics: data.diagnostics,
        });
      } else {
        alert(data.error || '답변을 불러오지 못했습니다.');
      }
    } catch (e: any) {
      console.error('질문 전송 오류:', e);
      alert('질문 처리 중 통신 오류가 발생했습니다.');
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

  // 고유 게시 일자 목록 및 일자별 건수 집계
  const uniqueDateList = React.useMemo(() => {
    const dateCounts: Record<string, number> = {};
    posts.forEach((p) => {
      if (p.registeredDate) {
        dateCounts[p.registeredDate] = (dateCounts[p.registeredDate] || 0) + 1;
      }
    });
    return Object.entries(dateCounts)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, count]) => ({ date, count }));
  }, [posts]);

  // 현재 선택된 일자 또는 최신 일자
  const currentTargetDate = selectedDate !== 'ALL' ? selectedDate : (uniqueDateList[0]?.date || '');
  const postsForCurrentDate = posts.filter(p => p.registeredDate === currentTargetDate);

  // 필터링된 게시물 (카테고리 + 게시 일자 + 검색어)
  const filteredPosts = posts.filter((post) => {
    const matchesBoard = selectedBoard === 'ALL' || post.boardType === selectedBoard;
    const matchesDate = selectedDate === 'ALL' || post.registeredDate === selectedDate;
    if (!matchesBoard || !matchesDate) return false;

    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase().trim();
    const titleMatch = post.title.toLowerCase().includes(query);
    const summaryMatch = (post.summary || '').toLowerCase().includes(query);
    const easyMatch = (post.easyExplanation || '').toLowerCase().includes(query);
    const rawMatch = (post.rawContent || '').toLowerCase().includes(query);

    // 일자 검색 지원 (예: 2026.11.18, 11.18, 11-18, 11월 18일)
    const postDate = post.registeredDate || '';
    const dateMatch =
      postDate.includes(query) ||
      postDate.replace(/\./g, '-').includes(query) ||
      postDate.slice(5).includes(query) ||
      postDate.replace(/\./g, '년 ').replace(/([0-9]{2})$/, '$1일').includes(query);

    return titleMatch || summaryMatch || easyMatch || rawMatch || dateMatch;
  });

  return (
    <div className={`min-h-screen ${highContrast ? 'bg-zinc-950 text-yellow-300' : 'bg-[#F2F8FD] text-slate-900'} pb-24 transition-colors font-cute selection:bg-amber-200`}>
      
      {/* 1. 귀엽고 아기자기한 무지개빛 상단 헤더 */}
      <header className={`${highContrast ? 'bg-zinc-900 border-b-4 border-yellow-400' : 'bg-gradient-to-r from-[#38BDF8] via-[#0284C7] to-[#0369A1] text-white shadow-md'} sticky top-0 z-40 transition-colors`}>
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2">
          
          {/* 공식 캐릭터와 귀여운 타이틀 */}
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div 
              className="relative group cursor-pointer flex-shrink-0" 
              onClick={() => playVoice('공단 소식 도우미 어동이입니다! 듣고 싶은 소식을 쏙쏙 골라보세요!')}
              title="어동이 누르기"
            >
              <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-white p-1 sm:p-1.5 shadow-md flex items-center justify-center transform transition-transform group-hover:scale-110 group-hover:rotate-3 border-2 border-amber-300">
                <img 
                  src="/eodongi_official.png" 
                  alt="한국어촌어항공단 캐릭터 어동이" 
                  className="w-8 h-8 sm:w-10 sm:h-10 object-contain drop-shadow" 
                />
              </div>
              <span className="absolute -top-1 -right-1 text-xs sm:text-sm animate-bounce">✨</span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-cute text-xl sm:text-2xl md:text-3xl tracking-wide flex items-center text-white drop-shadow-sm whitespace-nowrap">
                  <span>FiPA 들려드림</span>
                </h1>
                <span className="hidden sm:inline-flex text-xs bg-amber-300 text-blue-950 font-cute px-2.5 py-0.5 rounded-full shadow-sm items-center gap-1 animate-cute-wiggle whitespace-nowrap">
                  <span>어동이와 바다 여행</span> 🐬
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-sky-100 font-cute flex items-center gap-1 opacity-95 leading-tight">
                <span className="break-keep">한국어촌어항공단 소식 쉬운 음성안내</span>
                <span className="inline-block text-amber-200 flex-shrink-0">★</span>
              </p>
            </div>
          </div>

          {/* 우측 스마트폰 연결 & 관리자 버튼 (모바일 최소 44px 터치 영역 확보) */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <button
              onClick={() => setShowQrModal(true)}
              className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-2xl bg-white/20 hover:bg-white/30 text-white text-xs md:text-sm font-cute flex items-center justify-center gap-1.5 border border-white/40 shadow-sm transition-all hover:scale-105 active:scale-95"
              title="스마트폰 카메라로 바로 열기"
              aria-label="스마트폰 연결 QR코드"
            >
              <QrCode className="w-4 h-4 text-amber-300 flex-shrink-0" />
              <span className="hidden sm:inline whitespace-nowrap">스마트폰 연결</span>
            </button>
            <button
              onClick={() => {
                if (user) {
                  router.push('/admin');
                } else {
                  setShowLoginModal(true);
                }
              }}
              className="min-h-[44px] sm:min-h-0 px-2.5 sm:px-3.5 py-2 sm:py-1.5 rounded-2xl bg-amber-300 hover:bg-amber-200 text-blue-950 text-xs md:text-sm font-cute shadow-md transition-all hover:scale-105 active:scale-95 border-2 border-white flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap"
              title="관리자 전용 대시보드"
            >
              <ShieldCheck className="w-4 h-4 text-blue-950 flex-shrink-0" />
              <span className="sm:hidden">{user ? '관리자' : '관리자'}</span>
              <span className="hidden sm:inline">{user ? '관리자 대시보드' : '관리자 모드'}</span>
            </button>
          </div>
        </div>

        {/* 2. 유치원/시니어 친화 맞춤 설정 바 (모바일 터치 친화 반응형) */}
        <div className={`${highContrast ? 'bg-zinc-950 border-t border-yellow-400/50' : 'bg-[#0275B1] text-white'} px-3 sm:px-4 py-2 border-t border-white/20`}>
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-xs md:text-sm font-cute">
            
            {/* 글자 크기 조절 (젤리 모양) */}
            <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
              <span className="mr-0.5 text-sky-100 whitespace-nowrap">글자 크기:</span>
              <button
                onClick={() => setFontSizeLevel('normal')}
                className={`min-h-[36px] sm:min-h-0 px-2.5 sm:px-3 py-1 rounded-2xl font-cute transition-all shadow-sm whitespace-nowrap ${fontSizeLevel === 'normal' ? 'bg-amber-300 text-blue-950 ring-2 ring-white scale-105' : 'bg-white/20 hover:bg-white/30 text-white'}`}
              >
                보통
              </button>
              <button
                onClick={() => setFontSizeLevel('large')}
                className={`min-h-[36px] sm:min-h-0 px-2.5 sm:px-3 py-1 rounded-2xl font-cute transition-all shadow-sm whitespace-nowrap ${fontSizeLevel === 'large' ? 'bg-amber-300 text-blue-950 ring-2 ring-white scale-105' : 'bg-white/20 hover:bg-white/30 text-white'}`}
              >
                크게
              </button>
              <button
                onClick={() => setFontSizeLevel('xlarge')}
                className={`min-h-[36px] sm:min-h-0 px-2.5 sm:px-3 py-1 rounded-2xl font-cute transition-all shadow-sm whitespace-nowrap ${fontSizeLevel === 'xlarge' ? 'bg-amber-300 text-blue-950 ring-2 ring-white scale-105' : 'bg-white/20 hover:bg-white/30 text-white'}`}
              >
                아주 크게
              </button>
            </div>

            {/* 음성 속도 & 고대비 모드 */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1">
                <span className="mr-0.5 text-sky-100 whitespace-nowrap">속도:</span>
                <button
                  onClick={() => setSpeechRate(0.8)}
                  className={`min-h-[36px] sm:min-h-0 px-2.5 py-1 rounded-2xl font-cute transition-all shadow-sm whitespace-nowrap ${speechRate === 0.8 ? 'bg-amber-300 text-blue-950 ring-2 ring-white' : 'bg-white/20 hover:bg-white/30 text-white'}`}
                >
                  🐢 천천히
                </button>
                <button
                  onClick={() => setSpeechRate(1.0)}
                  className={`min-h-[36px] sm:min-h-0 px-2.5 py-1 rounded-2xl font-cute transition-all shadow-sm whitespace-nowrap ${speechRate === 1.0 ? 'bg-amber-300 text-blue-950 ring-2 ring-white' : 'bg-white/20 hover:bg-white/30 text-white'}`}
                >
                  🐰 보통
                </button>
              </div>

              <button
                onClick={() => setHighContrast(!highContrast)}
                className={`min-h-[36px] sm:min-h-0 px-2.5 sm:px-3 py-1 rounded-2xl font-cute border transition-all whitespace-nowrap ${highContrast ? 'bg-yellow-400 text-black border-yellow-300 shadow' : 'bg-white/25 border-white/40 hover:bg-white/35 text-white'}`}
              >
                {highContrast ? '눈 편한 모드로' : '선명하게 보기'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 컨테이너 */}
      <main className="max-w-4xl mx-auto px-3 sm:px-4 pt-3 sm:pt-4">
        
        {/* 3. 🌟 공식 어동이 캐릭터 웰컴 배너 (유치원생이 좋아하는 알록달록 디자인) */}
        <div className={`mb-4 sm:mb-5 p-4 sm:p-5 md:p-6 rounded-[26px] sm:rounded-[32px] ${highContrast
          ? 'bg-zinc-900 border-4 border-yellow-400'
          : 'bg-gradient-to-r from-sky-100 via-amber-50 to-pink-50 border-4 border-sky-200/90 shadow-md'
          } relative overflow-hidden transition-all`}>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 relative z-10">
            {/* 공식 어동이 캐릭터 (홈페이지 공식 마스코트 활용) */}
            <div 
              className="flex-shrink-0 cursor-pointer" 
              onClick={() => playVoice('한국어촌어항공단 소식을 재미있고 쉽게 들려드릴게요! 원하는 소식을 꾹 눌러보세요!')}
              title="어동이 목소리 듣기"
            >
              <Eodongi
                pose="greeting"
                size={115}
                speechText="소식을 쏙쏙 들려줄게요! 🐬✨"
                showSparkle={true}
                className="hover:scale-105 transition-transform"
              />
            </div>

            {/* 귀여운 설명 텍스트 */}
            <div className="text-center sm:text-left flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/90 text-[#0284C7] font-cute text-xs md:text-sm mb-2 shadow-sm border border-sky-200 max-w-full">
                <Sparkles className="w-4 h-4 text-amber-500 animate-spin flex-shrink-0" />
                <span className="break-keep">공단 공식 캐릭터 어동이가 함께해요</span>
                <span className="text-pink-500 flex-shrink-0">🌸</span>
              </div>
              <h2 className={`font-cute text-xl md:text-2xl mb-1.5 leading-snug break-keep ${highContrast ? 'text-yellow-300' : 'text-slate-900'}`}>
                알기 쉬운 바다·어촌 이야기 🌊
              </h2>
              <p className={`text-base leading-relaxed font-cute break-keep ${highContrast ? 'text-yellow-100' : 'text-slate-700'}`}>
                공단 홈페이지에 새 소식이 올라오면 <strong>홍보담당자가 따로 올리지 않아도 자동으로 쏙쏙 모아서</strong>, 어동이가 귀여운 글과 다정한 목소리로 읽어드립니다.
              </p>
            </div>
          </div>

          {/* 배경 귀여운 장식 스티커들 */}
          <div className="absolute right-3 -bottom-3 text-6xl sm:text-7xl opacity-15 pointer-events-none select-none">
            🐬
          </div>
          <div className="absolute left-6 -top-2 text-3xl sm:text-4xl opacity-15 pointer-events-none select-none">
            🎈
          </div>
        </div>

        {/* 4. 알록달록 조약돌 카테고리 탭 (마시멜로 버튼 스타일) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none touch-pan-x mb-3 sm:mb-4 -mx-3 px-3 sm:mx-0 sm:px-0">
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
                className={`min-h-[44px] rounded-[22px] font-cute whitespace-nowrap transition-all flex items-center gap-1.5 shadow-sm flex-shrink-0 active:scale-95 ${
                  fontSizeLevel === 'xlarge' ? 'text-base sm:text-lg md:text-xl px-4 sm:px-5 py-2.5 sm:py-3' : 'text-base md:text-lg px-4 py-2.5'
                } ${isSelected
                  ? (highContrast ? 'bg-yellow-400 text-black shadow-md ring-4 ring-yellow-300' : `bg-gradient-to-r ${tab.color} text-white shadow-md scale-[1.03] ring-2 ring-white`)
                  : (highContrast ? 'bg-zinc-800 text-yellow-200 hover:bg-zinc-700' : 'bg-white text-slate-700 hover:bg-sky-50 border-2 border-sky-100 hover:border-sky-300')
                  }`}
              >
                <span className={fontSizeLevel === 'xlarge' ? 'text-xl' : 'text-lg'}>{tab.emoji}</span>
                <span>{tab.name}</span>
              </button>
            );
          })}
        </div>

        {/* 5. 귀여운 검색창 (어동이 돋보기 테마 - 모바일 16px 이상으로 iOS 자동 확대 방지) */}
        <div className="relative mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="찾고 싶은 소식 검색 (예: 교육, 공모, 11.16)"
            className={`w-full min-h-[52px] py-3.5 sm:py-4 pl-11 sm:pl-12 pr-12 rounded-[24px] sm:rounded-[28px] font-cute border-4 transition-all ${
              fontSizeLevel === 'xlarge' ? 'text-base sm:text-lg md:text-xl' : 'text-base md:text-lg'
            } ${highContrast
              ? 'bg-zinc-900 border-yellow-400 text-yellow-300 placeholder-yellow-500/60 focus:ring-4 focus:ring-yellow-300'
              : 'bg-white border-sky-200 text-slate-900 placeholder-slate-400 shadow-sm focus:border-sky-400 focus:ring-4 focus:ring-sky-100'
              }`}
          />
          <Search className={`w-5 h-5 sm:w-6 sm:h-6 absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 ${highContrast ? 'text-yellow-400' : 'text-[#0284C7]'}`} />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
              aria-label="검색어 지우기"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* 5-1. 📅 게시 일자별 검색 & 모아보기 바 */}
        <div className={`p-3.5 sm:p-4 md:p-5 rounded-[24px] sm:rounded-[28px] mb-5 border-2 sm:border-3 transition-all ${highContrast ? 'bg-zinc-900 border-yellow-400 text-yellow-300' : 'bg-white border-sky-200/90 shadow-sm'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`p-1.5 rounded-xl flex-shrink-0 ${highContrast ? 'bg-yellow-400 text-black' : 'bg-sky-100 text-[#0284C7]'}`}>
                <Calendar className={fontSizeLevel === 'xlarge' ? 'w-6 h-6' : 'w-5 h-5'} />
              </div>
              <div className="min-w-0">
                <h3 className={`font-cute font-bold flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 leading-snug ${
                  fontSizeLevel === 'xlarge' ? 'text-lg md:text-xl' : 'text-base md:text-lg'
                }`}>
                  <span>게시 일자별 소식 모아보기</span>
                  <span className={`${fontSizeLevel === 'xlarge' ? 'text-sm' : 'text-xs'} font-normal opacity-75`}>(원하시는 날짜를 콕 눌러보세요)</span>
                </h3>
              </div>
            </div>

            {/* 일자 필터가 켜져 있을 때 선택된 일자 배지 및 초기화 버튼 */}
            {selectedDate !== 'ALL' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`px-3 py-1 rounded-full font-cute font-bold flex items-center gap-1 ${
                  fontSizeLevel === 'xlarge' ? 'text-sm md:text-base' : 'text-xs md:text-sm'
                } ${
                  highContrast ? 'bg-yellow-400 text-black' : 'bg-amber-100 text-amber-950 border border-amber-300'
                }`}>
                  <span>📅 {selectedDate} 소식 ({filteredPosts.length}건)</span>
                </span>
                <button
                  onClick={() => {
                    setSelectedDate('ALL');
                    setCustomDatePicker('');
                  }}
                  className={`min-h-[36px] px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-cute transition-colors flex items-center gap-1 ${
                    fontSizeLevel === 'xlarge' ? 'text-sm' : 'text-xs'
                  }`}
                  title="날짜 필터 해제"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>전체보기</span>
                </button>
              </div>
            )}
          </div>

          {/* 일자 빠른 선택 칩 버튼들 + 달력 피커 */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setSelectedDate('ALL');
                setCustomDatePicker('');
              }}
              className={`min-h-[40px] rounded-2xl font-cute transition-all flex items-center gap-1 shadow-2xs ${
                fontSizeLevel === 'xlarge' ? 'text-sm md:text-base px-4 py-2' : 'text-sm px-3.5 py-1.5'
              } ${
                selectedDate === 'ALL'
                  ? (highContrast ? 'bg-yellow-400 text-black font-bold ring-2 ring-yellow-200' : 'bg-[#0284C7] text-white font-bold shadow-sm scale-102')
                  : (highContrast ? 'bg-zinc-800 text-yellow-200 hover:bg-zinc-700' : 'bg-slate-100 text-slate-700 hover:bg-sky-50 border border-slate-200')
              }`}
            >
              <span>전체 일자</span>
              <span className="opacity-75">({posts.length})</span>
            </button>

            {uniqueDateList.slice(0, 5).map(({ date, count }) => {
              const isSelected = selectedDate === date;
              const monthDay = date.slice(5); // '11.18'
              return (
                <button
                  key={date}
                  onClick={() => {
                    setSelectedDate(date);
                    setCustomDatePicker(date.replace(/\./g, '-'));
                  }}
                  className={`min-h-[40px] rounded-2xl font-cute transition-all flex items-center gap-1 shadow-2xs ${
                    fontSizeLevel === 'xlarge' ? 'text-sm md:text-base px-4 py-2' : 'text-sm px-3.5 py-1.5'
                  } ${
                    isSelected
                      ? (highContrast ? 'bg-yellow-400 text-black font-bold ring-2 ring-yellow-200' : 'bg-[#0284C7] text-white font-bold shadow-sm scale-102')
                      : (highContrast ? 'bg-zinc-800 text-yellow-200 hover:bg-zinc-700' : 'bg-sky-50/80 text-sky-900 hover:bg-sky-100 border border-sky-200')
                  }`}
                >
                  <span>📅 {monthDay}</span>
                  <span className="text-xs opacity-75">({count}건)</span>
                </button>
              );
            })}

            {/* 직접 날짜 선택 input */}
            <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto sm:ml-auto pt-1 sm:pt-0">
              <span className={`${fontSizeLevel === 'xlarge' ? 'text-sm' : 'text-xs sm:text-sm'} font-cute ${highContrast ? 'text-yellow-200' : 'text-slate-600'} whitespace-nowrap`}>달력에서 선택:</span>
              <input
                type="date"
                value={customDatePicker}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomDatePicker(val);
                  if (val) {
                    setSelectedDate(val.replace(/-/g, '.'));
                  } else {
                    setSelectedDate('ALL');
                  }
                }}
                className={`min-h-[44px] sm:min-h-[38px] rounded-xl font-cute border transition-colors text-base sm:text-xs px-3 py-1.5 ${
                  highContrast
                    ? 'bg-zinc-800 border-yellow-400 text-yellow-200'
                    : 'bg-white border-sky-200 text-slate-700 shadow-2xs hover:border-sky-400'
                }`}
              />
            </div>
          </div>

          {/* 5-2. 🎧 게시 일자별 한 번에 음성 듣기 (연속 재생 배너) */}
          {currentTargetDate && postsForCurrentDate.length > 0 && (
            <div className={`mt-3.5 pt-3.5 border-t-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-2xl border ${
              highContrast
                ? 'border-yellow-400/60 bg-zinc-800 text-yellow-200'
                : 'border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50'
            }`}>
              <div className="flex items-start sm:items-center gap-3 w-full sm:w-auto min-w-0">
                <div className={`w-11 h-11 rounded-2xl p-1 shadow-sm flex items-center justify-center border-2 flex-shrink-0 ${
                  highContrast ? 'bg-black border-yellow-400 text-yellow-300' : 'bg-white border-emerald-300 text-emerald-600'
                }`}>
                  <Headphones className="w-6 h-6 animate-bounce" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span className={`font-cute font-bold break-keep ${
                      fontSizeLevel === 'xlarge' ? 'text-base md:text-lg' : 'text-sm md:text-base'
                    }`}>
                      📅 {currentTargetDate} 소식 한 번에 다 듣기
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-cute font-bold whitespace-nowrap ${
                      fontSizeLevel === 'xlarge' ? 'text-sm' : 'text-xs'
                    } ${
                      highContrast ? 'bg-yellow-400 text-black' : 'bg-emerald-200 text-emerald-950'
                    }`}>
                      총 {postsForCurrentDate.length}건 연속
                    </span>
                  </div>
                  <p className={`${fontSizeLevel === 'xlarge' ? 'text-sm' : 'text-xs sm:text-sm'} opacity-80 font-cute mt-1 leading-relaxed break-keep`}>
                    어동이가 {currentTargetDate}에 올라온 소식들을 라디오처럼 차례대로 읽어드려요 📻
                  </p>
                </div>
              </div>

              <button
                onClick={() => startPlaylist(currentTargetDate)}
                className={`w-full sm:w-auto min-h-[46px] rounded-2xl font-cute font-bold shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 flex-shrink-0 ${
                  fontSizeLevel === 'xlarge' ? 'text-base md:text-lg px-5 py-3' : 'text-base px-5 py-2.5'
                } ${
                  highContrast
                    ? 'bg-yellow-400 text-black hover:bg-yellow-300'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white'
                }`}
              >
                <Volume2 className="w-5 h-5 text-amber-300 flex-shrink-0" />
                <span>이 날짜 소식 한 번에 듣기</span>
              </button>
            </div>
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
                  className={`p-4 sm:p-5 md:p-6 rounded-[24px] sm:rounded-[30px] transition-all relative ${highContrast
                    ? 'bg-zinc-900 border-4 border-yellow-400 hover:border-white shadow-md'
                    : 'bg-white border-4 border-sky-100/80 hover:border-sky-300 hover:shadow-xl shadow-sm'
                    }`}
                >
                  {/* 상단 귀여운 뱃지 및 등록일 (모바일에서 겹치지 않도록 자동 줄바꿈) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className={`px-3 py-1 rounded-2xl text-xs md:text-sm font-cute shadow-sm flex items-center gap-1 whitespace-nowrap ${post.boardType === 'CARD_NEWS'
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
                        <span className="px-2.5 py-0.5 rounded-2xl text-xs font-cute bg-rose-100 text-rose-800 border-2 border-rose-200 flex items-center gap-1 whitespace-nowrap">
                          ⚠️ 중요 정책
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => {
                          setSelectedDate(post.registeredDate);
                          setCustomDatePicker(post.registeredDate.replace(/\./g, '-'));
                        }}
                        className={`min-h-[36px] text-xs md:text-sm font-cute px-2.5 py-1 rounded-xl border transition-colors flex items-center gap-1 whitespace-nowrap ${
                          highContrast
                            ? 'bg-zinc-800 text-yellow-200 border-yellow-400 hover:bg-yellow-400 hover:text-black'
                            : 'text-slate-600 bg-sky-50 hover:bg-sky-100 border-sky-200'
                        }`}
                        title="이 날짜 소식 모아보기"
                      >
                        <Calendar className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                        <span>{post.registeredDate}</span>
                      </button>
                      <button
                        onClick={() => startPlaylist(post.registeredDate)}
                        className={`min-h-[36px] text-xs font-cute px-2.5 py-1 rounded-xl border transition-colors flex items-center gap-1 whitespace-nowrap ${
                          highContrast
                            ? 'bg-yellow-400 text-black border-yellow-300 hover:bg-yellow-300'
                            : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                        }`}
                        title={`${post.registeredDate} 등록 소식 모두 연속 듣기`}
                      >
                        <Headphones className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span>연속듣기</span>
                      </button>
                    </div>
                  </div>

                  {/* 제목 */}
                  <h3
                    onClick={() => openPost(post)}
                    className={`font-cute tracking-wide mb-3 cursor-pointer hover:text-[#0284C7] transition-colors leading-snug break-keep [overflow-wrap:anywhere] ${fontSizeLevel === 'normal' ? 'text-xl md:text-2xl' : fontSizeLevel === 'large' ? 'text-xl sm:text-2xl md:text-3xl' : 'text-2xl sm:text-3xl md:text-4xl'
                      }`}
                  >
                    {post.title}
                  </h3>

                  {/* 카드뉴스 미리보기 썸네일 또는 일반 썸네일 (비율 유지) */}
                  {post.thumbnailUrl && (
                    <div
                      onClick={() => openPost(post)}
                      className="mb-4 rounded-2xl overflow-hidden cursor-pointer aspect-video sm:aspect-auto sm:max-h-56 bg-slate-100 border-2 border-sky-100 flex items-center justify-center relative group"
                    >
                      <img
                        src={post.thumbnailUrl}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                      {post.boardType === 'CARD_NEWS' && (
                        <span className="absolute bottom-2.5 right-2.5 bg-purple-900/85 text-white text-xs md:text-sm font-cute px-3 py-1 rounded-xl backdrop-blur-sm shadow flex items-center gap-1">
                          <span>카드뉴스 그림 넘겨보기</span> 👉
                        </span>
                      )}
                    </div>
                  )}

                  {/* 쉬운 내용 3줄 이내 요약 */}
                  <p className={`${textClass} line-clamp-3 mb-4 leading-relaxed font-cute break-keep [overflow-wrap:anywhere] ${highContrast ? 'text-yellow-100' : 'text-slate-800'}`}>
                    {getExecutiveSummary(post).summaryText}
                  </p>

                  {/* 하단 버튼 액션 영역 (모바일 최소 44px 터치 영역 + PC 기존 단일 행 유지) */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t-2 border-sky-100/60">
                    <button
                      onClick={() => {
                        toggleVoice(post.voiceScript);
                        // 음성 청취 시에도 열람 통계 카운트
                        fetch('/api/analytics', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            type: 'READ',
                            postId: post.id,
                            postTitle: post.title,
                            boardName: post.boardName,
                          }),
                        }).catch(() => {});
                      }}
                      className={`w-full sm:w-auto min-h-[44px] py-2.5 px-3.5 rounded-[20px] font-cute text-base sm:text-sm md:text-base flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 ${isPlaying
                        ? 'bg-rose-500 text-white animate-pulse'
                        : (highContrast ? 'bg-yellow-400 text-black hover:bg-yellow-300 ring-2 ring-yellow-200' : 'bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white hover:brightness-105 shadow-sky-200')
                        }`}
                    >
                      {isPlaying ? <VolumeX className="w-4 h-4 flex-shrink-0" /> : <Volume2 className="w-4 h-4 text-amber-300 animate-bounce flex-shrink-0" />}
                      <span>{isPlaying ? '음성 멈추기' : '🎵 어동이 목소리로 듣기'}</span>
                    </button>

                    <button
                      onClick={() => openAskModal(post)}
                      className={`flex-1 sm:flex-initial min-h-[44px] py-2.5 px-3.5 rounded-[20px] font-cute text-sm md:text-base flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 whitespace-nowrap ${highContrast
                        ? 'bg-yellow-400 text-black hover:bg-yellow-300 border-2 border-yellow-200'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-emerald-200'
                        }`}
                    >
                      <MessageCircle className="w-4 h-4 text-amber-200 flex-shrink-0" />
                      <span>어동이에게 질문하기</span>
                    </button>

                    <button
                      onClick={() => openPost(post)}
                      className={`flex-1 sm:flex-initial min-h-[44px] py-2.5 px-3.5 rounded-[20px] font-cute text-sm md:text-base flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 whitespace-nowrap ${highContrast
                        ? 'bg-zinc-800 text-yellow-300 hover:bg-zinc-700 border-2 border-yellow-400'
                        : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-2 border-amber-300'
                        }`}
                    >
                      <span>📖 자세히 보기</span>
                    </button>

                    <a
                      href={post.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-[44px] min-h-[44px] p-2.5 rounded-[20px] bg-sky-50 hover:bg-sky-100 text-sky-700 hover:text-sky-900 transition-all shadow-sm border border-sky-200 flex items-center justify-center sm:ml-auto flex-shrink-0"
                      title="공단 홈페이지 원본 게시물 보기"
                      aria-label="공단 홈페이지 원본 게시물 보기"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* 7. 상세 보기 및 쉬운 설명 / 카드뉴스 모달 (PC 기존 모달 유지 + 모바일 전체폭 하단 시트) */}
      {activePost && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-xs"
          onClick={() => {
            stopVoice();
            setActivePost(null);
            setAiAnswer(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full sm:max-w-2xl max-h-[94dvh] sm:max-h-[92vh] rounded-t-[28px] sm:rounded-[36px] overflow-hidden flex flex-col shadow-2xl border-t-4 sm:border-4 ${highContrast ? 'bg-zinc-950 border-yellow-400 text-yellow-300' : 'bg-white border-sky-200 text-slate-900'
              }`}
          >
            
            {/* 모달 헤더 (공식 어동이 포함) */}
            <div className={`p-3.5 sm:p-5 flex items-center justify-between gap-2 border-b flex-shrink-0 ${highContrast ? 'border-yellow-400/50 bg-zinc-900' : 'bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-600 text-white'
              }`}>
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white p-1 shadow-md flex items-center justify-center border-2 border-amber-300 flex-shrink-0">
                  <img src="/eodongi_official.png" alt="어동이" className="w-8 h-8 sm:w-9 sm:h-9 object-contain" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-cute px-2.5 py-0.5 rounded-full bg-amber-300 text-blue-950 shadow-xs whitespace-nowrap">
                      {activePost.boardName}
                    </span>
                    <span className="text-xs opacity-95 font-cute whitespace-nowrap">📅 {activePost.registeredDate}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  stopVoice();
                  setActivePost(null);
                  setAiAnswer(null);
                }}
                className="min-w-[44px] min-h-[44px] p-2 rounded-2xl bg-white/25 hover:bg-white/35 text-white transition-all flex items-center justify-center flex-shrink-0"
                title="창 닫기"
                aria-label="창 닫기"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* 모달 본문 스크롤 영역 */}
            <div className="p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain space-y-5 sm:space-y-6 flex-1 bg-bubble-pattern">
              
              {/* 제목 */}
              <h2 className={`font-cute leading-snug tracking-wide break-keep [overflow-wrap:anywhere] ${fontSizeLevel === 'normal' ? 'text-xl sm:text-3xl' : 'text-2xl sm:text-4xl'
                }`}>
                {activePost.title}
              </h2>

              {/* 어동이 음성 플레이어 컨트롤 박스 (귀여운 카세트/라디오 느낌) */}
              <div className={`p-3.5 sm:p-5 rounded-[24px] sm:rounded-[28px] flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-3 ${highContrast ? 'bg-zinc-900 border-2 border-yellow-400' : 'bg-gradient-to-r from-sky-100 via-blue-50 to-pink-50 border-4 border-sky-200 shadow-sm'
                }`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0">
                    <img src="/eodongi_official.png" alt="어동이 응원" className="w-12 h-12 sm:w-16 sm:h-16 object-contain drop-shadow" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => toggleVoice(activePost.voiceScript)}
                      className={`w-full sm:w-auto min-h-[46px] px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl font-cute text-base md:text-lg shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 ${isPlaying
                        ? 'bg-rose-500 text-white animate-pulse'
                        : (highContrast ? 'bg-yellow-400 text-black' : 'bg-gradient-to-r from-sky-400 to-blue-600 text-white hover:brightness-105')
                        }`}
                    >
                      {isPlaying ? <Pause className="w-5 h-5 flex-shrink-0" /> : <Play className="w-5 h-5 text-amber-300 flex-shrink-0" />}
                      <span>{isPlaying ? '음성 멈추기' : '🎵 어동이 목소리로 재생'}</span>
                    </button>
                    <p className="text-xs md:text-sm text-sky-800 font-cute mt-1.5">
                      속도: {speechRate}x • 쉬운 한국어 음성 📢
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => playVoice(activePost.voiceScript)}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 sm:py-3 rounded-2xl bg-white hover:bg-amber-100 text-blue-950 font-cute text-sm shadow-sm border-2 border-amber-300 transition-all flex items-center justify-center gap-1.5"
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
                    <div className="relative rounded-[24px] sm:rounded-[28px] overflow-hidden bg-black flex items-center justify-center min-h-[220px] sm:min-h-[300px] max-h-[60dvh] sm:max-h-[500px] shadow-md border-4 border-purple-200">
                      <img
                        src={cardImgs[currentCardIndex]}
                        alt={`카드뉴스 ${currentCardIndex + 1}장`}
                        className="w-full max-h-[60dvh] sm:max-h-[500px] object-contain"
                      />
                      {/* 이전 / 다음 버튼 */}
                      {cardImgs.length > 1 && (
                        <>
                          <button
                            onClick={() => setCurrentCardIndex((prev) => (prev > 0 ? prev - 1 : cardImgs.length - 1))}
                            className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] p-2 sm:p-3 rounded-full bg-black/65 text-white hover:bg-black/80 transition-all active:scale-95 flex items-center justify-center"
                            aria-label="이전 카드뉴스"
                          >
                            <ChevronLeft className="w-6 h-6 sm:w-8 sm:h-8" />
                          </button>
                          <button
                            onClick={() => setCurrentCardIndex((prev) => (prev < cardImgs.length - 1 ? prev + 1 : 0))}
                            className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] p-2 sm:p-3 rounded-full bg-black/65 text-white hover:bg-black/80 transition-all active:scale-95 flex items-center justify-center"
                            aria-label="다음 카드뉴스"
                          >
                            <ChevronRight className="w-6 h-6 sm:w-8 sm:h-8" />
                          </button>
                        </>
                      )}
                    </div>
                    <div className="text-center font-cute text-sm sm:text-base text-purple-900 bg-purple-100 px-3 py-2.5 rounded-2xl border-2 border-purple-200 break-keep">
                      총 {cardImgs.length}장 중 <strong>{currentCardIndex + 1}장째</strong> 보고 계세요 (좌우 화살표를 눌러보세요)
                    </div>
                  </div>
                );
              })()}

              {/* 어르신 및 누구나 알기 쉬운 설명 상자 (5줄 이내 핵심 요약) */}
              {(() => {
                const { summaryText, dateInfo, phoneInfo } = getExecutiveSummary(activePost);
                return (
                  <div className={`p-4 sm:p-5 md:p-6 rounded-[24px] sm:rounded-[28px] ${highContrast ? 'bg-zinc-900 border-2 border-yellow-400' : 'bg-amber-50/90 border-4 border-amber-200 shadow-sm'
                    }`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                      <h3 className="font-cute text-base sm:text-lg md:text-xl flex items-center gap-2 text-amber-950 break-keep">
                        <Sparkles className="w-5 h-5 text-amber-500 animate-spin flex-shrink-0" />
                        <span>어동이가 알기 쉽게 정리한 핵심 소식 📖</span>
                      </h3>
                      <span className={`text-xs font-cute px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap ${
                        highContrast ? 'bg-yellow-400 text-black' : 'bg-amber-200 text-amber-950'
                      }`}>
                        5줄 이내 핵심 요약
                      </span>
                    </div>

                    {/* 5줄 이내 핵심 소식 본문 */}
                    <p className={`${textClass} leading-relaxed font-cute break-keep [overflow-wrap:anywhere] ${
                      highContrast ? 'text-yellow-100' : 'text-slate-800'
                    }`}>
                      {summaryText}
                    </p>

                    {/* 일정 및 문의처 요약 배지 */}
                    {(dateInfo || phoneInfo) && (
                      <div className="mt-3 pt-2.5 border-t border-amber-200/80 flex flex-wrap items-center gap-2 text-xs md:text-sm font-cute">
                        {dateInfo && (
                          <span className="flex flex-wrap items-center gap-1 text-amber-900 bg-amber-100/90 px-2.5 py-1 rounded-xl border border-amber-300">
                            <span>📅 관련 일정:</span>
                            <strong>{dateInfo}</strong>
                          </span>
                        )}
                        {phoneInfo && (
                          <span className="flex flex-wrap items-center gap-1 text-emerald-900 bg-emerald-100/90 px-2.5 py-1 rounded-xl border border-emerald-300">
                            <span>📞 문의 전화:</span>
                            <strong>{phoneInfo}</strong>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 공식 소식 전문 (문단별 전체 내용 보기) */}
              <div className={`p-4 sm:p-5 md:p-6 rounded-[24px] sm:rounded-[28px] ${highContrast ? 'bg-zinc-900 border-2 border-yellow-400' : 'bg-white border-4 border-sky-200 shadow-sm'
                }`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b-2 border-sky-100">
                  <h3 className="font-cute text-base sm:text-lg md:text-xl flex items-center gap-2 text-blue-950 break-keep">
                    <span>공식 소식 전문 (문단별 전체 내용) 📜</span>
                  </h3>
                  <span className="text-xs font-cute text-sky-800 bg-sky-50 px-2.5 py-1 rounded-xl border border-sky-200 whitespace-nowrap">
                    한국어촌어항공단 공식 원문
                  </span>
                </div>
                <FormattedFullContent
                  content={activePost.rawContent || activePost.summary || activePost.easyExplanation}
                  textClass={textClass}
                  highContrast={highContrast}
                />
              </div>

              {/* 첨부파일 안내 (중요한 파일명이 말줄임으로 잘리지 않도록 줄바꿈 허용) */}
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
                        <li key={i} className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 p-2.5 bg-white rounded-xl border border-sky-200">
                          <span className="font-cute text-sm min-w-0 flex-1 break-words">{f.name}</span>
                          {f.url ? (
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#0284C7] text-white font-cute text-xs sm:text-sm flex-shrink-0 shadow hover:bg-[#0369A1] flex items-center justify-center"
                            >
                              다운로드
                            </a>
                          ) : (
                            <span className="text-slate-500 text-xs font-cute">{f.note}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              {/* 8. 소식에 대해 질문하기 (어동이 경청 모드 - 모바일 키보드/터치 최적화) */}
              <div className={`p-4 sm:p-5 md:p-6 rounded-[24px] sm:rounded-[28px] border-4 ${highContrast ? 'bg-zinc-900 border-yellow-400' : 'bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border-emerald-200 shadow-sm'
                }`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-shrink-0">
                    <img src="/eodongi_official.png" alt="어동이 질문" className="w-12 h-12 sm:w-16 sm:h-16 object-contain drop-shadow" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className={`font-cute text-lg md:text-xl break-keep ${highContrast ? 'text-yellow-300' : 'text-emerald-950'}`}>
                      어동이에게 질문해 보세요! 💬
                    </h3>
                    <p className={`text-xs md:text-sm font-cute break-keep ${highContrast ? 'text-yellow-100' : 'text-emerald-800'}`}>
                      마이크 버튼을 누르고 말씀하시거나 글자로 물어보시면 답해드려요.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 mb-3 mt-3">
                  <input
                    type="text"
                    value={userQuestion}
                    onChange={(e) => setUserQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion(undefined, activePost.id)}
                    onFocus={(e) => {
                      const el = e.currentTarget;
                      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
                    }}
                    placeholder="예: 신청 자격이 어떻게 되나요? 언제까지예요?"
                    className={`w-full sm:flex-1 min-h-[48px] py-3 px-4 rounded-2xl border-2 font-cute text-base md:text-lg ${highContrast ? 'bg-black border-yellow-400 text-yellow-200' : 'bg-white border-emerald-300 text-slate-900 shadow-sm focus:border-emerald-500'
                      }`}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => startVoiceRecognition(activePost.id)}
                      className={`flex-1 sm:flex-initial min-w-[48px] min-h-[46px] px-3.5 py-2.5 rounded-2xl font-cute flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 ${isListening
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      title="마이크로 말하기"
                      aria-label="마이크로 말하기"
                    >
                      {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      <span className="sm:hidden text-sm">{isListening ? '듣는 중...' : '음성 질문'}</span>
                    </button>
                    <button
                      onClick={() => handleAskQuestion(undefined, activePost.id)}
                      disabled={isAsking}
                      className="flex-1 sm:flex-initial min-h-[46px] py-2.5 px-5 rounded-2xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-cute text-base flex items-center justify-center gap-1.5 shadow-md active:scale-95 whitespace-nowrap"
                    >
                      <Send className="w-5 h-5 flex-shrink-0" />
                      <span>질문하기</span>
                    </button>
                  </div>
                </div>

                {isAsking && (
                  <div className="p-3 text-center text-sm font-cute text-emerald-800 animate-pulse bg-white/80 rounded-2xl border border-emerald-200 break-keep">
                    어동이가 공단 소식에서 정답을 열심히 찾고 있습니다... 🐬✨
                  </div>
                )}

                {aiAnswer && (
                  <div className={`p-4 rounded-2xl mt-3 shadow-sm ${highContrast ? 'bg-black border border-yellow-400 text-yellow-300' : 'bg-white border-2 border-emerald-300 text-slate-900'
                    }`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-emerald-100 font-cute">
                      <span className={`text-sm sm:text-base flex items-center gap-1.5 font-bold ${highContrast ? 'text-yellow-300' : 'text-emerald-800'}`}>
                        <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                        <span>어동이의 AI 답변 {!aiAnswer.isDemo ? '(AI 실시간 연동 ✨)' : '(공단 기본 안내 ℹ️)'}</span>
                      </span>
                      <button
                        onClick={() => toggleVoice(aiAnswer.voiceScript)}
                        className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-sm font-cute flex items-center gap-1.5 shadow-sm transition-colors ${isPlaying
                          ? 'bg-rose-500 hover:bg-rose-600 text-white animate-pulse'
                          : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900'
                          }`}
                      >
                        {isPlaying ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        <span>{isPlaying ? '음성 멈추기' : '음성 듣기'}</span>
                      </button>
                    </div>

                    {aiAnswer.isDemo && aiAnswer.diagnostics?.message && (
                      <p className="text-xs text-amber-800 bg-amber-50 px-2.5 py-1.5 rounded-xl mb-2 font-cute border border-amber-200 break-keep [overflow-wrap:anywhere]">
                        💡 {aiAnswer.diagnostics.message}
                      </p>
                    )}

                    <p className={`${textClass} whitespace-pre-line leading-relaxed font-cute break-keep [overflow-wrap:anywhere]`}>
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
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 text-base font-cute text-[#0284C7] hover:underline break-keep"
                >
                  <span>한국어촌어항공단 공식 홈페이지 원문 확인하기</span>
                  <ExternalLink className="w-4 h-4 flex-shrink-0" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8-1. 어동이에게 바로 질문하기 전용 AI 모달 (PC 기존 모달 유지 + 모바일 전체폭 하단 시트 & 키보드 대응) */}
      {askModalPost && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-xs"
          onClick={() => {
            stopVoice();
            setAskModalPost(null);
            setAiAnswer(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full sm:max-w-2xl max-h-[94dvh] sm:max-h-[90vh] rounded-t-[28px] sm:rounded-[36px] overflow-hidden flex flex-col shadow-2xl border-t-4 sm:border-4 ${highContrast ? 'bg-zinc-950 border-yellow-400 text-yellow-300' : 'bg-white border-emerald-200 text-slate-900'
              }`}
          >

            {/* 모달 헤더 */}
            <div className={`p-3.5 sm:p-5 flex items-center justify-between gap-2 border-b flex-shrink-0 ${highContrast ? 'border-yellow-400/50 bg-zinc-900' : 'bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 text-white'
              }`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white p-1 shadow-sm flex items-center justify-center border-2 border-amber-300 flex-shrink-0">
                  <img src="/eodongi_official.png" alt="어동이 질문" className="w-8 h-8 sm:w-9 sm:h-9 object-contain" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-cute text-lg md:text-xl leading-tight break-keep">
                    어동이에게 질문해 보세요! 💬
                  </h2>
                  <p className="text-xs opacity-95 font-cute leading-snug break-keep">
                    AI가 선택하신 공단 소식을 읽고 친절하게 답해드려요
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  stopVoice();
                  setAskModalPost(null);
                  setAiAnswer(null);
                }}
                className={`min-w-[44px] min-h-[44px] p-2 rounded-2xl transition-colors flex items-center justify-center flex-shrink-0 ${highContrast ? 'bg-yellow-400 text-black' : 'bg-white/25 hover:bg-white/35 text-white'
                  }`}
                title="닫기"
                aria-label="닫기"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain space-y-4 sm:space-y-5 flex-1 bg-bubble-pattern">

              {/* 선택된 소식 정보 배너 */}
              <div className={`p-3.5 sm:p-4 rounded-2xl border-2 ${highContrast ? 'bg-zinc-900 border-yellow-400 text-yellow-200' : 'bg-sky-50/90 border-sky-200 text-slate-800'
                }`}>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-cute font-bold whitespace-nowrap ${highContrast ? 'bg-yellow-400 text-black' : 'bg-[#0284C7] text-white'
                    }`}>
                    📌 {askModalPost.boardName}
                  </span>
                  <span className="text-xs opacity-75 font-cute whitespace-nowrap">📅 {askModalPost.registeredDate}</span>
                </div>
                <p className="font-cute text-base md:text-lg leading-snug font-bold break-keep [overflow-wrap:anywhere]">
                  {askModalPost.title}
                </p>
              </div>

              {/* 질문 입력 및 AI 답변 박스 (모바일 키보드·터치 최적화) */}
              <div className={`p-4 sm:p-5 md:p-6 rounded-[24px] sm:rounded-[28px] border-4 ${highContrast ? 'bg-zinc-900 border-yellow-400' : 'bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border-emerald-200 shadow-sm'
                }`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-shrink-0">
                    <img src="/eodongi_official.png" alt="어동이 경청" className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className={`font-cute text-base md:text-lg break-keep ${highContrast ? 'text-yellow-300' : 'text-emerald-950'}`}>
                      궁금한 점을 말씀하시거나 입력해 주세요!
                    </h3>
                    <p className={`text-xs md:text-sm font-cute break-keep ${highContrast ? 'text-yellow-100' : 'text-emerald-800'}`}>
                      마이크 버튼을 누르고 말씀하시거나 글자로 물어보시면 AI가 답해드려요.
                    </p>
                  </div>
                </div>

                {/* 자주 묻는 빠른 질문 버튼 */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {[
                    '이 소식의 핵심 내용을 쉽게 요약해 주세요',
                    '신청 대상과 기간이 어떻게 되나요?',
                    '어디로 문의하면 되나요?',
                  ].map((sampleQ) => (
                    <button
                      key={sampleQ}
                      onClick={() => {
                        setUserQuestion(sampleQ);
                        handleAskQuestion(sampleQ, askModalPost.id);
                      }}
                      disabled={isAsking}
                      className={`min-h-[38px] px-3 py-1.5 rounded-2xl text-xs sm:text-sm font-cute text-left transition-all active:scale-95 break-keep ${highContrast
                        ? 'bg-zinc-800 text-yellow-200 border border-yellow-400 hover:bg-zinc-700'
                        : 'bg-white/95 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 shadow-2xs'
                        }`}
                    >
                      ✨ {sampleQ}
                    </button>
                  ))}
                </div>

                {/* 모바일: 입력창 1행 + 음성/질문 버튼 2행 / PC: 기존 단일 행 유지 */}
                <div className="flex flex-col sm:flex-row gap-2 mb-3 mt-2">
                  <input
                    type="text"
                    value={userQuestion}
                    onChange={(e) => setUserQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion(undefined, askModalPost.id)}
                    onFocus={(e) => {
                      const el = e.currentTarget;
                      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
                    }}
                    placeholder="예: 신청 자격이 어떻게 되나요? 언제까지예요?"
                    className={`w-full sm:flex-1 min-h-[48px] py-3 px-4 rounded-2xl border-2 font-cute text-base md:text-lg ${highContrast ? 'bg-black border-yellow-400 text-yellow-200' : 'bg-white border-emerald-300 text-slate-900 shadow-sm focus:border-emerald-500'
                      }`}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => startVoiceRecognition(askModalPost.id)}
                      className={`flex-1 sm:flex-initial min-w-[48px] min-h-[46px] px-3.5 py-2.5 rounded-2xl font-cute flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 ${isListening
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      title="마이크로 말하기"
                      aria-label="마이크로 말하기"
                    >
                      {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      <span className="sm:hidden text-sm">{isListening ? '듣는 중...' : '음성 질문'}</span>
                    </button>
                    <button
                      onClick={() => handleAskQuestion(undefined, askModalPost.id)}
                      disabled={isAsking}
                      className="flex-1 sm:flex-initial min-h-[46px] py-2.5 px-5 rounded-2xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-cute text-base flex items-center justify-center gap-1.5 shadow-md active:scale-95 whitespace-nowrap"
                    >
                      <Send className="w-5 h-5 flex-shrink-0" />
                      <span>질문하기</span>
                    </button>
                  </div>
                </div>

                {isAsking && (
                  <div className="p-3 text-center text-sm font-cute text-emerald-800 animate-pulse bg-white/80 rounded-2xl border border-emerald-200 break-keep">
                    어동이가 공단 소식에서 정답을 열심히 찾고 있습니다... 🐬✨
                  </div>
                )}

                {aiAnswer && (
                  <div className={`p-4 rounded-2xl mt-3 shadow-sm ${highContrast ? 'bg-black border border-yellow-400 text-yellow-300' : 'bg-white border-2 border-emerald-300 text-slate-900'
                    }`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-emerald-100 font-cute">
                      <span className={`text-sm sm:text-base flex items-center gap-1.5 font-bold ${highContrast ? 'text-yellow-300' : 'text-emerald-800'}`}>
                        <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                        <span>어동이의 AI 답변 {!aiAnswer.isDemo ? '(AI 실시간 연동 ✨)' : '(공단 기본 안내 ℹ️)'}</span>
                      </span>
                      <button
                        onClick={() => toggleVoice(aiAnswer.voiceScript)}
                        className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-sm font-cute flex items-center gap-1.5 shadow-sm transition-colors ${isPlaying
                          ? 'bg-rose-500 hover:bg-rose-600 text-white animate-pulse'
                          : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900'
                          }`}
                      >
                        {isPlaying ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        <span>{isPlaying ? '음성 멈추기' : '음성 듣기'}</span>
                      </button>
                    </div>

                    {aiAnswer.isDemo && aiAnswer.diagnostics?.message && (
                      <p className="text-xs text-amber-800 bg-amber-50 px-2.5 py-1.5 rounded-xl mb-2 font-cute border border-amber-200 break-keep [overflow-wrap:anywhere]">
                        💡 {aiAnswer.diagnostics.message}
                      </p>
                    )}

                    <p className={`${textClass} whitespace-pre-line leading-relaxed font-cute break-keep [overflow-wrap:anywhere]`}>
                      {aiAnswer.text}
                    </p>
                  </div>
                )}
              </div>

              {/* 하단 전체 내용 자세히 보기 이동 버튼 */}
              <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                <button
                  onClick={() => openPost(askModalPost)}
                  className={`min-h-[44px] px-4 py-2 rounded-2xl font-cute text-sm flex items-center gap-1.5 transition-all ${highContrast
                    ? 'bg-zinc-800 text-yellow-300 border border-yellow-400'
                    : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300'
                    }`}
                >
                  <span>📖 이 소식 전체 내용 자세히 보기</span>
                </button>
                <a
                  href={askModalPost.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 min-h-[44px] px-2 text-sm font-cute text-[#0284C7] hover:underline whitespace-nowrap"
                >
                  <span>공단 원문 보기</span>
                  <ExternalLink className="w-4 h-4 flex-shrink-0" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. 스마트폰 QR 코드 모달 */}
      {showQrModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          onClick={() => setShowQrModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white text-slate-900 rounded-[32px] sm:rounded-[36px] p-5 sm:p-6 max-w-sm w-full max-h-[90dvh] overflow-y-auto text-center shadow-2xl relative border-4 border-sky-200"
          >
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute right-3 top-3 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-2">
              <img src="/eodongi_official.png" alt="어동이 QR" className="w-20 h-20 object-contain mx-auto" />
            </div>

            <h3 className="font-cute text-xl sm:text-2xl mb-1 text-[#0284C7] break-keep">
              스마트폰으로 간편하게 듣기 📱
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 mb-4 font-cute break-keep leading-relaxed">
              스마트폰 기본 카메라로 아래 QR 코드를 비추시면 복잡한 주소 입력 없이 바로 열립니다.
            </p>
            {qrDataUrl ? (
              <div className="p-3 bg-sky-50 rounded-2xl inline-block border-2 border-sky-200 mb-4 shadow-inner">
                <img src={qrDataUrl} alt="스마트폰 접속 QR코드" className="w-44 h-44 sm:w-48 sm:h-48 mx-auto" />
              </div>
            ) : (
              <div className="w-44 h-44 sm:w-48 sm:h-48 bg-slate-100 rounded-2xl mx-auto flex items-center justify-center text-xs text-slate-400 font-cute">
                QR 생성 중...
              </div>
            )}
            <p className="text-xs sm:text-sm font-cute text-emerald-900 bg-emerald-50 py-2.5 px-3 rounded-2xl border-2 border-emerald-200 break-keep">
              별도의 앱 설치나 로그인 없이 바로 이용하실 수 있습니다 🐚
            </p>
          </div>
        </div>
      )}

      {/* 11. 🎵 게시 일자별 연속 듣기 플로팅 플레이어 바 */}
      {isPlaylistActive && playlist.length > 0 && (
        <div className="fixed bottom-3 left-2.5 right-2.5 sm:bottom-4 sm:left-6 sm:right-6 max-w-2xl mx-auto z-50 pb-[env(safe-area-inset-bottom)]">
          <div className={`p-3.5 sm:p-4 rounded-[24px] sm:rounded-[28px] shadow-2xl border-4 flex flex-col sm:flex-row items-center justify-between gap-3 transition-all ${
            highContrast
              ? 'bg-zinc-950 border-yellow-400 text-yellow-300'
              : 'bg-gradient-to-r from-sky-900 via-blue-900 to-indigo-950 text-white border-sky-300/80 shadow-sky-950/40'
          }`}>
            {/* 재생 중인 소식 정보 */}
            <div className="flex items-center gap-3 w-full sm:w-auto flex-1 min-w-0">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white/10 p-1 flex items-center justify-center border-2 border-amber-300 flex-shrink-0">
                <img src="/eodongi_official.png" alt="어동이 재생" className="w-9 h-9 sm:w-10 sm:h-10 object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="text-xs font-cute px-2 py-0.5 rounded-full bg-amber-400 text-blue-950 font-bold whitespace-nowrap">
                    소식 {playlistIndex + 1} / {playlist.length}
                  </span>
                  <span className="text-xs text-sky-200 font-cute whitespace-nowrap">
                    📅 {playlistDate} 연속 재생 중
                  </span>
                </div>
                <p className="text-sm md:text-base font-cute font-bold line-clamp-2 sm:truncate mt-0.5 text-white leading-snug break-keep">
                  {playlist[playlistIndex]?.title}
                </p>
              </div>
            </div>

            {/* 플레이어 컨트롤 버튼들 (최소 44x44px 터치 영역) */}
            <div className="flex items-center justify-center gap-2 flex-shrink-0 w-full sm:w-auto">
              {/* 이전 곡 */}
              <button
                onClick={skipToPrevPost}
                disabled={playlistIndex === 0}
                className="min-w-[44px] min-h-[44px] p-2.5 rounded-2xl bg-white/15 hover:bg-white/25 disabled:opacity-40 text-white transition-all active:scale-95 flex items-center justify-center"
                title="이전 소식 듣기"
                aria-label="이전 소식 듣기"
              >
                <SkipBack className="w-5 h-5" />
              </button>

              {/* 일시정지 / 재생 */}
              <button
                onClick={togglePlaylistPause}
                className="min-h-[44px] flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-blue-950 font-cute font-bold text-sm md:text-base flex items-center justify-center gap-1.5 shadow-md active:scale-95"
                title={isPlaylistPaused ? '다시 듣기' : '잠시 멈춤'}
              >
                {isPlaylistPaused ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5 fill-current" />}
                <span>{isPlaylistPaused ? '재생' : '멈춤'}</span>
              </button>

              {/* 다음 곡 */}
              <button
                onClick={skipToNextPost}
                disabled={playlistIndex + 1 >= playlist.length}
                className="min-w-[44px] min-h-[44px] p-2.5 rounded-2xl bg-white/15 hover:bg-white/25 disabled:opacity-40 text-white transition-all active:scale-95 flex items-center justify-center"
                title="다음 소식 듣기"
                aria-label="다음 소식 듣기"
              >
                <SkipForward className="w-5 h-5" />
              </button>

              {/* 닫기 (재생 종료) */}
              <button
                onClick={stopPlaylist}
                className="min-w-[44px] min-h-[44px] p-2.5 rounded-2xl bg-white/15 hover:bg-rose-600 text-white transition-all active:scale-95 flex items-center justify-center"
                title="연속 재생 끄기"
                aria-label="연속 재생 끄기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
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

'use client';

import React, { useState, useEffect } from 'react';
import {
  RefreshCw, CheckCircle2, AlertTriangle, Clock, Server, FileText,
  ShieldAlert, Settings, ExternalLink, Eye, EyeOff, Play, Info, Check, X,
  Database, Cloud, UploadCloud, Flame, Key, LogOut, Lock, Mail, Loader2, ShieldCheck
} from 'lucide-react';
import Eodongi from '@/components/Eodongi';
import AdminAnalyticsSection from '@/components/AdminAnalyticsSection';
import { useFirebaseAuth } from '@/lib/useFirebaseAuth';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, isFirebaseConfigured, getMissingFirebaseEnvVars } from '@/lib/firebase';

interface BoardStat {
  boardType: string;
  boardName: string;
  boardId: string;
  listUrl: string;
  count: number;
  latestDate: string | null;
  latestTitle: string | null;
  lastCheckedAt: string | null;
}

interface SyncData {
  lastSync: any;
  stats: {
    totalPosts: number;
    publishedPosts: number;
    pendingReviewPosts: number;
    unpublishedPosts: number;
  };
  boardStats: BoardStat[];
  config: {
    intervalMinutes: number;
    autoSyncEnabled: boolean;
  };
  robotsNotice: {
    status: string;
    disallowPath: string;
    recommendation: string;
  };
}

interface AdminPost {
  id: string;
  boardType: string;
  boardName: string;
  nttSn: string;
  title: string;
  registeredDate: string;
  views: number;
  summary: string;
  easyExplanation: string;
  voiceScript: string;
  inspectionStatus: string; // AUTO_PUBLISHED, PENDING_REVIEW, APPROVED, REJECTED, UNPUBLISHED
  isSafetyOrPolicy: boolean;
  policyKeywords: string | null;
  aiModelUsed: string;
  isDemo: boolean;
  originalUrl: string;
  updatedAt: string;
}

export default function AdminDashboardPage() {
  // Firebase Auth 관리자 인증 가드
  const { user, loading: authLoading, logout } = useFirebaseAuth();
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [syncData, setSyncData] = useState<SyncData | null>(null);
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  
  // 설정 폼 상태
  const [syncInterval, setSyncInterval] = useState(60);
  const [autoSync, setAutoSync] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configMessage, setConfigMessage] = useState('');

  // 게시물 검수 모달 상태
  const [inspectingPost, setInspectingPost] = useState<AdminPost | null>(null);
  const [reAnalyzingId, setReAnalyzingId] = useState<string | null>(null);

  // Firebase Firestore 연결 상태
  const [firebaseStatus, setFirebaseStatus] = useState<{ configured: boolean; projectId?: string; storageBucket?: string; firestorePostCount: number } | null>(null);
  const [isSyncingFirebase, setIsSyncingFirebase] = useState(false);
  const [showFirebaseGuide, setShowFirebaseGuide] = useState(false);

  useEffect(() => {
    if (user) {
      loadAllData();
      loadFirebaseStatus();
    }
  }, [user]);

  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError('이메일과 비밀번호를 모두 입력해 주세요.');
      return;
    }

    if (!auth || !isFirebaseConfigured()) {
      const missing = getMissingFirebaseEnvVars();
      const detail = missing.length > 0 ? ` (누락된 변수: ${missing.join(', ')})` : '';
      setLoginError(`Firebase 설정이 완료되지 않았습니다.${detail}`);
      console.warn('[Firebase Auth 진단] 누락된 환경변수:', missing);
      return;
    }

    setLoginSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      setLoginSubmitting(false);
    } catch (err: any) {
      setLoginSubmitting(false);
      console.error('관리자 로그인 에러:', err.code, err.message);
      switch (err.code) {
        case 'auth/invalid-email':
          setLoginError('올바른 이메일 주소 형식을 입력해 주세요.');
          break;
        case 'auth/user-not-found':
          setLoginError('등록되지 않은 관리자 계정입니다.');
          break;
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setLoginError('이메일 또는 비밀번호가 일치하지 않습니다.');
          break;
        case 'auth/too-many-requests':
          setLoginError('로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.');
          break;
        case 'auth/user-disabled':
          setLoginError('비활성화된 계정입니다. 관리자에게 문의하세요.');
          break;
        default:
          setLoginError('로그인에 실패했습니다. 이메일과 비밀번호를 다시 확인해 주세요.');
      }
    }
  };

  async function loadFirebaseStatus() {
    try {
      const res = await fetch('/api/firebase/sync');
      const data = await res.json();
      if (data.success) {
        setFirebaseStatus(data);
      }
    } catch (e) {
      console.warn('Firebase 상태 조회 실패:', e);
    }
  }

  // Firebase Firestore 일괄 동기화 실행
  async function handleSyncToFirebase() {
    setIsSyncingFirebase(true);
    try {
      const res = await fetch('/api/firebase/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Firestore 클라우드 동기화 성공!');
        await loadFirebaseStatus();
        await loadAllData();
      } else {
        alert(data.error || 'Firestore 동기화 실패');
      }
    } catch (e: any) {
      alert(`동기화 요청 실패: ${e.message}`);
    } finally {
      setIsSyncingFirebase(false);
    }
  }

  async function loadAllData() {
    setLoading(true);
    try {
      const [syncRes, postsRes] = await Promise.all([
        fetch('/api/sync'),
        fetch('/api/posts?forAdmin=true'),
      ]);

      const syncJson = await syncRes.json();
      const postsJson = await postsRes.json();

      if (syncJson.success) {
        setSyncData(syncJson);
        setSyncInterval(syncJson.config.intervalMinutes);
        setAutoSync(syncJson.config.autoSyncEnabled);
      }
      if (postsJson.success) {
        setPosts(postsJson.posts);
      }
    } catch (e) {
      console.error('관리자 데이터 조회 오류:', e);
    } finally {
      setLoading(false);
    }
  }

  // 즉시 동기화 실행 ("지금 동기화")
  async function handleImmediateSync() {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5 }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`동기화 성공!\n신규: ${data.result.totalNew}건, 갱신: ${data.result.totalUpdated}건`);
        await loadAllData();
      } else {
        alert(`동기화 오류: ${data.error}`);
      }
    } catch (e: any) {
      alert(`요청 실패: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  }

  // 설정 저장
  async function handleSaveConfig() {
    setIsSavingConfig(true);
    setConfigMessage('');
    try {
      const res = await fetch('/api/sync/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intervalMinutes: syncInterval,
          autoSyncEnabled: autoSync,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setConfigMessage('동기화 주기가 성공적으로 변경되었습니다.');
        setTimeout(() => setConfigMessage(''), 3000);
      }
    } catch (e: any) {
      alert('설정 저장 실패: ' + e.message);
    } finally {
      setIsSavingConfig(false);
    }
  }

  // 게시물 상태 변경 (승인, 비공개 등)
  async function handleUpdateStatus(postId: string, newStatus: string) {
    try {
      let idToken = '';
      if (user) {
        try {
          idToken = await user.getIdToken();
        } catch {}
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

      const res = await fetch(`/api/posts/${postId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ inspectionStatus: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, inspectionStatus: newStatus } : p))
        );
        if (inspectingPost?.id === postId) {
          setInspectingPost((prev) => prev ? { ...prev, inspectionStatus: newStatus } : null);
        }
      } else {
        alert('상태 변경 실패: ' + (data.error || '권한이 없습니다.'));
      }
    } catch (e: any) {
      alert('상태 변경 실패: ' + e.message);
    }
  }

  // AI 분석 재시도 (관리자 권한 토큰 전달)
  async function handleReAnalyze(postId: string) {
    setReAnalyzingId(postId);
    try {
      let idToken = '';
      if (user) {
        try {
          idToken = await user.getIdToken();
        } catch {}
      }
      const headers: Record<string, string> = {};
      if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

      const res = await fetch(`/api/posts/${postId}`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (data.success) {
        alert('AI 재분석이 완료되었습니다.');
        await loadAllData();
        if (inspectingPost?.id === postId) {
          setInspectingPost(data.post);
        }
      } else {
        alert('재분석 실패: ' + data.error);
      }
    } catch (e: any) {
      alert('재분석 요청 오류: ' + e.message);
    } finally {
      setReAnalyzingId(null);
    }
  }

  // 필터링
  const filteredPosts = posts.filter((p) => {
    const matchesBoard = selectedFilter === 'ALL' || p.boardType === selectedFilter;
    const matchesStatus = statusFilter === 'ALL' || p.inspectionStatus === statusFilter;
    return matchesBoard && matchesStatus;
  });

  // 1. Firebase Auth 로딩 중
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4">
        <div className="w-16 h-16 bg-white rounded-3xl p-1 mb-4 shadow-xl flex items-center justify-center animate-bounce">
          <Eodongi size={56} pose="happy" />
        </div>
        <div className="flex items-center gap-2 font-cute text-base text-slate-300">
          <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
          <span>관리자 인증 상태를 확인하고 있습니다...</span>
        </div>
      </div>
    );
  }

  // 2. 미인증 상태 -> 로그인 화면 표시 (관리자 페이지 데이터 절대 비공개)
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border-4 border-sky-300 overflow-hidden">
          {/* Header with Eodongi */}
          <div className="bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-700 px-6 py-6 text-white text-center">
            <div className="w-16 h-16 bg-white rounded-2xl p-1 mx-auto mb-3 shadow-lg flex items-center justify-center">
              <Eodongi size={56} pose="happy" />
            </div>
            <span className="inline-block px-3 py-0.5 rounded-full bg-amber-400 text-blue-950 text-xs font-cute font-bold mb-1 shadow-sm">
              FiPA ADMIN GUARD
            </span>
            <h1 className="text-2xl font-cute font-bold tracking-wide">
              관리자 모드 로그인
            </h1>
            <p className="text-xs text-sky-100 font-cute mt-1">
              관리자 전용 대시보드는 로그인 후 이용하실 수 있습니다.
            </p>
          </div>

          {/* Form */}
          <div className="p-6">
            {loginError && (
              <div className="mb-4 p-3 rounded-2xl bg-rose-50 border-2 border-rose-200 text-rose-700 text-xs font-cute flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleDirectLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-cute text-slate-700 mb-1.5 ml-1">
                  관리자 이메일 계정
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="admin@fipa.or.kr"
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl border-2 border-sky-100 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200 text-sm font-cute transition-all"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-cute text-slate-700 mb-1.5 ml-1">
                  비밀번호
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-11 py-2.5 rounded-2xl border-2 border-sky-100 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200 text-sm font-cute transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loginSubmitting}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 active:scale-95 text-white font-cute text-base font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loginSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>로그인 확인 중...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5" />
                      <span>관리자 대시보드 로그인</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="mt-4 text-center">
              <a
                href="/"
                className="text-xs text-slate-500 hover:text-slate-700 font-cute underline"
              >
                ← 사용자 메인 페이지로 돌아가기
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-20">
      {/* 관리자 헤더 */}
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white p-0.5 shadow-sm flex items-center justify-center flex-shrink-0">
              <Eodongi pose="happy" size={36} />
            </div>
            <div>
              <a href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity" title="메인 페이지로 돌아가기">
                <span className="bg-yellow-400 text-blue-950 font-black px-2 py-0.5 rounded text-xs">
                  FiPA ADMIN
                </span>
                <h1 className="font-extrabold text-lg sm:text-xl tracking-tight">
                  들려드림 자동 연계 통합 관리자 대시보드
                </h1>
              </a>
              <p className="text-xs text-slate-400">
                한국어촌어항공단 공식 게시판 크롤링 및 AI 변환 파이프라인 관제
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 로그인 계정 표시 */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-slate-200">{user.email}</span>
            </div>

            {/* 로그아웃 버튼 */}
            <button
              onClick={async () => {
                if (confirm('관리자 계정에서 로그아웃 하시겠습니까?')) {
                  await logout();
                  window.location.href = '/';
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-200 border border-rose-700/60 text-xs font-bold flex items-center gap-1.5 transition-all"
              title="로그아웃"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>로그아웃</span>
            </button>

            <a
              href="/"
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all"
            >
              <span>사용자 화면 보기</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              onClick={handleImmediateSync}
              disabled={isSyncing}
              className={`px-4 py-2 rounded-lg font-black text-xs sm:text-sm flex items-center gap-2 shadow transition-all ${
                isSyncing
                  ? 'bg-blue-400 text-white cursor-wait'
                  : 'bg-yellow-400 hover:bg-yellow-300 text-blue-950'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? '동기화 진행 중...' : '지금 동기화'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* 1. 최상단: 사용자들이 읽은 소식 횟수 & 질문 내용 실시간 시각화 그래프 센터 */}
        <AdminAnalyticsSection />

        {/* 기관 승인 및 robots.txt 상태 안내 배너 (요구사항 2, 4) */}
        <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 flex items-start gap-3 shadow-sm">
          <ShieldAlert className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-amber-950 leading-relaxed">
            <strong className="font-bold text-amber-900 block mb-0.5">
              [운영기관 이용조건 및 공식 인터페이스 권고사항]
            </strong>
            한국어촌어항공단 홈페이지의 공개 robots.txt 규칙상 <code>/fipa/bbs/</code>에 대한 크롤러 탐색 제한이 확인되었습니다.
            현재 프로토타입은 서버 측 HTML 파싱 및 정중한 딜레이(Rate Limiting) 방식으로 정상 수집 중이나, 실제 공식 서비스 전환 시에는 <strong>공단 홍보/전산 부서와의 사전 협의 및 공식 OpenAPI 또는 기관 내부 DB 연계</strong>로 전환할 수 있도록 모듈이 추상화되어 있습니다.
          </div>
        </div>

        {/* Firebase Firestore & Cloud Storage 연동 관제 카드 */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-50/90 via-orange-50/60 to-white border-2 border-amber-300 shadow-sm transition-all">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-amber-400 text-amber-950 flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                <Flame className="w-6 h-6 text-orange-950 fill-amber-300" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-1.5">
                    <span>Firebase Firestore & Cloud Storage 클라우드 연동</span>
                  </h2>
                  {firebaseStatus?.configured ? (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>연결됨 ({firebaseStatus.projectId})</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span>.env.local 설정 대기 (로컬 DB 동작 중)</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Firebase 설정을 완료하면 공단 소식 및 카드뉴스 이미지가 Google Cloud Firestore/Storage에 실시간 보관되어 서버리스 환경에서도 영구 보존됩니다.
                  {firebaseStatus?.configured && (
                    <span className="ml-1 text-emerald-700 font-bold">
                      (현재 Firestore 등록: {firebaseStatus.firestorePostCount}건)
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
              <button
                onClick={() => setShowFirebaseGuide(!showFirebaseGuide)}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-300 shadow-sm transition-all flex items-center gap-1.5"
              >
                <Key className="w-3.5 h-3.5 text-amber-600" />
                <span>{showFirebaseGuide ? '가이드 닫기' : '설정 가이드'}</span>
              </button>

              <button
                onClick={handleSyncToFirebase}
                disabled={isSyncingFirebase || !firebaseStatus?.configured}
                className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all ${
                  !firebaseStatus?.configured
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                    : isSyncingFirebase
                      ? 'bg-orange-400 text-white cursor-wait'
                      : 'bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black active:scale-95'
                }`}
                title={!firebaseStatus?.configured ? '.env.local 설정 후 동기화 가능합니다' : '소식을 Firestore로 업로드'}
              >
                <UploadCloud className={`w-4 h-4 ${isSyncingFirebase ? 'animate-bounce' : ''}`} />
                <span>{isSyncingFirebase ? '클라우드 전송 중...' : 'Firestore로 소식 일괄 업로드'}</span>
              </button>
            </div>
          </div>

          {/* Firebase 설정 가이드 펼침 영역 */}
          {showFirebaseGuide && (
            <div className="mt-4 pt-4 border-t border-amber-200 text-xs text-slate-700 space-y-3">
              <div className="bg-white p-3.5 rounded-xl border border-amber-200">
                <p className="font-bold text-amber-950 mb-1.5 flex items-center gap-1">
                  <span>1. <code>.env.local</code> 파일 생성 및 설정값 입력</span>
                </p>
                <p className="text-slate-500 mb-2">
                  Firebase Console &gt; 프로젝트 설정 &gt; 일반 &gt; 내 앱 &gt; 웹 앱(&lt;/&gt;)에서 복사한 값을 프로젝트 루트의 <code>.env.local</code> 파일에 저장하세요:
                </p>
                <pre className="p-2.5 bg-slate-900 text-amber-200 rounded-lg overflow-x-auto font-mono text-[11px] leading-relaxed">
{`NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef`}
                </pre>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-amber-200">
                <p className="font-bold text-amber-950 mb-1">
                  <span>2. Firebase Console 보안 규칙(Rules) 확인</span>
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li><strong>Firestore Database:</strong> 개발/테스트 단계에서는 <code>allow read, write: if true;</code> 또는 인증 규칙을 활성화하세요.</li>
                  <li><strong>Cloud Storage:</strong> 이미지 업로드를 위해 Storage 규칙에서 읽기/쓰기 권한이 허용되어 있는지 확인하세요.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* 1. 상단 통계 카드 그리드 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase">총 수집 게시물</span>
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">
              {syncData?.stats.totalPosts ?? 0}
              <span className="text-sm font-normal text-slate-500 ml-1">건</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">4개 게시판 누적 데이터</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase">자동 발행 건수</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-600">
              {syncData?.stats.publishedPosts ?? 0}
              <span className="text-sm font-normal text-slate-500 ml-1">건</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">검증 통과 후 사용자 화면 노출</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border-2 border-rose-300 bg-rose-50/50 shadow-sm">
            <div className="flex items-center justify-between text-rose-800 mb-2">
              <span className="text-xs font-bold uppercase">검수 필요 건수</span>
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-rose-600">
              {syncData?.stats.pendingReviewPosts ?? 0}
              <span className="text-sm font-normal text-rose-800 ml-1">건</span>
            </div>
            <p className="text-xs text-rose-700 mt-1">법정의무·보조금·안전 등 정책소식</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase">마지막 동기화</span>
              <Clock className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-lg font-bold text-slate-800 truncate">
              {syncData?.lastSync?.completedAt
                ? new Date(syncData.lastSync.completedAt).toLocaleTimeString('ko-KR')
                : '기록 없음'}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              상태: <strong className="text-emerald-600 font-bold">{syncData?.lastSync?.status || '대기'}</strong>
            </p>
          </div>
        </div>

        {/* 2. 게시판별 수집 상태 및 스케줄러 설정 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 게시판별 상태 */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-base font-extrabold mb-4 flex items-center gap-2">
              <Server className="w-5 h-5 text-[#0A4E9B]" />
              <span>수집 대상 게시판 연계 현황</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2.5 font-bold">게시판 구분</th>
                    <th className="pb-2.5 font-bold">식별자 (URL)</th>
                    <th className="pb-2.5 font-bold">수집 건수</th>
                    <th className="pb-2.5 font-bold">최신 게시물 등록일</th>
                    <th className="pb-2.5 font-bold text-right">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {syncData?.boardStats.map((b) => (
                    <tr key={b.boardId} className="hover:bg-slate-50">
                      <td className="py-3 font-bold text-slate-800">{b.boardName}</td>
                      <td className="py-3 text-slate-500">
                        <a
                          href={b.listUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-blue-600 underline flex items-center gap-1"
                        >
                          {b.boardId}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="py-3 font-bold">{b.count}건</td>
                      <td className="py-3 text-slate-600">{b.latestDate || '-'}</td>
                      <td className="py-3 text-right">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                          연계 정상
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 스케줄러 동기화 설정 (요구사항 3, 9) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <h2 className="text-base font-extrabold mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-purple-600" />
                <span>자동 수집 스케줄러 설정</span>
              </h2>

              <div className="space-y-4 text-xs sm:text-sm">
                {/* 자동 수집 토글 */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <span className="font-bold block">1시간 주기 자동 감지</span>
                    <span className="text-slate-500 text-xs">서버 백그라운드 스케줄러 동작</span>
                  </div>
                  <button
                    onClick={() => setAutoSync(!autoSync)}
                    className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                      autoSync ? 'bg-[#0A4E9B]' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                        autoSync ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 동기화 주기 변경 */}
                <div>
                  <label className="font-bold block mb-1">동기화 주기 (분 단위)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="5"
                      max="1440"
                      value={syncInterval}
                      onChange={(e) => setSyncInterval(parseInt(e.target.value, 10) || 60)}
                      className="w-24 p-2 rounded-lg border border-slate-300 text-center font-bold"
                    />
                    <span className="text-slate-600 font-bold">분마다 게시판 확인</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">기본값: 60분 (1시간)</p>
                </div>

                {configMessage && (
                  <p className="text-xs font-bold text-emerald-600 bg-emerald-50 p-2 rounded-lg">
                    {configMessage}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={handleSaveConfig}
              disabled={isSavingConfig}
              className="mt-4 w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm transition-all"
            >
              {isSavingConfig ? '저장 중...' : '설정 저장하기'}
            </button>
          </div>
        </div>

        {/* 3. 게시물 관리 및 검수 테이블 */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-extrabold flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <span>수집 게시물 검수 및 관리 목록</span>
              </h2>
              <p className="text-xs text-slate-500">
                홍보담당자의 개별 등록 없이 자동 수집된 콘텐츠를 모니터링하고 검수합니다.
              </p>
            </div>

            {/* 필터 탭 */}
            <div className="flex items-center gap-2 text-xs">
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="p-2 rounded-lg border border-slate-300 bg-slate-50 font-bold"
              >
                <option value="ALL">전체 게시판</option>
                <option value="PRESS">보도자료</option>
                <option value="NOTICE">공지사항</option>
                <option value="RECRUIT">공고/공모</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="p-2 rounded-lg border border-slate-300 bg-slate-50 font-bold"
              >
                <option value="ALL">전체 상태</option>
                <option value="AUTO_PUBLISHED">자동 발행</option>
                <option value="PENDING_REVIEW">검수 필요</option>
                <option value="APPROVED">검수 완료(승인)</option>
                <option value="UNPUBLISHED">비공개</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                  <th className="p-3 font-bold">번호</th>
                  <th className="p-3 font-bold">게시판</th>
                  <th className="p-3 font-bold">제목</th>
                  <th className="p-3 font-bold">등록일</th>
                  <th className="p-3 font-bold">상태 분류</th>
                  <th className="p-3 font-bold">AI 모델</th>
                  <th className="p-3 font-bold text-center">관리 조치</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredPosts.map((post) => (
                  <tr key={post.id} className="hover:bg-slate-50">
                    <td className="p-3 text-slate-500 font-mono text-xs">{post.nttSn}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700">
                        {post.boardName}
                      </span>
                    </td>
                    <td className="p-3 max-w-xs sm:max-w-md truncate font-bold text-slate-900">
                      <button
                        onClick={() => setInspectingPost(post)}
                        className="hover:text-blue-600 hover:underline text-left truncate block w-full"
                      >
                        {post.title}
                      </button>
                    </td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">{post.registeredDate}</td>
                    <td className="p-3 whitespace-nowrap">
                      {post.inspectionStatus === 'PENDING_REVIEW' ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 flex items-center gap-1 w-max">
                          <AlertTriangle className="w-3 h-3" />
                          검수 필요
                        </span>
                      ) : post.inspectionStatus === 'AUTO_PUBLISHED' ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                          자동 발행
                        </span>
                      ) : post.inspectionStatus === 'APPROVED' ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                          승인 완료
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-600">
                          비공개
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-slate-100">
                        {post.isDemo ? '데모 규칙엔진' : post.aiModelUsed}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setInspectingPost(post)}
                          className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
                        >
                          상세/검수
                        </button>
                        {post.inspectionStatus === 'PENDING_REVIEW' && (
                          <button
                            onClick={() => handleUpdateStatus(post.id, 'APPROVED')}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                          >
                            승인
                          </button>
                        )}
                        {post.inspectionStatus !== 'UNPUBLISHED' ? (
                          <button
                            onClick={() => handleUpdateStatus(post.id, 'UNPUBLISHED')}
                            className="p-1 text-slate-400 hover:text-slate-600"
                            title="비공개 처리"
                          >
                            <EyeOff className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateStatus(post.id, 'APPROVED')}
                            className="p-1 text-slate-400 hover:text-emerald-600"
                            title="다시 공개"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* 4. 관리자 상세 검수 및 AI 재분석 모달 */}
      {inspectingPost && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                  {inspectingPost.boardName} (고유번호: {inspectingPost.nttSn})
                </span>
                <h3 className="font-extrabold text-lg mt-1 text-slate-900">
                  {inspectingPost.title}
                </h3>
              </div>
              <button
                onClick={() => setInspectingPost(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {inspectingPost.isSafetyOrPolicy && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                <strong>[정책/안전 중요 분류 감지]</strong> 키워드: {inspectingPost.policyKeywords || '법정의무, 보조금, 안전 등'}
                <p className="mt-0.5">고령자 권익 보호 및 오안내 방지를 위해 관리자 검수 후 승인을 권장합니다.</p>
              </div>
            )}

            <div>
              <h4 className="font-bold text-sm text-slate-700 mb-1">생성된 쉬운 설명</h4>
              <div className="p-3 rounded-xl bg-slate-50 border text-sm whitespace-pre-line leading-relaxed">
                {inspectingPost.easyExplanation}
              </div>
            </div>

            <div>
              <h4 className="font-bold text-sm text-slate-700 mb-1">TTS 음성 대본</h4>
              <div className="p-3 rounded-xl bg-slate-50 border text-sm whitespace-pre-line leading-relaxed">
                {inspectingPost.voiceScript}
              </div>
            </div>

            {/* 검수 및 상태 조작 버튼군 */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t">
              <button
                onClick={() => handleReAnalyze(inspectingPost.id)}
                disabled={reAnalyzingId === inspectingPost.id}
                className="px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold flex items-center gap-1.5 border border-purple-200"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reAnalyzingId === inspectingPost.id ? 'animate-spin' : ''}`} />
                <span>{reAnalyzingId === inspectingPost.id ? 'AI 재분석 중...' : 'AI 재분석 실행'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleUpdateStatus(inspectingPost.id, 'UNPUBLISHED')}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                >
                  비공개 처리
                </button>
                <button
                  onClick={() => handleUpdateStatus(inspectingPost.id, 'APPROVED')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow"
                >
                  검수 승인 및 발행
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

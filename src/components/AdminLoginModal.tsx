'use client';

import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, X, LogIn, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, isFirebaseConfigured, getMissingFirebaseEnvVars } from '@/lib/firebase';
import Eodongi from '@/components/Eodongi';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AdminLoginModal({ isOpen, onClose, onSuccess }: AdminLoginModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !password.trim()) {
      setErrorMessage('이메일과 비밀번호를 모두 입력해 주세요.');
      return;
    }

    if (!auth || !isFirebaseConfigured()) {
      const missing = getMissingFirebaseEnvVars();
      const detail = missing.length > 0 ? ` (누락된 변수: ${missing.join(', ')})` : '';
      setErrorMessage(`Firebase 설정이 완료되지 않았습니다.${detail}`);
      console.warn('[Firebase Auth 진단] 누락된 환경변수:', missing);
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // 로그인 성공
      setLoading(false);
      onSuccess();
    } catch (err: any) {
      setLoading(false);
      console.error('Firebase Auth 로그인 에러:', err.code, err.message);

      switch (err.code) {
        case 'auth/invalid-email':
          setErrorMessage('올바른 이메일 주소 형식을 입력해 주세요.');
          break;
        case 'auth/user-not-found':
          setErrorMessage('등록되지 않은 관리자 계정입니다.');
          break;
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setErrorMessage('이메일 또는 비밀번호가 일치하지 않습니다.');
          break;
        case 'auth/too-many-requests':
          setErrorMessage('로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.');
          break;
        case 'auth/user-disabled':
          setErrorMessage('비활성화된 계정입니다. 관리자에게 문의하세요.');
          break;
        default:
          setErrorMessage('로그인에 실패했습니다. 이메일과 비밀번호를 다시 확인해 주세요.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div 
        className="relative w-full sm:max-w-md max-h-[92dvh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border-t-4 sm:border-4 border-sky-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 귀여운 헤더 */}
        <div className="bg-gradient-to-r from-sky-400 via-sky-500 to-blue-600 px-5 sm:px-6 py-4 sm:py-5 text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 bg-white rounded-2xl flex items-center justify-center shadow-md p-1 flex-shrink-0">
              <Eodongi size={38} pose="happy" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-cute text-sky-100">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-300 flex-shrink-0" />
                <span className="truncate">한국어촌어항공단 관리 시스템</span>
              </div>
              <h2 className="text-lg sm:text-xl font-cute font-bold tracking-wide text-white drop-shadow-sm">
                관리자 모드 로그인
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors flex-shrink-0"
            title="닫기"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 바디 폼 */}
        <div className="p-5 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <p className="text-sm text-slate-600 font-cute mb-5 text-center leading-relaxed break-keep">
            관리자 전용 대시보드 접근을 위해<br />
            등록된 <span className="text-sky-600 font-bold">이메일과 비밀번호</span>를 입력해 주세요.
          </p>

          {errorMessage && (
            <div className="mb-4 p-3 rounded-2xl bg-rose-50 border-2 border-rose-200 text-rose-700 text-sm font-cute flex items-center gap-2 break-keep">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 이메일 입력 */}
            <div>
              <label className="block text-sm font-cute text-slate-700 mb-1.5 ml-1">
                관리자 이메일 계정
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@fipa.or.kr"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl border-2 border-sky-100 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200 text-base sm:text-sm font-cute transition-all min-h-[46px]"
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* 비밀번호 입력 */}
            <div>
              <label className="block text-sm font-cute text-slate-700 mb-1.5 ml-1">
                비밀번호
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-12 py-3 rounded-2xl border-2 border-sky-100 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200 text-base sm:text-sm font-cute transition-all min-h-[46px]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 px-3 min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* 로그인 버튼 */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] py-3 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 active:scale-95 text-white font-cute text-base font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>확인하는 중...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    <span>관리자 로그인</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* 취소 버튼 */}
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 text-sm text-slate-500 hover:text-slate-700 font-cute underline"
            >
              홈 화면으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

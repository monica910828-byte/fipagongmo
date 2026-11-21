'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart3, TrendingUp, MessageSquare, Eye, Award, HelpCircle,
  RefreshCw, Search, Sparkles, ChevronRight, ChevronDown, CheckCircle2,
  Clock, Hash, ArrowUpRight, Flame, Volume2
} from 'lucide-react';
import Eodongi from '@/components/Eodongi';

interface TopPost {
  id: string;
  title: string;
  boardName: string;
  boardType: string;
  views: number;
  registeredDate: string;
}

interface BoardDist {
  boardName: string;
  views: number;
  percentage: number;
}

interface QnaLog {
  id: string;
  question: string;
  answer: string;
  postTitle?: string | null;
  createdAt: string;
}

interface DailyTrend {
  date: string;
  fullDate: string;
  reads: number;
  questions: number;
}

interface KeywordStat {
  keyword: string;
  count: number;
}

export default function AdminAnalyticsSection() {
  const [loading, setLoading] = useState(true);
  const [totalReads, setTotalReads] = useState(0);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [boardDistribution, setBoardDistribution] = useState<BoardDist[]>([]);
  
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [qnaLogs, setQnaLogs] = useState<QnaLog[]>([]);
  const [topKeywords, setTopKeywords] = useState<KeywordStat[]>([]);
  const [dailyActivity, setDailyActivity] = useState<DailyTrend[]>([]);

  // UI 필터 및 상세 보기 토글
  const [qnaSearch, setQnaSearch] = useState('');
  const [expandedQnaId, setExpandedQnaId] = useState<string | null>(null);
  const [selectedKeywordFilter, setSelectedKeywordFilter] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics');
      const data = await res.json();
      if (data.success) {
        setTotalReads(data.readStats.totalReads || 0);
        setTopPosts(data.readStats.topPosts || []);
        setBoardDistribution(data.readStats.boardDistribution || []);
        
        setTotalQuestions(data.questionStats.totalQuestions || 0);
        setQnaLogs(data.questionStats.recentQuestions || []);
        setTopKeywords(data.questionStats.topKeywords || []);
        setDailyActivity(data.questionStats.dailyActivity || []);
      }
    } catch (e) {
      console.error('분석 데이터 조회 실패:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  // 최대 조회수 (그래프 백분율 계산용)
  const maxPostViews = topPosts.length > 0 ? Math.max(...topPosts.map(p => p.views), 1) : 1;
  // 최대 일일 질문수 (추이 바 높이 계산용)
  const maxDailyQuestions = dailyActivity.length > 0 ? Math.max(...dailyActivity.map(d => d.questions), 1) : 1;

  // 질문 필터링
  const filteredQnas = qnaLogs.filter(q => {
    const matchesSearch = !qnaSearch || q.question.toLowerCase().includes(qnaSearch.toLowerCase()) || (q.postTitle || '').toLowerCase().includes(qnaSearch.toLowerCase());
    const matchesKeyword = !selectedKeywordFilter || q.question.includes(selectedKeywordFilter);
    return matchesSearch && matchesKeyword;
  });

  const getBoardBadgeColor = (boardName: string) => {
    switch (boardName) {
      case '보도자료':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case '카드뉴스':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case '공지사항':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case '공고/공모':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getBoardBarGradient = (boardName: string) => {
    switch (boardName) {
      case '보도자료':
        return 'from-blue-500 to-sky-400';
      case '카드뉴스':
        return 'from-purple-500 to-indigo-400';
      case '공지사항':
        return 'from-emerald-500 to-teal-400';
      case '공고/공모':
        return 'from-amber-500 to-orange-400';
      default:
        return 'from-sky-500 to-blue-400';
    }
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / (1000 * 60));
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffMin < 1) return '방금 전';
      if (diffMin < 60) return `${diffMin}분 전`;
      if (diffHour < 24) return `${diffHour}시간 전`;
      if (diffDay < 7) return `${diffDay}일 전`;
      return `${date.getMonth() + 1}월 ${date.getDate()}일`;
    } catch {
      return isoString;
    }
  };

  return (
    <section className="space-y-6">
      {/* 1. 상단 섹션 타이틀 헤더 */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-3xl p-6 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white rounded-2xl p-1 shadow-md flex items-center justify-center shrink-0">
            <Eodongi size={48} pose="searching" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full bg-yellow-400 text-blue-950 text-xs font-black tracking-wide">
                REAL-TIME ANALYTICS
              </span>
              <span className="text-xs text-sky-200 flex items-center gap-1 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                실시간 이용 관제 가동 중
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span>디지털 취약계층 소식 열람 & AI 질문 분석 센터</span>
              <BarChart3 className="w-5 h-5 text-amber-300" />
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              어르신 등 사용자들이 <strong>어떤 공단 소식을 얼마나 읽었는지</strong>, <strong>어떤 질문을 했는지</strong>를 실시간 그래프로 모니터링합니다.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-xs sm:text-sm font-bold text-slate-200 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            title="분석 데이터 새로고침"
          >
            <RefreshCw className={`w-4 h-4 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? '새로고침 중...' : '통계 새로고침'}</span>
          </button>
        </div>
      </div>

      {/* 2. 핵심 KPI 요약 카드 4장 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 카드 1: 누적 소식 열람 수 */}
        <div className="p-5 rounded-2xl bg-white border-2 border-sky-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <Eye className="w-4 h-4 text-sky-500" />
              <span>누적 소식 열람/청취</span>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 font-mono text-xs font-bold">
              총 {totalReads}회
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 font-mono tracking-tight">
              {totalReads.toLocaleString()}
            </span>
            <span className="text-xs text-emerald-600 font-bold flex items-center">
              <TrendingUp className="w-3.5 h-3.5 mr-0.5" />
              실시간 집계 중
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            어르신 맞춤 음성 청취 및 카드뉴스 열람 합산
          </p>
        </div>

        {/* 카드 2: 누적 AI 질문 수 */}
        <div className="p-5 rounded-2xl bg-white border-2 border-indigo-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <MessageSquare className="w-4 h-4 text-indigo-500" />
              <span>누적 어르신 AI 질문 수</span>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-mono text-xs font-bold">
              {totalQuestions}건 접수
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-indigo-950 font-mono tracking-tight">
              {totalQuestions.toLocaleString()}
            </span>
            <span className="text-xs text-indigo-600 font-bold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              GPT-4o 실시간 답변
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            음성 마이크 질문 및 텍스트 대화형 질의응답
          </p>
        </div>

        {/* 카드 3: 가장 많이 읽은 소식 */}
        <div className="p-5 rounded-2xl bg-white border-2 border-amber-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <Award className="w-4 h-4 text-amber-500" />
              <span>최다 열람 인기 소식</span>
            </span>
            {topPosts[0] && (
              <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-mono text-xs font-bold">
                {topPosts[0].views}회
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-slate-800 line-clamp-2 leading-snug">
            {topPosts[0] ? topPosts[0].title : '수집된 소식 없음'}
          </p>
          <div className="mt-2 text-xs text-amber-700 font-bold flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-400" />
            <span>취약계층 관심도 1위 소식</span>
          </div>
        </div>

        {/* 카드 4: 최다 문의 키워드 */}
        <div className="p-5 rounded-2xl bg-white border-2 border-emerald-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <Hash className="w-4 h-4 text-emerald-500" />
              <span>주요 문의 관심사</span>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-xs font-bold">
              TOP 키워드
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {topKeywords.slice(0, 3).map(kw => (
              <span
                key={kw.keyword}
                className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-bold font-mono"
              >
                #{kw.keyword} ({kw.count}건)
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            어르신들이 가장 많이 문의한 주제 키워드
          </p>
        </div>
      </div>

      {/* 3. 대형 2단 시각화 그래프 영역 (상단 그래프 포맷) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 그래프 1: 사용자들이 어떤 내용을 읽었는지 횟수 (소식별 랭킹 가로 막대 그래프) */}
        <div className="bg-white rounded-3xl p-6 border-2 border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  사용자들이 읽은 소식 및 열람 횟수 TOP 랭킹
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                소식별 실제 열람 및 어동이 음성 재생 횟수 기준 막대 그래프
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-slate-400">
              단위: 회
            </span>
          </div>

          {/* 가로 막대 차트 목록 */}
          <div className="space-y-4">
            {topPosts.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                열람 기록을 수집하고 있습니다.
              </div>
            ) : (
              topPosts.map((post, idx) => {
                const percentage = Math.round((post.views / maxPostViews) * 100);
                return (
                  <div key={post.id} className="group">
                    <div className="flex items-center justify-between text-xs mb-1 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs shrink-0 font-mono ${
                          idx === 0 ? 'bg-amber-400 text-blue-950' : idx === 1 ? 'bg-slate-300 text-slate-800' : idx === 2 ? 'bg-amber-700/20 text-amber-900' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md border text-[11px] font-bold shrink-0 ${getBoardBadgeColor(post.boardName)}`}>
                          {post.boardName}
                        </span>
                        <span className="font-bold text-slate-800 truncate group-hover:text-sky-600 transition-colors" title={post.title}>
                          {post.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 font-mono">
                        <span className="font-black text-slate-900 text-sm">{post.views}</span>
                        <span className="text-slate-400 text-[11px]">회</span>
                      </div>
                    </div>

                    {/* 막대 바 */}
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${getBoardBarGradient(post.boardName)} transition-all duration-700`}
                        style={{ width: `${Math.max(percentage, 8)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 카테고리별 열람 비중 프로그레스 바 */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-600 mb-2.5 flex items-center justify-between">
              <span>게시판 분야별 열람 비중 (%)</span>
              <span className="text-slate-400 font-mono font-normal">총 {totalReads}회 기준</span>
            </h4>
            
            {/* 누적 바 */}
            <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
              {boardDistribution.map(item => (
                <div
                  key={item.boardName}
                  title={`${item.boardName}: ${item.views}회 (${item.percentage}%)`}
                  className={`h-full bg-gradient-to-r ${getBoardBarGradient(item.boardName)} transition-all`}
                  style={{ width: `${item.percentage}%` }}
                />
              ))}
            </div>

            {/* 범례 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
              {boardDistribution.map(item => (
                <div key={item.boardName} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${getBoardBarGradient(item.boardName)}`} />
                    <span className="font-bold text-slate-700">{item.boardName}</span>
                  </div>
                  <span className="font-mono font-bold text-slate-900">{item.views}회 ({item.percentage}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 그래프 2: 사용자들이 어떤 질문을 했는지 (일자별 질문 발생 추이 및 주요 키워드) */}
        <div className="bg-white rounded-3xl p-6 border-2 border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    사용자 AI 질문 발생 추이 및 관심 키워드
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  최근 7일간 질문 발생 빈도 및 자주 언급된 핵심 어휘
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-slate-400">
                총 {totalQuestions}건
              </span>
            </div>

            {/* 일자별 세로 컬럼 바 차트 */}
            <div className="mb-6">
              <h4 className="text-xs font-bold text-slate-600 mb-2">일별 사용자 질문 발생 건수</h4>
              <div className="h-32 bg-slate-50 rounded-2xl p-4 flex items-end justify-between gap-2 border border-slate-100">
                {dailyActivity.map((d, i) => {
                  const heightPct = Math.round((d.questions / maxDailyQuestions) * 75) + 15;
                  const isToday = i === dailyActivity.length - 1;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                      <span className="text-[10px] font-mono font-bold text-slate-500 group-hover:text-indigo-600 transition-colors">
                        {d.questions}건
                      </span>
                      <div className="w-full bg-slate-200/80 rounded-t-lg h-24 flex items-end justify-center p-1 overflow-hidden">
                        <div
                          className={`w-full rounded-t-md transition-all duration-500 ${
                            isToday
                              ? 'bg-gradient-to-t from-indigo-600 to-sky-400 group-hover:brightness-110'
                              : 'bg-gradient-to-t from-slate-400 to-indigo-400 group-hover:from-indigo-500'
                          }`}
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                      <span className={`text-[11px] font-mono font-bold ${isToday ? 'text-indigo-700' : 'text-slate-400'}`}>
                        {d.date}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 질문 키워드 랭킹 태그 클라우드 */}
            <div>
              <h4 className="text-xs font-bold text-slate-600 mb-2 flex items-center justify-between">
                <span>자주 질문한 어촌·어항 핵심 키워드</span>
                {selectedKeywordFilter && (
                  <button
                    onClick={() => setSelectedKeywordFilter(null)}
                    className="text-[11px] text-rose-500 hover:underline"
                  >
                    필터 초기화
                  </button>
                )}
              </h4>
              <div className="flex flex-wrap gap-2">
                {topKeywords.map(kw => {
                  const isSelected = selectedKeywordFilter === kw.keyword;
                  return (
                    <button
                      key={kw.keyword}
                      onClick={() => setSelectedKeywordFilter(isSelected ? null : kw.keyword)}
                      className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-indigo-600 text-white ring-2 ring-indigo-300 scale-105'
                          : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200'
                      }`}
                    >
                      <Hash className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{kw.keyword}</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-white/80 text-indigo-950 font-mono text-[10px]">
                        {kw.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>실시간 질문 유입 시 자동 갱신됩니다.</span>
            </span>
            <span className="text-slate-400">
              클릭 시 해당 키워드 질문 목록 필터링
            </span>
          </div>
        </div>
      </div>

      {/* 4. 사용자들이 어떤 질문을 했는지 내용 상세 목록 (실시간 Q&A 피드) */}
      <div className="bg-white rounded-3xl p-6 border-2 border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-600" />
              <h3 className="text-base sm:text-lg font-black text-slate-900">
                사용자 실제 질문 내용 및 AI 답변 로그
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              사용자가 음성 마이크 또는 텍스트로 질문한 내용과 인공지능이 제공한 답변 내역입니다.
            </p>
          </div>

          {/* 검색 필터 */}
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={qnaSearch}
              onChange={(e) => setQnaSearch(e.target.value)}
              placeholder="질문 또는 소식 검색..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
            />
            {qnaSearch && (
              <button
                onClick={() => setQnaSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* 질문 카드 피드 리스트 */}
        <div className="space-y-3">
          {filteredQnas.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100">
              <HelpCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-600">검색된 질문 내역이 없습니다.</p>
              <p className="text-xs text-slate-400 mt-1">메인 화면에서 어동이에게 질문을 남기면 실시간으로 이곳에 등록됩니다.</p>
            </div>
          ) : (
            filteredQnas.map((qna, idx) => {
              const isExpanded = expandedQnaId === qna.id;
              return (
                <div
                  key={qna.id}
                  className="p-4 rounded-2xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[11px] font-black font-mono">
                        질문 #{filteredQnas.length - idx}
                      </span>
                      {qna.postTitle && (
                        <span className="text-xs text-sky-800 font-bold bg-sky-50 px-2 py-0.5 rounded border border-sky-200/60 truncate max-w-xs">
                          연계: {qna.postTitle}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1 shrink-0">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatRelativeTime(qna.createdAt)}</span>
                    </span>
                  </div>

                  {/* 질문 내용 원문 */}
                  <div className="flex items-start gap-2 mb-2">
                    <span className="w-6 h-6 rounded-xl bg-amber-400 text-blue-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      Q
                    </span>
                    <p className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                      "{qna.question}"
                    </p>
                  </div>

                  {/* 답변 내용 미리보기 및 펼치기 */}
                  <div className="pl-8">
                    <div className="p-3 bg-white rounded-xl border border-slate-200/60 text-xs sm:text-sm text-slate-700 leading-relaxed">
                      <div className="flex items-center justify-between mb-1 text-slate-500 font-bold text-[11px]">
                        <span className="flex items-center gap-1 text-sky-700">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span>어동이 AI 친절 답변</span>
                        </span>
                        <button
                          onClick={() => setExpandedQnaId(isExpanded ? null : qna.id)}
                          className="text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 font-bold"
                        >
                          <span>{isExpanded ? '간략히 접기' : '전체 보기'}</span>
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <p className={`${isExpanded ? '' : 'line-clamp-2'} text-slate-800`}>
                        {qna.answer}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

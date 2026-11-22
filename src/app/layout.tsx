import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FiPA 들려드림 — 한국어촌어항공단 귀여운 AI 음성안내',
  description: '한국어촌어항공단의 보도자료, 공지사항, 공고·공모를 어동이가 쉬운 글과 다정한 음성으로 쏙쏙 들려드립니다.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Jua&family=Gaegu:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-[#F3F9FF] text-slate-900 min-h-screen antialiased selection:bg-amber-200 font-cute overflow-x-clip">
        {children}
      </body>
    </html>
  );
}

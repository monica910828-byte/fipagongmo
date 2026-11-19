import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FiPA 들려드림 — 한국어촌어항공단 AI 음성안내',
  description: '한국어촌어항공단의 보도자료, 카드뉴스, 공지사항을 어르신을 위해 큰 글씨와 친절한 음성으로 들려드립니다.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-slate-50 text-slate-900 min-h-screen antialiased selection:bg-yellow-200">
        {children}
      </body>
    </html>
  );
}

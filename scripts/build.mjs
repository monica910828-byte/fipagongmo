import { execSync } from 'child_process';

// 1. Vercel 빌드 환경에서 DATABASE_URL 누락으로 인한 Prisma P1012 오류 원천 방지
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./prisma/dev.db';

// 2. Vercel에 VITE_FIREBASE_*로 등록된 변수들을 Next.js 빌드 시 클라이언트 번들에 노출되도록 NEXT_PUBLIC_ 변수로도 상호 복사
const firebaseKeys = [
  'API_KEY',
  'AUTH_DOMAIN',
  'PROJECT_ID',
  'STORAGE_BUCKET',
  'MESSAGING_SENDER_ID',
  'APP_ID',
  'MEASUREMENT_ID',
];

for (const key of firebaseKeys) {
  const viteVal = process.env[`VITE_FIREBASE_${key}`];
  const nextVal = process.env[`NEXT_PUBLIC_FIREBASE_${key}`];
  if (viteVal && !nextVal) {
    process.env[`NEXT_PUBLIC_FIREBASE_${key}`] = viteVal;
  } else if (nextVal && !viteVal) {
    process.env[`VITE_FIREBASE_${key}`] = nextVal;
  }
}

console.log('📦 1/2: Generating Prisma Client...');
execSync('npx prisma generate', { stdio: 'inherit', env: process.env });

console.log('🚀 2/2: Building Next.js application...');
execSync('next build', { stdio: 'inherit', env: process.env });

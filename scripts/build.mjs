import { execSync } from 'child_process';

// 1. Vercel 빌드 환경에서 DATABASE_URL 누락으로 인한 Prisma P1012 오류 원천 방지
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./prisma/dev.db';

console.log('📦 1/2: Generating Prisma Client...');
execSync('npx prisma generate', { stdio: 'inherit', env: process.env });

console.log('🚀 2/2: Building Next.js application...');
execSync('next build', { stdio: 'inherit', env: process.env });

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.fipa.or.kr',
      },
    ],
  },
  // Vercel 및 클라이언트 브라우저 번들에 VITE_FIREBASE_* 및 NEXT_PUBLIC_ 변수 인라인 노출
  env: {
    VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    VITE_FIREBASE_STORAGE_BUCKET: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    VITE_FIREBASE_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
    VITE_FIREBASE_MEASUREMENT_ID: process.env.VITE_FIREBASE_MEASUREMENT_ID || process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || '',

    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '',
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || '',
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || process.env.VITE_FIREBASE_MEASUREMENT_ID || '',
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': path.resolve(__dirname, 'src'),
    };
    return config;
  },
};

export default nextConfig;

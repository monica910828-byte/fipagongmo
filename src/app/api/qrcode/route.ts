import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url') || req.headers.get('referer') || 'https://www.fipa.or.kr';

    // SVG 또는 Data URL 생성
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: {
        dark: '#0A4E9B',
        light: '#FFFFFF',
      },
    });

    return NextResponse.json({
      success: true,
      qrDataUrl,
      targetUrl: url,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

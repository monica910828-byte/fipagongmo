import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const intervalSetting = await prisma.systemSetting.findUnique({
      where: { key: 'SYNC_INTERVAL_MINUTES' },
    });
    const autoSyncSetting = await prisma.systemSetting.findUnique({
      where: { key: 'AUTO_SYNC_ENABLED' },
    });

    return NextResponse.json({
      success: true,
      intervalMinutes: parseInt(intervalSetting?.value || process.env.SYNC_INTERVAL_MINUTES || '60', 10),
      autoSyncEnabled: autoSyncSetting ? autoSyncSetting.value === 'true' : true,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { intervalMinutes, autoSyncEnabled } = await req.json();

    if (intervalMinutes !== undefined) {
      await prisma.systemSetting.upsert({
        where: { key: 'SYNC_INTERVAL_MINUTES' },
        create: {
          key: 'SYNC_INTERVAL_MINUTES',
          value: String(intervalMinutes),
          description: '자동 동기화 주기 (분)',
        },
        update: {
          value: String(intervalMinutes),
        },
      });
    }

    if (autoSyncEnabled !== undefined) {
      await prisma.systemSetting.upsert({
        where: { key: 'AUTO_SYNC_ENABLED' },
        create: {
          key: 'AUTO_SYNC_ENABLED',
          value: String(Boolean(autoSyncEnabled)),
          description: '자동 동기화 활성화 여부',
        },
        update: {
          value: String(Boolean(autoSyncEnabled)),
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: '동기화 설정이 저장되었습니다.',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import path from 'path';

const prisma = new PrismaClient();

console.log('[스케줄러 데몬] FiPA 들려드림 백그라운드 자동 동기화 데몬이 시작되었습니다.');

let isSyncRunning = false;

async function checkAndRunSync() {
  if (isSyncRunning) {
    console.log('[스케줄러] 이전 동기화가 아직 진행 중입니다. 대기합니다.');
    return;
  }

  try {
    // 동기화 설정 조회
    const autoSyncSetting = await prisma.systemSetting.findUnique({
      where: { key: 'AUTO_SYNC_ENABLED' },
    });
    const intervalSetting = await prisma.systemSetting.findUnique({
      where: { key: 'SYNC_INTERVAL_MINUTES' },
    });

    const isEnabled = autoSyncSetting ? autoSyncSetting.value === 'true' : true;
    const intervalMinutes = parseInt(intervalSetting?.value || process.env.SYNC_INTERVAL_MINUTES || '60', 10);

    if (!isEnabled) {
      // 자동 동기화 꺼짐
      return;
    }

    const lastLog = await prisma.syncLog.findFirst({
      where: { boardId: 'ALL', status: 'SUCCESS' },
      orderBy: { completedAt: 'desc' },
    });

    const now = Date.now();
    const lastSyncTime = lastLog?.completedAt ? new Date(lastLog.completedAt).getTime() : 0;
    const elapsedMinutes = (now - lastSyncTime) / (1000 * 60);

    if (elapsedMinutes >= intervalMinutes) {
      console.log(`[스케줄러] 동기화 주기 도달 (${Math.round(elapsedMinutes)}분 경과 / 설정: ${intervalMinutes}분). 동기화를 실행합니다.`);
      isSyncRunning = true;

      // run-sync 실행
      const scriptPath = path.resolve('scripts/run-sync.mjs');
      exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
        isSyncRunning = false;
        if (error) {
          console.error('[스케줄러 동기화 오류]', error.message);
        } else {
          console.log('[스케줄러 동기화 완료]');
        }
      });
    }
  } catch (err) {
    console.error('[스케줄러 검사 오류]:', err.message);
  }
}

// 30초마다 설정값 및 경과시간 확인 (관리자 변경사항 실시간 반영)
const CHECK_CYCLE_MS = 30 * 1000;
setInterval(checkAndRunSync, CHECK_CYCLE_MS);
checkAndRunSync();

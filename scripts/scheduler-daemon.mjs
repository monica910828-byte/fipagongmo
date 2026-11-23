import dotenv from 'dotenv';
dotenv.config();

import { exec } from 'child_process';
import path from 'path';

// 매일 한국시간(KST) 오전 9시, 오후 3시(15시) 자동 동기화 스케줄러 데몬 (로컬 실행용)
const SCHEDULE_HOURS_KST = [9, 15];
const executedSlots = new Set();
let isSyncRunning = false;

function getKstParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: parseInt(parts.hour, 10),
    minute: parseInt(parts.minute, 10),
  };
}

console.log('[스케줄러 데몬] FiPA 들려드림 자동 동기화 데몬이 시작되었습니다. (매일 KST 09:00, 15:00 실행)');

function checkAndRunSync() {
  if (isSyncRunning) return;

  const { dateKey, hour, minute } = getKstParts();
  if (!SCHEDULE_HOURS_KST.includes(hour) || minute > 5) {
    return;
  }

  const slotKey = `${dateKey}_${String(hour).padStart(2, '0')}`;
  if (executedSlots.has(slotKey)) {
    return;
  }

  executedSlots.add(slotKey);
  isSyncRunning = true;
  console.log(`[스케줄러] KST ${String(hour).padStart(2, '0')}:00 정기 동기화를 시작합니다. (${slotKey})`);

  const scriptPath = path.resolve('scripts/run-sync.mjs');
  exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
    isSyncRunning = false;
    if (error) {
      console.error('[스케줄러 동기화 오류]', error.message);
      executedSlots.delete(slotKey);
    } else {
      console.log('[스케줄러 동기화 완료]', stdout?.trim() || '');
    }
  });
}

// 30초마다 KST 09:00 / 15:00 도달 여부 확인
setInterval(checkAndRunSync, 30 * 1000);
checkAndRunSync();

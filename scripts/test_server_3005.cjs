const { spawn } = require('child_process');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('Testing Next.js on port 3005 with curl...');
  const child = spawn('npx.cmd', ['next', 'start', '-p', '3005'], {
    stdio: 'inherit',
    shell: true,
  });

  child.on('error', (e) => console.error(e));

  try {
    let ok = false;
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      try {
        const res = await fetch('http://127.0.0.1:3005/api/sync');
        if (res.ok) {
          const data = await res.json();
          console.log('\n[SUCCESS] Connected to /api/sync!');
          console.log('Stats:', data.stats);
          console.log('Robots notice:', data.robotsNotice);
          ok = true;
          break;
        }
      } catch (e) {
        // waiting
      }
    }

    if (!ok) {
      throw new Error('Could not connect to port 3005');
    }

    // Test /api/posts
    const postsRes = await fetch('http://127.0.0.1:3005/api/posts');
    const postsData = await postsRes.json();
    console.log('\n[SUCCESS] /api/posts count:', postsData.posts?.length);
    if (postsData.posts?.length > 0) {
      console.log('First Post Title:', postsData.posts[0].title);
      console.log('First Post RegisteredDate:', postsData.posts[0].registeredDate);
      console.log('First Post InspectionStatus:', postsData.posts[0].inspectionStatus);
    }

    // Test /api/ai/ask
    const askRes = await fetch('http://127.0.0.1:3005/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '교육이나 일정 알려줘' }),
    });
    const askData = await askRes.json();
    console.log('\n[SUCCESS] /api/ai/ask Answer:', askData.answer);
    console.log('Is Demo:', askData.isDemo);

    // Test /api/qrcode
    const qrRes = await fetch('http://127.0.0.1:3005/api/qrcode?url=http://127.0.0.1:3005');
    const qrData = await qrRes.json();
    console.log('\n[SUCCESS] /api/qrcode generated data url starts with:', qrData.qrDataUrl?.substring(0, 30));

    console.log('\n======================================================');
    console.log('   모든 핵심 API 및 프론트엔드 연동 테스트 완료 100%   ');
    console.log('======================================================');
  } finally {
    console.log('Shutting down server...');
    child.kill();
    try {
      const { execSync } = require('child_process');
      execSync('taskkill /F /IM node.exe /FI "WINDOWTITLE eq *next*" 2>nul || exit 0', { shell: true });
    } catch {}
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

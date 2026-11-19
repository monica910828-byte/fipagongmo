const { spawn } = require('child_process');

async function run() {
  console.log('Testing Next.js start and curl in same command...');
  const child = spawn('npx.cmd', ['next', 'start', '-p', '3000'], {
    shell: true,
  });

  child.stdout.on('data', (d) => process.stdout.write(`[SERVER OUT] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[SERVER ERR] ${d}`));

  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const res = await fetch('http://127.0.0.1:3000/api/sync');
      console.log('Probe response status:', res.status);
      const text = await res.text();
      console.log('Probe response body:', text.substring(0, 300));
      break;
    } catch (e) {
      console.log(`[Attempt ${i+1}] fetch error:`, e.message, e.cause ? e.cause : '');
    }
  }

  child.kill();
}

run();

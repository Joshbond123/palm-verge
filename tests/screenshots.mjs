import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const server = spawn('node', ['serve.ts', '--port', '8214'], { stdio: 'pipe' });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('server timeout')), 15000);
  server.stdout.on('data', (d) => { if (String(d).includes('8214')) { clearTimeout(t); res(); } });
  server.stderr.on('data', (d) => process.stderr.write(d));
});

const exePath = await chromium.executablePath();
console.log('chromium:', exePath);
const browser = await puppeteer.launch({
  executablePath: exePath,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib:/tmp/swiftshader' },
  args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--font-render-hinting=none'],
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => errors.push('reqfail: ' + r.url() + ' ' + (r.failure()?.errorText || '')));

mkdirSync('screenshots', { recursive: true });
const shots = [
  ['1-title.jpg', '?shot=start&seed=1'],
  ['2-play.jpg', '?shot=play&seed=1'],
  ['3-drive.jpg', '?shot=drive&seed=1'],
  ['4-mission.jpg', '?shot=mission&seed=1'],
];
for (const [name, query] of shots) {
  const url = `http://127.0.0.1:8214/${query}`;
  console.log('loading', url);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction('window.__shotReady === true', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `screenshots/${name}`, type: 'jpeg', quality: 82 });
  console.log('saved', name);
}
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
server.kill();
process.exit(errors.length ? 1 : 0);

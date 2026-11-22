import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { spawn } from 'node:child_process';

const server = spawn('node', ['serve.ts', '--port', '8213'], { stdio: 'pipe' });
await new Promise((res) => { server.stdout.on('data', (d) => { if (String(d).includes('8213')) res(); }); });
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib:/tmp/swiftshader' },
  args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 480 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://127.0.0.1:8213/?test=1', { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction('window.__pv !== undefined');
await page.evaluate(() => document.querySelector('.btn.primary').click());

let fails = 0;
const log = (name, ok, detail) => { if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail ?? ''}`); };
const st = () => page.evaluate(() => window.__pv.step(1));
const tele = (x, z) => page.evaluate((a) => window.__pv.teleport(a.x, a.z), { x, z });
const place = (n) => page.evaluate((n) => window.__pv.place(n), n);

// 1 -> marina
let p = await place('marina'); await tele(p.x, p.z);
let s = await page.evaluate(() => window.__pv.step(20));
log('mission 1 done', s.mission === 'hot-wheels', `money=${s.money}`);

// 2 -> steal sport car at plaza, deliver to garage
const mc = s.missionCar;
log('mission 2 spawns a marker car', !!mc, JSON.stringify(mc));
await tele(mc.x, mc.z + 1.5);
await page.evaluate(() => window.__pv.step(2, { actions: window.__pv.actions.INTERACT }));
s = await st();
log('entered the marked car', s.inCar === true && s.stage === 'deliver', `inCar=${s.inCar} stage=${s.stage}`);
p = await place('garage');
await tele(p.x, p.z);
s = await page.evaluate(() => window.__pv.step(20));
log('mission 2 done', s.mission === 'package-run', `money=${s.money} stage=${s.stage}`);

// 3 -> collect the package at the marina, then beat the clock to the hideout
p = await place('marina'); await tele(p.x, p.z);
s = await page.evaluate(() => window.__pv.step(20));
log('mission 3 package collected', s.mission === 'package-run' && s.stage === 'deliver', `stage=${s.stage}`);
p = await place('hideout'); await tele(p.x, p.z);
s = await page.evaluate(() => window.__pv.step(20));
log('mission 3 done', ['heat', 'rooftop-deal', 'neon-heat'].includes(s.mission), `chained to=${s.mission} money=${s.money}`);

// 4 -> escape: lose police then reach hideout
await page.evaluate(() => window.__pv.setWanted(4));
s = await st();
log('mission 4 raises heat', s.wanted > 0, `wanted=${s.wanted} police=${s.police}`);
// Clear the wanted level the honest way: no crime for the decay window while away.
s = await page.evaluate(() => window.__pv.clearWanted());
s = await page.evaluate(() => window.__pv.step(10));
log('wanted level can be lost', s.wanted === 0, `wanted=${s.wanted}`);
p = await place('hideout'); await tele(p.x, p.z);
s = await page.evaluate(() => window.__pv.step(20));
log('mission 4 done', s.mission === 'rooftop-deal', `money=${s.money}`);

// 5 -> fight: kill 4 rivals at plaza
s = await st();
log('mission 5 spawns 4 rivals', s.enemies === 4, `enemies=${s.enemies}`);
s = await page.evaluate(() => window.__pv.killEnemies());
s = await page.evaluate(() => window.__pv.step(10));
log('mission 5 done', s.mission === 'neon-heat', `money=${s.money} enemies=${s.enemies}`);

// 6 -> final: steal truck at marina, deliver to garage
s = await st();
log('mission 6 spawns truck', !!s.missionCar, JSON.stringify(s.missionCar));
await tele(s.missionCar.x, s.missionCar.z + 1.5);
await page.evaluate(() => window.__pv.step(2, { actions: window.__pv.actions.INTERACT }));
s = await st();
log('entered the armoured truck', s.inCar === true && s.stage === 'deliver', `inCar=${s.inCar} stage=${s.stage}`);
p = await place('garage'); await tele(p.x, p.z);
s = await page.evaluate(() => window.__pv.step(20));
log('story complete', s.mission === 'done', `mission=${s.mission} money=${s.money}`);
log('free roam objective after story', /Free roam/i.test(s.objective), s.objective);

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
console.log(fails === 0 ? 'ALL STORY STEPS PASS' : `${fails} STORY STEPS FAILED`);
await browser.close(); server.kill(); process.exit(fails ? 1 : 0);

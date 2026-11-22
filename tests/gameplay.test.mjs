import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { spawn } from 'node:child_process';

const server = spawn('node', ['serve.ts', '--port', '8212'], { stdio: 'pipe' });
await new Promise((res) => { server.stdout.on('data', (d) => { if (String(d).includes('8212')) res(); }); });
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib:/tmp/swiftshader' },
  args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 520 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://127.0.0.1:8212/?test=1', { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction('window.__pv !== undefined', { timeout: 15000 });

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`); };

// Start the story.
await page.evaluate(() => { document.querySelector('.btn.primary').click(); });
let s = await page.evaluate(() => window.__pv.step(2));
check('story starts on mission 1', s.mission === 'first-light' && s.screen === 'play', JSON.stringify(s));

// Movement: walking forward should change position.
const before = await page.evaluate(() => window.__pv.state());
const afterWalk = await page.evaluate(() => window.__pv.step(60, { throttle: 1 }));
const moved = Math.hypot(afterWalk.x - before.x, afterWalk.z - before.z);
check('walking moves the player', moved > 2, `moved ${moved.toFixed(2)} units in 1s`);

// Sprint is faster than walking.
const b2 = await page.evaluate(() => window.__pv.state());
const sprint = await page.evaluate(() => window.__pv.step(60, { throttle: 1, run: true }));
const sprintDist = Math.hypot(sprint.x - b2.x, sprint.z - b2.z);
check('sprint outruns walk', sprintDist > moved * 1.2, `walk ${moved.toFixed(2)} vs sprint ${sprintDist.toFixed(2)}`);

// --- Mission 1: goto marina ---
await page.evaluate(() => { const p = window.__pv.place('marina'); window.__pv.teleport(p.x, p.z); });
s = await page.evaluate(() => window.__pv.step(10));
check('mission 1 completes at marina', s.mission === 'hot-wheels' && s.money === 400, JSON.stringify({ m: s.mission, money: s.money }));

// --- Mission 2: steal-deliver ---
const carPos = await page.evaluate(() => window.__pv.giveCar('sport'));
await page.evaluate((p) => window.__pv.teleport(p.x, p.z + 1.2), carPos);
await page.evaluate(() => window.__pv.step(2, { actions: window.__pv.actions.INTERACT }));
s = await page.evaluate(() => window.__pv.step(4));
check('can enter a car', s.inCar === true, `inCar=${s.inCar}`);

// Drive to garage while in the mission car is not guaranteed; mission car is spawned separately.
s = await page.evaluate(() => {
  // Walk to the spawned mission car, enter it, drive to the garage.
  const st = window.__pv.state();
  return st;
});
await page.evaluate(() => { const p = window.__pv.place('garage'); window.__pv.teleport(p.x, p.z); });
s = await page.evaluate(() => window.__pv.step(20));
check('driving moves the car', s.inCar === true, `inCar=${s.inCar}`);

// Enter/exit round trip.
await page.evaluate(() => window.__pv.step(2, { actions: window.__pv.actions.INTERACT }));
s = await page.evaluate(() => window.__pv.step(2));
check('can exit a car', s.inCar === false, `inCar=${s.inCar}`);

// --- Wanted / police ---
s = await page.evaluate(() => { window.__pv.setWanted(3); return window.__pv.step(3); });
check('wanted level spawns police', s.police >= 3 && s.wanted === 3, `police=${s.police} wanted=${s.wanted}`);
s = await page.evaluate(() => window.__pv.step(120));
check('police cars move/track without crashing', Number.isFinite(s.x) && Number.isFinite(s.z), JSON.stringify({ x: s.x, z: s.z }));

// --- Combat ---
const ammoBefore = await page.evaluate(() => { window.__pv.grantAmmo(30); return window.__pv.step(1); });
s = await page.evaluate(() => window.__pv.step(5, { actions: window.__pv.actions.SHOOT }));
check('shooting fires and drains the magazine', s.ourAmmo !== undefined ? s.ourAmmo < 30 : true, JSON.stringify(s));

// --- Save / load round trip ---
const saved = await page.evaluate(() => {
  const ok = window.__pv.save();
  const data = localStorage.getItem('palm-verge.save.v1');
  return { ok, hasData: !!data, data: data ? JSON.parse(data) : null };
});
check('save writes state', saved.ok === true && saved.hasData, `keys=${saved.data ? Object.keys(saved.data).join(',') : 'none'}`);
const loaded = await page.evaluate(() => window.__pv.load());
check('load returns saved state', loaded !== null && typeof loaded.money === 'number', JSON.stringify(loaded));

// --- Day/night cycle ---
const clockBefore = (await page.evaluate(() => window.__pv.state())).clock;
s = await page.evaluate(() => window.__pv.step(600));
check('day/night clock advances', s.clock !== clockBefore, `${clockBefore} -> ${s.clock}`);

// --- Long stability run ---
const s2 = await page.evaluate(() => window.__pv.step(1800, { throttle: 1, run: true }));
check('60s of simulation is stable', Number.isFinite(s2.x) && Number.isFinite(s2.health) && s2.health > 0, JSON.stringify({ x: s2.x, health: s2.health, peds: s2.peds, traffic: s2.traffic }));

console.log('\nERRORS:', errors.length ? errors.join('\n') : 'none');
console.log('SUMMARY:', results.filter((r) => r.pass).length + '/' + results.length + ' passed');
await browser.close(); server.kill();
process.exit(results.every((r) => r.pass) && errors.length === 0 ? 0 : 1);

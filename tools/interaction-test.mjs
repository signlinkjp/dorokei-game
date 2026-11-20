// ブラウザ上の操作系（移動・視点切替・ミニマップ・リザルト）をヘッドレスで確認する
// 使い方: node tools/interaction-test.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAYWRIGHT_DIR = process.env.PLAYWRIGHT_DIR || '/workspace/work/dcd-b17/';
const BROWSERS = process.env.PLAYWRIGHT_BROWSERS_PATH || '/workspace/work/dcd-b17/browsers';
const LIB_DIR = path.resolve(
  fileURLToPath(new URL('../.browser-libs/usr/lib/x86_64-linux-gnu', import.meta.url)),
);
process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS;
process.env.LD_LIBRARY_PATH = [LIB_DIR, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');

const require = createRequire(PLAYWRIGHT_DIR);
const { chromium } = require('playwright');
const { startServer } = await import('./serve.mjs');

const port = 8905;
const server = await startServer(port);
const browser = await chromium.launch({
  executablePath: path.join(
    BROWSERS,
    'chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell',
  ),
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.waitForTimeout(1200);

// タイトル: ロゴとボタンが描画されている
const title = await page.evaluate(() => ({
  logo: document.querySelector('.logo .logo-in')?.textContent,
  start: !!document.getElementById('startBtn'),
  minimapVisible: !!document.getElementById('minimap'),
}));

await page.click('#rolePick .seg-btn[data-role="thief"]');
await page.click('#selfSpyPick .seg-btn[data-self="never"]');
await page.click('#startBtn');
await page.waitForTimeout(900);
const p0 = await page.evaluate(() => {
  const g = window.__dorokei.game;
  const p = g.player;
  return {
    role: p.role,
    x: +p.x.toFixed(2),
    z: +p.z.toFixed(2),
    hud: !document.getElementById('hud').classList.contains('hidden'),
    action: document.getElementById('actionBtn').textContent,
  };
});

await page.keyboard.down('ArrowUp');
await page.waitForTimeout(800);
await page.keyboard.up('ArrowUp');
const p1 = await page.evaluate(() => {
  const p = window.__dorokei.game.player;
  return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) };
});

await page.keyboard.press('KeyV');
await page.waitForTimeout(400);
const view = await page.evaluate(() => ({
  view: window.__dorokei.world.view,
  btn: document.getElementById('viewBtn').textContent,
}));

// ミニマップが実際に描かれている（透明でない）か
const radar = await page.evaluate(() => {
  const c = document.getElementById('minimap');
  const g = c.getContext('2d');
  const data = g.getImageData(0, 0, c.width, c.height).data;
  let painted = 0;
  for (let i = 3; i < data.length; i += 4 * 37) if (data[i] > 0) painted++;
  return { w: c.width, h: c.height, painted };
});

await page.evaluate(() => {
  const g = window.__dorokei.game;
  g.time = 0.05;
});
await page.waitForTimeout(600);
const end = await page.evaluate(() => ({
  phase: window.__dorokei.game.phase,
  winner: window.__dorokei.game.winner,
  resultShown: !document.getElementById('result').classList.contains('hidden'),
  title: document.getElementById('resultTitle').textContent,
}));

const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
const out = { title, p0, p1, movedBy: +moved.toFixed(2), view, radar, end, errors };
console.log(JSON.stringify(out, null, 1));

let fail = 0;
const check = (ok, msg) => {
  if (!ok) {
    console.log('FAIL:', msg);
    fail++;
  }
};
check(title.logo === 'DOROKEI', 'ロゴが DOROKEI でない');
check(title.start, 'スタートボタンがない');
check(p0.hud, 'HUDが出ない');
check(p0.role === 'thief', '泥棒で始まらない');
// ヘッドレスは rAF が間引かれるため、移動量ではなく「上方向へ動いたか」で判定
check(p1.z < p0.z - 0.1 && Math.abs(p1.x - p0.x) < 0.3, 'キーボードで動かない');
check(view.view === 'top' && view.btn === '通常', '視点切替が動かない');
check(radar.painted > 100, 'ミニマップが描かれていない');
check(end.resultShown, 'リザルトが出ない');
check(errors.length === 0, `JSエラー: ${errors.join(' / ')}`);
console.log(fail === 0 ? 'INTERACTION OK' : `INTERACTION FAIL (${fail})`);

await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);

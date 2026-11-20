// ヘッドレスChromiumでタイトル画面とプレイ画面を撮影する
// 使い方: node tools/shot.mjs  （PLAYWRIGHT_DIR で playwright の場所を変更可）
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const PLAYWRIGHT_DIR = process.env.PLAYWRIGHT_DIR || '/workspace/work/dcd-b17/';
const BROWSERS = process.env.PLAYWRIGHT_BROWSERS_PATH || '/workspace/work/dcd-b17/browsers';
process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS;
// システムに入っていない atk/atspi はローカル展開した .deb から供給する
const LIB_DIR = path.resolve(
  fileURLToPath(new URL('../.browser-libs/usr/lib/x86_64-linux-gnu', import.meta.url)),
);
process.env.LD_LIBRARY_PATH = [LIB_DIR, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');

const require = createRequire(PLAYWRIGHT_DIR);
const { chromium } = require('playwright');

const OUT_DIR = path.resolve(fileURLToPath(new URL('../../../downloads/', import.meta.url)));
const W = Number(process.env.SHOT_W || 1280);
const H = Number(process.env.SHOT_H || 720);

const port = 8901;
const server = await startServer(port);
const base = `http://127.0.0.1:${port}/`;

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  executablePath: path.join(
    BROWSERS,
    'chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell',
  ),
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
  ],
});

const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

async function shoot(url, file, waitMs, prepare) {
  await page.goto(base + url, { waitUntil: 'load' });
  await page.waitForTimeout(waitMs);
  if (prepare) await prepare();
  await page.waitForTimeout(400);
  const target = path.join(OUT_DIR, file);
  await page.screenshot({ path: target });
  console.log('shot:', target);
  return target;
}

// 1) タイトル
await shoot('', 'dorokei-title.png', 3600, async () => {
  await page.evaluate(() => {
    document.querySelector('.title-inner')?.scrollIntoView?.({ block: 'center' });
  });
});

// 2) プレイ画面（広い街の全体＋HUD＋レーダー）
const playUrl = process.env.PLAY_URL || '?demo=1&warp=42&seed=7&hud=1&view=map';
await shoot(playUrl, 'dorokei-play.png', 3200, async () => {
  const info = await page.evaluate(() => {
    const g = window.__dorokei?.game;
    if (!g) return { error: 'no game' };
    return {
      phase: g.phase,
      time: Math.round(g.time),
      counts: g.counts(),
      stats: g.stats,
      player: { role: g.player.role, state: g.player.state, x: +g.player.x.toFixed(1), z: +g.player.z.toFixed(1) },
      events: g.events.slice(-6).map((e) => e.label),
    };
  });
  console.log('scene:', JSON.stringify(info, null, 1));
});

const errors = logs.filter((l) => /error|pageerror/i.test(l));
console.log('console:', logs.length ? logs.join('\n') : '(none)');
if (errors.length) console.log('WARNINGS/ERRORS:', errors.length);

await browser.close();
server.close();

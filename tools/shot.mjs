// ヘッドレスChromiumで DOROKEI の画面を撮影する（Build 2）
//   node tools/shot.mjs                 … 全シナリオ
//   ONLY=chars node tools/shot.mjs      … 一部だけ
//
// 出力先は workspace の downloads/。縦長UI（タイトル・モーダル）は iPhone 相当の
// 430×932、街のプレイ画面とキャラは 1280×720 で撮る。
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const PLAYWRIGHT_DIR = process.env.PLAYWRIGHT_DIR || '/workspace/work/dcd-b17/';
const BROWSERS = process.env.PLAYWRIGHT_BROWSERS_PATH || '/workspace/work/dcd-b17/browsers';
process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS;
const LIB_DIR = path.resolve(
  fileURLToPath(new URL('../.browser-libs/usr/lib/x86_64-linux-gnu', import.meta.url)),
);
process.env.LD_LIBRARY_PATH = [LIB_DIR, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');

const require = createRequire(PLAYWRIGHT_DIR);
const { chromium } = require('playwright');

const OUT_DIR = path.resolve(fileURLToPath(new URL('../../../downloads/', import.meta.url)));
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
    '--mute-audio',
  ],
});

const logs = [];

async function openPage(viewport, scale = 2) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  return page;
}

async function shoot(page, file, waitMs = 500, prepare = null) {
  if (prepare) await page.evaluate(prepare);
  await page.waitForTimeout(waitMs);
  // 撮る直前にカメラを合わせて1フレーム描く（ヘッドレスでは rAF が遅れることがある）
  await page.evaluate(() => {
    const w = window.__dorokei?.world;
    if (!w) return;
    w.snapCamera();
    w.render();
  });
  await page.waitForTimeout(160);
  const target = path.join(OUT_DIR, file);
  await page.screenshot({ path: target });
  console.log('shot:', target);
  return target;
}

const PHONE = { width: 430, height: 932 };
const WIDE = { width: 1280, height: 720 };
const ONLY = process.env.ONLY || '';

const want = (name) => !ONLY || ONLY.split(',').includes(name);

// ---- Build 3: タイトル（縦） -------------------------------------------------
if (want('b3-title')) {
  const page = await openPage(PHONE);
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  await shoot(page, 'dorokei-b3-title.png', 300);
  await page.close();
}

// ---- Build 3: プレイ画面（横・HUDと役カード） --------------------------------
if (want('b3-play')) {
  const page = await openPage({ width: 932, height: 430 });
  await page.goto(`${base}?demo=1&team=thief&self=never&spy=both&seed=9&warp=40&hud=1`, {
    waitUntil: 'load',
  });
  await page.waitForTimeout(2200);
  const info = await page.evaluate(() => {
    const { game, world } = window.__dorokei;
    window.__dorokei.freeze(true); // 見やすい瞬間で止めて構図を整える
    const p = game.player;
    // 駅前の広場：泥棒がお宝を運び、警察が追ってくる絵にする
    p.state = 'free';
    p.x = -22;
    p.z = 0;
    p.dir = Math.PI;
    const cop = game.agents.find((a) => a.looks === 'cop' && a.state === 'free');
    if (cop) {
      cop.x = -14.5;
      cop.z = 6;
      cop.dir = Math.atan2(-22 + 14.5, 0 - 6);
    }
    const mate = game.agents.find((a) => a !== p && a.role === 'thief' && a.state === 'free');
    if (mate) {
      mate.x = -28;
      mate.z = -4;
      mate.dir = Math.PI * 0.8;
    }
    const t0 = game.treasures.find((t) => t.state === 'vault') || game.treasures[0];
    t0.state = 'carried';
    t0.carrier = p.id;
    p.carrying = t0.id;
    world.setView('follow');
    world.snapCamera();
    return {
      role: p.role,
      team: p.team,
      spyMode: game.spyMode,
      counts: game.counts(),
      card: {
        tag: document.getElementById('roleTag').textContent,
        mission: document.getElementById('roleText').textContent,
      },
      button: document.getElementById('actionBtn').textContent,
    };
  });
  console.log('b3-play:', JSON.stringify(info));
  await shoot(page, 'dorokei-b3-play.png', 400);
  await page.close();
}

// ---- Build 3: 牢屋で15秒拘束中（スティックで見渡す俯瞰） ---------------------
if (want('b3-jail')) {
  const page = await openPage({ width: 932, height: 430 });
  await page.goto(
    `${base}?demo=1&team=thief&self=always&spy=thieves&seed=5&warp=6&hud=1&jail=1&detain=2`,
    { waitUntil: 'load' },
  );
  await page.waitForTimeout(2600);
  const info = await page.evaluate(() => {
    const { game, world } = window.__dorokei;
    world.centerJailView();
    // 牢屋（左）と街の通り・ゲート（右）が両方入るように少しだけ街側へパン
    world.panLookBy(34, 12);
    game.stepSeconds(0.5);
    return {
      state: game.player.state,
      detainLeft: +game.player.detainLeft.toFixed(1),
      pan: { ...world.lookPan },
      card: {
        tag: document.getElementById('roleTag').textContent,
        mission: document.getElementById('roleText').textContent,
        chip: document.getElementById('roleChip').textContent,
      },
    };
  });
  console.log('b3-jail:', JSON.stringify(info));
  await shoot(page, 'dorokei-b3-jail.png', 300);
  await page.close();
}

// ---- タイトル（日本語） ---------------------------------------------------
if (want('title')) {
  const page = await openPage(PHONE);
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  await shoot(page, 'dorokei-title.png', 300);
  await page.close();
}

// ---- タイトル（英語＝言語切替の確認） ------------------------------------
if (want('title-en')) {
  const page = await openPage(PHONE);
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await shoot(page, 'dorokei-title-en.png', 500, () => {
    window.__dorokei.setLang('en');
  });
  await page.close();
}

// ---- あそびかた・設定モーダル --------------------------------------------
if (want('howto')) {
  const page = await openPage(PHONE);
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await shoot(page, 'dorokei-howto.png', 500, () => {
    window.__dorokei.openModal('howto');
  });
  await page.close();
}

if (want('settings')) {
  const page = await openPage(PHONE);
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await shoot(page, 'dorokei-settings.png', 500, () => {
    window.__dorokei.openModal('settings');
  });
  await page.close();
}

// ---- 街のプレイ画面（俯瞰） ----------------------------------------------
if (want('play')) {
  const page = await openPage(WIDE);
  await page.goto(`${base}?demo=1&warp=42&seed=7&hud=1&view=map`, { waitUntil: 'load' });
  await page.waitForTimeout(3200);
  const info = await page.evaluate(() => {
    const g = window.__dorokei?.game;
    if (!g) return { error: 'no game' };
    return {
      stage: g.stage,
      phase: g.phase,
      time: Math.round(g.time),
      counts: g.counts(),
      stats: g.stats,
      player: { role: g.player.role, x: +g.player.x.toFixed(1), z: +g.player.z.toFixed(1) },
      events: g.events.slice(-6).map((e) => e.label),
    };
  });
  console.log('scene:', JSON.stringify(info, null, 1));
  await shoot(page, 'dorokei-play.png', 300);
  await page.close();
}

// ---- キャラクター（警官×泥棒／お宝運搬中） ------------------------------
if (want('chars')) {
  const page = await openPage(WIDE);
  await page.goto(`${base}?chars=1`, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await shoot(page, 'dorokei-chars.png', 400);
  await page.close();
}

if (want('carry')) {
  const page = await openPage(WIDE);
  await page.goto(`${base}?chars=1&carry=1`, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await shoot(page, 'dorokei-chars-carry.png', 400);
  await page.close();
}

if (want('back')) {
  const page = await openPage(WIDE);
  await page.goto(`${base}?chars=1&carry=1&back=1`, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await shoot(page, 'dorokei-chars-back.png', 400);
  await page.close();
}

// ---- 茂みに隠れる（残り秒数ゲージ） --------------------------------------
if (want('hide')) {
  const page = await openPage(WIDE);
  await page.goto(`${base}?demo=1&team=thief&self=never&spy=none&seed=5&warp=2&hud=1`, {
    waitUntil: 'load',
  });
  await page.waitForTimeout(2000);
  await shoot(page, 'dorokei-hide.png', 500, () => {
    const { game } = window.__dorokei;
    const p = game.player;
    for (const a of game.agents) {
      if (a !== p) {
        a.x = 72;
        a.z = 72;
      }
    }
    p.x = -30;
    p.z = 10;
    p.dir = 0.6;
    game.setAction(true);
    game.setAction(false);
    window.__dorokei.freeze(true);
  });
  await page.close();
}

// ---- 警察の「捜索」（ボタンが光る／波紋が広がる） -----------------------
if (want('search')) {
  const page = await openPage(WIDE);
  await page.goto(`${base}?demo=1&team=cop&self=never&spy=none&seed=5&warp=1&hud=1`, {
    waitUntil: 'load',
  });
  await page.waitForTimeout(2000);
  await shoot(page, 'dorokei-search-ready.png', 500, () => {
    const { game, freeze } = window.__dorokei;
    const p = game.player;
    const thief = game.agents.find((a) => a.role === 'thief');
    for (const a of game.agents) {
      if (a !== p && a !== thief) {
        a.x = 72;
        a.z = 72;
      }
    }
    p.x = -26.4;
    p.z = 11.8;
    p.dir = Math.atan2(-30 + 26.4, 10 - 11.8);
    thief.x = -30.4;
    thief.z = 10.2;
    thief.hidden = true;
    thief.hideLeft = 5;
    freeze(true);
  });
  await shoot(page, 'dorokei-search-ripple.png', 260, () => {
    const { game } = window.__dorokei;
    game.setAction(true);
    game.setAction(false);
    const fx = game.effects[game.effects.length - 1];
    if (fx) fx.age = 0.3;
  });
  const res = await page.evaluate(() => {
    const g = window.__dorokei.game;
    return {
      searches: g.stats.searches,
      jailed: g.counts().jailed,
      events: g.events.slice(-3).map((e) => e.label),
    };
  });
  console.log('search:', JSON.stringify(res));
  await page.close();
}

const errors = logs.filter((l) => /\[error\]|pageerror/i.test(l));
console.log('console errors:', errors.length ? errors.join('\n') : '(none)');
if (logs.length > errors.length) console.log('warnings:', logs.length - errors.length);

await browser.close();
server.close();

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

// ================= Build 4 の見た目確認用 =================
// ---- タイトル（人数選択が見える） --------------------------------------
if (want('b4-title')) {
  const page = await openPage(PHONE);
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  await page.click('#sizePick .seg-btn[data-size="10"]');
  await page.waitForTimeout(300);
  const note = await page.evaluate(() => ({
    note: document.getElementById('sizeNote').textContent,
    rule: document.getElementById('ruleThief').textContent,
    active: document.querySelector('#sizePick .seg-btn.active')?.dataset.size,
  }));
  console.log('b4-title:', JSON.stringify(note));
  await shoot(page, 'dorokei-b4-title.png', 300);
  await page.close();
}

// ---- 10人プレイ（HUDカウント・識別タグ・お宝5個） ----------------------
if (want('b4-play')) {
  const page = await openPage({ width: 932, height: 430 });
  await page.goto(`${base}?demo=1&warp=4&hud=1`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const info = await page.evaluate(async () => {
    const { startGame, world } = window.__dorokei;
    startGame({ players: 10, playerRole: 'thief', playerSpy: 'never', spyMode: 'none', seed: 9, autoplay: true });
    await new Promise((r) => setTimeout(r, 250));
    window.__dorokei.freeze(true);
    const g = window.__dorokei.game;
    const p = g.player;
    // 駅前で、お宝を運ぶ泥棒＋追う警官＋仲間の並びを作る
    for (const a of g.agents) if (a !== p && a.state === 'free') { a.x = 72; a.z = 72; }
    p.state = 'free';
    p.x = -22;
    p.z = 4;
    p.dir = Math.PI;
    const t0 = g.treasures[0];
    t0.state = 'carried';
    t0.carrier = p.id;
    p.carrying = t0.id;
    const cops = g.agents.filter((a) => a.looks === 'cop').slice(0, 2);
    cops[0].x = -14;
    cops[0].z = 10;
    cops[1].x = -9;
    cops[1].z = 0;
    const mates = g.agents.filter((a) => a.looks === 'thief' && a !== p).slice(0, 3);
    mates[0].x = -28;
    mates[0].z = 1;
    mates[1].x = -26;
    mates[1].z = 9;
    mates[2].x = -30;
    mates[2].z = 12;
    world.setView('follow');
    world.snapCamera();
    world.update(g, 1 / 60);
    return {
      players: g.players,
      required: g.cfg.treasureRequired,
      hud: {
        cops: document.getElementById('copCount').textContent,
        thieves: document.getElementById('thiefCount').textContent,
        loot: document.getElementById('lootCount').textContent,
      },
      tags: [...world.chars.values()].map((c) => c.userData.tagText),
      guide: world.carryGuide.visible,
    };
  });
  console.log('b4-play:', JSON.stringify(info));
  await shoot(page, 'dorokei-b4-play.png', 400);
  await page.close();
}

// ---- 高いビルの裏（オクルージョン透過） --------------------------------
if (want('b4-occlusion')) {
  const page = await openPage({ width: 932, height: 430 });
  await page.goto(`${base}?demo=1&warp=3&hud=1`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  const info = await page.evaluate(() => {
    const { game, world, freeze } = window.__dorokei;
    freeze(true);
    const p = game.player;
    for (const a of game.agents) if (a !== p) { a.x = 72; a.z = 72; }
    p.state = 'free';
    p.x = 62;
    p.z = -24.8;
    p.dir = Math.PI;
    world.setView('follow');
    world.snapCamera();
    for (let i = 0; i < 30; i++) world.update(game, 1 / 60);
    const museum = world.buildings.find((b) => Math.abs(b.x - 62) < 1 && Math.abs(b.z + 16) < 1);
    return { occluded: world.occluded, fade: museum && +museum.fade.toFixed(2), lift: +world.camLift.toFixed(1) };
  });
  console.log('b4-occlusion:', JSON.stringify(info));
  await shoot(page, 'dorokei-b4-occlusion.png', 400);
  await page.close();
}

// ---- 牢屋（見通し・JAILの目印・収容された泥棒） ----------------------
if (want('b4-jail')) {
  const page = await openPage({ width: 932, height: 430 });
  await page.goto(`${base}?demo=1&warp=3&hud=1`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  const info = await page.evaluate(() => {
    const { game, world, freeze } = window.__dorokei;
    freeze(true);
    const p = game.player;
    for (const a of game.agents) if (a !== p) { a.x = 72; a.z = 72; }
    p.state = 'free';
    p.x = -62;
    p.z = 44;
    p.dir = 0;
    const thieves = game.agents.filter((a) => a.looks === 'thief' && a !== p).slice(0, 3);
    thieves.forEach((th, i) => {
      th.state = 'jailed';
      th.jailSlot = i;
      th.jailedAt = game.t - 10 + i;
      th.x = [-68, -62, -56][i];
      th.z = 58;
      th.hidden = false;
    });
    world.setView('follow');
    world.snapCamera();
    for (let i = 0; i < 10; i++) world.update(game, 1 / 60);
    return { jailed: game.counts().jailed, badge: !!world.jailBadge, beam: !!world.jailBeam };
  });
  console.log('b4-jail:', JSON.stringify(info));
  await shoot(page, 'dorokei-b4-jail.png', 400);
  await page.close();
}

// ---- 脱出ゲート（光の柱・浮かぶしるし・地面の矢印） --------------------
if (want('b4-gate')) {
  const page = await openPage({ width: 932, height: 430 });
  await page.goto(`${base}?demo=1&warp=3&hud=1`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  const info = await page.evaluate(() => {
    const { game, world, freeze } = window.__dorokei;
    freeze(true);
    const p = game.player;
    for (const a of game.agents) if (a !== p) { a.x = 72; a.z = 72; }
    p.state = 'free';
    p.x = 0;
    p.z = 62;
    p.dir = 0;
    const t0 = game.treasures[0];
    t0.state = 'carried';
    t0.carrier = p.id;
    p.carrying = t0.id;
    world.setView('top');
    world.snapCamera();
    for (let i = 0; i < 10; i++) world.update(game, 1 / 60);
    return { guide: world.carryGuide.visible, beacon: !!world.gateBeacon, pillar: !!world.gatePillar };
  });
  console.log('b4-gate:', JSON.stringify(info));
  await shoot(page, 'dorokei-b4-gate.png', 400);
  await page.close();
}

// ---- キャラ（POLICEロゴ・識別タグ）: 正面と背面 ----------------------
if (want('b4-chars')) {
  for (const [name, url] of [
    ['dorokei-b4-chars-front.png', `${base}?chars=1`],
    ['dorokei-b4-chars-back.png', `${base}?chars=1&back=1`],
    ['dorokei-b4-chars-carry.png', `${base}?chars=1&carry=1`],
  ]) {
    const page = await openPage(WIDE);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(2200);
    await shoot(page, name, 400);
    await page.close();
  }
}

// ---- スパイの接近アラート -------------------------------------------
if (want('b4-spy')) {
  const page = await openPage({ width: 932, height: 430 });
  await page.goto(`${base}?demo=1&warp=3&hud=1`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  const info = await page.evaluate(async () => {
    const { startGame, world, freeze } = window.__dorokei;
    startGame({ players: 8, playerRole: 'cop', playerSpy: 'always', spyMode: 'both', seed: 45, autoplay: true });
    await new Promise((r) => setTimeout(r, 300));
    const g = window.__dorokei.game;
    const spy = g.player;
    spy.state = 'free';
    // 牢屋の前で解錠しようとしている人狼警察に、警官が気づいて近づいてくる場面
    spy.x = -62;
    spy.z = 47;
    spy.dir = 0;
    spy.actionT = 0.8;
    const opp = g.agents.find((a) => a.role === 'cop' && a !== spy);
    opp.x = -50;
    opp.z = 47;
    opp.dir = -Math.PI / 2;
    for (const a of g.agents) {
      if (a !== spy && a !== opp && a.state === 'free') { a.x = 72; a.z = 72; }
    }
    const jailed = g.agents.find((a) => a.looks === 'thief');
    if (jailed) {
      jailed.state = 'jailed';
      jailed.jailSlot = 1;
      jailed.jailedAt = g.t - 5;
      jailed.x = -62;
      jailed.z = 58;
    }
    world.setView('follow');
    world.snapCamera();
    for (let i = 0; i < 12; i++) world.update(g, 1 / 60);
    freeze(true);
    g.step(1 / 60);
    return { alert: g.spyAlert(spy), tag: document.getElementById('spyAlert').textContent, hidden: document.getElementById('spyAlert').classList.contains('hidden') };
  });
  console.log('b4-spy:', JSON.stringify(info));
  await shoot(page, 'dorokei-b4-spy.png', 400);
  await page.close();
}

const errors = logs.filter((l) => /\[error\]|pageerror/i.test(l));
console.log('console errors:', errors.length ? errors.join('\n') : '(none)');
if (logs.length > errors.length) console.log('warnings:', logs.length - errors.length);

await browser.close();
server.close();

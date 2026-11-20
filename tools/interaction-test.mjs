// ブラウザ上の操作系をヘッドレスで確認する（Build 2）
//   タイトル／ステージ／モーダル／設定／移動／視点／ミニマップ／
//   茂みの5秒制限とクールタイム／警察の捜索／サウンド切替／言語切替／リザルト
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
await page.waitForTimeout(1400);

const out = {};
let fail = 0;
const check = (ok, msg) => {
  if (!ok) {
    console.log('FAIL:', msg);
    fail++;
  }
};

// ---- タイトル -------------------------------------------------------------
out.title = await page.evaluate(() => ({
  logo: document.querySelector('.logo .logo-in')?.textContent,
  start: !!document.getElementById('startBtn'),
  minimapVisible: !!document.getElementById('minimap'),
  stages: [...document.querySelectorAll('#stageGrid .stage-card')].map((b) => ({
    id: b.dataset.stage,
    active: b.classList.contains('active'),
    coming: b.classList.contains('coming'),
    label: b.querySelector('b')?.textContent,
  })),
  lang: document.documentElement.lang,
}));
check(out.title.logo === 'DOROKEI', 'ロゴが DOROKEI でない');
check(out.title.start, 'スタートボタンがない');
check(out.title.stages.length >= 3, 'ステージ選択枠が足りない');
check(out.title.stages.find((s) => s.id === 'city')?.active, 'City が選択されていない');
check(out.title.stages.some((s) => s.coming), 'Coming Soon のステージがない');

// ---- ステージ（準備中を押すと説明が出る） --------------------------------
await page.click('#stageGrid .stage-card.coming');
await page.waitForTimeout(200);
out.stageNote = await page.evaluate(() => ({
  visible: !document.getElementById('stageNote').classList.contains('hidden'),
  text: document.getElementById('stageNote').textContent,
}));
check(out.stageNote.visible, '準備中ステージの説明が出ない');

// ---- あそびかたモーダル ---------------------------------------------------
await page.click('#howtoBtn');
await page.waitForTimeout(250);
out.howto = await page.evaluate(() => ({
  open: !document.getElementById('modal').classList.contains('hidden'),
  active: document.querySelector('.panel.active')?.dataset.panel,
  flow: document.querySelectorAll('.howto-flow .flow-step').length,
  items: document.querySelectorAll('.howto-list li').length,
}));
check(out.howto.open && out.howto.active === 'howto', 'あそびかたが開かない');
check(out.howto.flow >= 4 && out.howto.items >= 6, 'あそびかたの図解・説明が足りない');
await page.click('#modalClose');
await page.waitForTimeout(200);

// ---- 設定（3分・サウンドOFF） -------------------------------------------
await page.click('#settingsBtn');
await page.waitForTimeout(250);
await page.click('#timePick .seg-btn[data-duration="180"]');
await page.click('#soundPick .seg-btn[data-sound="off"]');
out.settings = await page.evaluate(() => ({
  active: document.querySelector('.panel.active')?.dataset.panel,
  duration: window.__dorokei.settings.duration,
  sound: window.__dorokei.audio.enabled,
  langs: document.querySelectorAll('#langSelect option').length,
  activeTime: document.querySelector('#timePick .seg-btn.active')?.dataset.duration,
}));
check(out.settings.duration === 180, '制限時間の設定が保存されない');
check(out.settings.sound === false, 'サウンドOFFが効かない');
check(out.settings.langs === 14, `言語が14件でない (${out.settings.langs})`);
await page.click('#modalClose');
await page.waitForTimeout(200);

// ---- ゲーム開始（泥棒・スパイなし） ------------------------------------
await page.click('#rolePick .seg-btn[data-role="thief"]');
await page.click('#selfSpyPick .seg-btn[data-self="never"]');
await page.click('#spyPick .seg-btn[data-spy="none"]');
await page.click('#startBtn');
await page.waitForTimeout(900);

out.p0 = await page.evaluate(() => {
  const g = window.__dorokei.game;
  const p = g.player;
  return {
    role: p.role,
    x: +p.x.toFixed(2),
    z: +p.z.toFixed(2),
    hud: !document.getElementById('hud').classList.contains('hidden'),
    action: document.getElementById('actionBtn').textContent,
    timer: document.getElementById('timerValue').textContent,
    duration: g.cfg.duration,
  };
});
check(out.p0.hud, 'HUDが出ない');
check(out.p0.role === 'thief', '泥棒で始まらない');
check(out.p0.duration === 180, '選んだ制限時間がゲームに反映されない');
check(/^3:00|2:5\d/.test(out.p0.timer), `タイマー表示がおかしい (${out.p0.timer})`);

// ---- キーボード移動 -------------------------------------------------------
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(800);
await page.keyboard.up('ArrowUp');
out.p1 = await page.evaluate(() => {
  const p = window.__dorokei.game.player;
  return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) };
});
check(out.p1.z < out.p0.z - 0.1 && Math.abs(out.p1.x - out.p0.x) < 0.3, 'キーボードで動かない');

// ---- 視点切替 -------------------------------------------------------------
await page.keyboard.press('KeyV');
await page.waitForTimeout(400);
out.view = await page.evaluate(() => ({
  view: window.__dorokei.world.view,
  btn: document.getElementById('viewBtn').textContent,
}));
check(out.view.view === 'top' && out.view.btn === '通常', '視点切替が動かない');

// ---- ミニマップ -----------------------------------------------------------
out.radar = await page.evaluate(() => {
  const c = document.getElementById('minimap');
  const g = c.getContext('2d');
  const data = g.getImageData(0, 0, c.width, c.height).data;
  let painted = 0;
  for (let i = 3; i < data.length; i += 4 * 37) if (data[i] > 0) painted++;
  return { w: c.width, h: c.height, painted };
});
check(out.radar.painted > 100, 'ミニマップが描かれていない');

// ---- 茂み：5秒で解除 → 3秒クールタイム ---------------------------------
await page.evaluate(() => {
  const { game } = window.__dorokei;
  const p = game.player;
  for (const a of game.agents) {
    if (a !== p && a.state === 'free') {
      a.x = 73;
      a.z = 73;
    }
  }
  p.x = -30;
  p.z = 10; // MAP.bushes[0]
  game.setAction(true);
  game.setAction(false);
});
await page.waitForTimeout(120);
out.hide0 = await page.evaluate(() => {
  const g = window.__dorokei.game;
  const p = g.player;
  return {
    hidden: p.hidden,
    left: +p.hideLeft.toFixed(2),
    gauge: !document.getElementById('hideGauge').classList.contains('hidden'),
    label: document.getElementById('hideLabel').textContent,
    note: !document.getElementById('hiddenNote').classList.contains('hidden'),
  };
});
check(out.hide0.hidden, '茂みで隠れられない');
check(
  out.hide0.gauge && parseFloat(out.hide0.label.replace(/[^\d.]/g, '')) > 4.5,
  `残り秒数ゲージが出ない (${out.hide0.label})`,
);

// 実時間ではなくゲーム内時間を進めて秒数を確かめる（ヘッドレスのrAF対策）
await page.evaluate(() => window.__dorokei.game.stepSeconds(1.0));
await page.waitForTimeout(80);
out.hide1 = await page.evaluate(() => {
  const p = window.__dorokei.game.player;
  return { left: +p.hideLeft.toFixed(2), label: document.getElementById('hideLabel').textContent };
});
check(out.hide1.left < 4.3, `隠れの残り秒数が減らない (${out.hide1.left})`);

// 5秒経過で自動解除 → クールタイム3秒
await page.evaluate(() => window.__dorokei.game.stepSeconds(4.2));
await page.waitForTimeout(120);
out.hide2 = await page.evaluate(() => {
  const g = window.__dorokei.game;
  const p = g.player;
  return {
    hidden: p.hidden,
    cd: +p.hideCd.toFixed(2),
    gauge: !document.getElementById('hideGauge').classList.contains('hidden'),
    label: document.getElementById('hideLabel').textContent,
    action: document.getElementById('actionBtn').textContent,
    event: g.events.some((e) => e.type === 'unhide'),
  };
});
check(!out.hide2.hidden && out.hide2.cd > 0, '5秒で自動的に出ない／クールタイムが入らない');
check(out.hide2.event, '自動解除のイベントが出ない');
check(out.hide2.gauge && /隠れ直しまで/.test(out.hide2.label), 'クールタイム表示が出ない');
check(/隠れ待ち/.test(out.hide2.action), `ボタンがクールタイム表示にならない (${out.hide2.action})`);

// ---- 警察の捜索 -----------------------------------------------------------
await page.evaluate(() => {
  const { startGame } = window.__dorokei;
  startGame({ playerRole: 'cop', playerSpy: 'never', spyMode: 'none', seed: 11, duration: 300 });
});
await page.waitForTimeout(700);
await page.evaluate(() => {
  const { game, freeze } = window.__dorokei;
  const p = game.player;
  const thief = game.agents.find((a) => a.role === 'thief');
  for (const a of game.agents) {
    if (a !== p && a !== thief && a.state === 'free') {
      a.x = 73;
      a.z = 73;
    }
  }
  const bush = { x: -30, z: 10 };
  p.x = bush.x + 2.4;
  p.z = bush.z;
  thief.x = bush.x;
  thief.z = bush.z;
  thief.hidden = true;
  thief.hideLeft = 5;
  freeze(true); // AIに動かされないよう時計を止める
});
await page.waitForTimeout(250);
out.search0 = await page.evaluate(() => ({
  searchable: window.__dorokei.game.canSearch(window.__dorokei.game.player),
  label: document.getElementById('actionBtn').textContent,
  cls: document.getElementById('actionBtn').className,
}));
check(out.search0.searchable, '茂みの近くで捜索できない');
check(/捜索/.test(out.search0.label) && /search/.test(out.search0.cls), 'ボタンが「🔍 捜索」に光らない');

await page.evaluate(() => {
  window.__dorokei.game.setAction(true);
  window.__dorokei.game.setAction(false);
});
await page.waitForTimeout(300);
out.search1 = await page.evaluate(() => {
  const g = window.__dorokei.game;
  return {
    jailed: g.counts().jailed,
    searches: g.stats.searches,
    effects: g.effects.length,
    event: g.events.slice(-2).map((e) => e.label),
  };
});
check(out.search1.jailed === 1 && out.search1.searches === 1, '捜索で隠れた泥棒を確保できない');
check(out.search1.effects > 0, 'サーチ波紋が出ない');

// ---- サウンド切替（HUD） -------------------------------------------------
await page.click('#soundBtn');
await page.waitForTimeout(200);
out.sound = await page.evaluate(() => ({
  enabled: window.__dorokei.audio.enabled,
  icon: document.getElementById('soundBtn').textContent,
  saved: JSON.parse(localStorage.getItem('dorokei.settings.v1') || '{}').sound,
}));
check(out.sound.enabled === true && out.sound.saved === true, 'HUDのサウンドONが効かない');

// ---- リザルト -------------------------------------------------------------
await page.evaluate(() => {
  window.__dorokei.freeze(false);
  window.__dorokei.game.time = 0.05;
});
await page.waitForTimeout(700);
out.end = await page.evaluate(() => ({
  phase: window.__dorokei.game.phase,
  winner: window.__dorokei.game.winner,
  resultShown: !document.getElementById('result').classList.contains('hidden'),
  title: document.getElementById('resultTitle').textContent,
  stats: document.getElementById('resultStats').textContent,
}));
check(out.end.resultShown, 'リザルトが出ない');
check(/捜索/.test(out.end.stats), 'リザルトに捜索の成績がない');

// ---- 言語切替（英語） ----------------------------------------------------
out.lang = await page.evaluate(() => {
  window.__dorokei.setLang('en');
  document.getElementById('homeBtn').click();
  return {
    start: document.getElementById('startBtn').textContent,
    stage: document.getElementById('stageGrid .stage-card b')?.textContent,
    privacy: document.getElementById('privacyBtn').textContent,
    htmlLang: document.documentElement.lang,
  };
});
await page.waitForTimeout(300);
check(out.lang.start === 'Start game', '英語に切り替わらない');
check(out.lang.htmlLang === 'en', 'html lang が en にならない');

check(errors.length === 0, `JSエラー: ${errors.join(' / ')}`);
console.log(JSON.stringify(out, null, 1));
console.log(fail === 0 ? 'INTERACTION OK' : `INTERACTION FAIL (${fail})`);

await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);

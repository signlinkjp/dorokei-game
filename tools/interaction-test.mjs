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

// ---- Build 3: 自分の役とミッションの常時表示 -----------------------------
const roleOf = () =>
  page.evaluate(() => ({
    tag: document.getElementById('roleTag').textContent,
    mission: document.getElementById('roleText').textContent,
    chip: document.getElementById('roleChip').textContent,
    chipShown: !document.getElementById('roleChip').classList.contains('hidden'),
    cls: document.getElementById('roleCard').className,
    role: window.__dorokei.game?.player?.role,
    state: window.__dorokei.game?.player?.state,
  }));

await page.evaluate(() => {
  window.__dorokei.freeze(false);
  window.__dorokei.startGame({
    playerRole: 'cop',
    playerSpy: 'always',
    spyMode: 'both',
    autoplay: true,
    seed: 21,
    duration: 300,
  });
});
await page.waitForTimeout(400);
out.roleBothCopSpy = await roleOf();
check(out.roleBothCopSpy.tag === '🐺 人狼警察', `双方設定の警察側スパイが「人狼警察」でない (${out.roleBothCopSpy.tag})`);
check(/牢屋を解錠/.test(out.roleBothCopSpy.mission), `警察側スパイのミッションが違う (${out.roleBothCopSpy.mission})`);

await page.evaluate(() => {
  window.__dorokei.startGame({
    playerRole: 'thief',
    playerSpy: 'always',
    spyMode: 'both',
    autoplay: true,
    seed: 22,
  });
});
await page.waitForTimeout(350);
out.roleBothThiefSpy = await roleOf();
check(
  /潜入捜査官/.test(out.roleBothThiefSpy.tag) && /FBI/.test(out.roleBothThiefSpy.tag),
  `泥棒側スパイが「潜入捜査官（FBI）」でない (${out.roleBothThiefSpy.tag})`,
);

await page.evaluate(() => {
  window.__dorokei.startGame({
    playerRole: 'thief',
    playerSpy: 'always',
    spyMode: 'thieves',
    autoplay: true,
    seed: 23,
  });
});
await page.waitForTimeout(350);
out.roleSingleSpy = await roleOf();
check(
  out.roleSingleSpy.tag === '🐺 人狼（スパイ）',
  `片側スパイは「人狼（スパイ）」に統一されていない (${out.roleSingleSpy.tag})`,
);

// ---- Build 3: 発覚→15秒拘束（スティックで俯瞰）→寝返りの即時切替 -------
out.detainStart = await page.evaluate(() => {
  const { game, world } = window.__dorokei;
  const p = game.player;
  const witness = game.agents.find((a) => a !== p && a.state === 'free' && a.team !== p.team);
  game.expose(p, witness);
  return {
    state: p.state,
    detainLeft: +p.detainLeft.toFixed(1),
    jailedSlot: p.jailSlot,
    jailPos: [p.x, p.z],
    jail: world.cameraPose(p).jail === true,
    spyNoteHidden: document.getElementById('spyNote').classList.contains('hidden'),
  };
});
await page.waitForTimeout(250);
out.detainCard = await roleOf();
check(out.detainStart.state === 'detained', '発覚しても拘束状態にならない');
check(out.detainStart.jail, '拘束中のカメラが俯瞰にならない');
check(/15秒拘束中/.test(out.detainCard.tag), `拘束中バッジが出ない (${out.detainCard.tag})`);
check(
  /あと\d+秒後に泥棒へ転向/.test(out.detainCard.mission),
  `転向カウントダウンが読めない (${out.detainCard.mission})`,
);
check(/スティックで周りを見渡せる/.test(out.detainCard.chip), '拘束中のカメラ操作の案内がない');

// スティックでカメラがパンし、キャラは動かない
out.jailPanBefore = await page.evaluate(() => {
  const { game, world } = window.__dorokei;
  const p = game.player;
  return { x: p.x, z: p.z, pan: { ...world.lookPan } };
});
const stickBox = await page.locator('#stick').boundingBox();
await page.mouse.move(stickBox.x + stickBox.width / 2, stickBox.y + stickBox.height / 2);
await page.mouse.down();
await page.mouse.move(
  stickBox.x + stickBox.width / 2 + 42,
  stickBox.y + stickBox.height / 2,
  { steps: 4 },
);
await page.waitForTimeout(450);
out.jailPanMid = await page.evaluate(() => {
  const { game, world } = window.__dorokei;
  const p = game.player;
  return { x: p.x, z: p.z, pan: { ...world.lookPan } };
});
await page.mouse.up();
check(
  out.jailPanMid.pan.x > out.jailPanBefore.pan.x + 1,
  `拘束中にスティックでカメラが動かない (${JSON.stringify({ a: out.jailPanBefore, b: out.jailPanMid })})`,
);
check(
  Math.abs(out.jailPanMid.x - out.jailPanBefore.x) < 0.01 &&
    Math.abs(out.jailPanMid.z - out.jailPanBefore.z) < 0.01,
  '拘束中なのにキャラが動いてしまう',
);

// 15秒経過 → 見た目どおりの陣営へ寝返り、カードが即切り替わる
await page.evaluate(() => window.__dorokei.game.stepSeconds(16));
await page.waitForTimeout(300);
out.defect = await roleOf();
out.defectInfo = await page.evaluate(() => {
  const { game, world } = window.__dorokei;
  const p = game.player;
  return {
    team: p.team,
    role: p.role,
    isSpy: p.isSpy,
    defections: game.stats.defections,
    jailCam: world.cameraPose(p).jail === true,
    events: game.events.map((e) => e.type),
  };
});
check(out.defectInfo.role === 'thief' && out.defectInfo.team === 'thief', '15秒後に泥棒へ寝返らない');
check(out.defectInfo.defections === 1, '寝返りの記録がない');
check(!out.defectInfo.jailCam, '寝返り後もカメラが牢屋のまま');
check(out.defect.tag === '🎭 泥棒', `寝返り後のバッジが切り替わらない (${out.defect.tag})`);
check(/お宝をゲートへ運べ/.test(out.defect.mission), `寝返り後のミッションが違う (${out.defect.mission})`);

// ---- Build 3: 画面中央に何も浮いていない ---------------------------------
out.center = await page.evaluate(() => {
  const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  return { tag: el?.tagName, id: el?.id, cls: el?.className };
});
check(
  out.center.id === 'scene' || /canvas/i.test(out.center.tag || ''),
  `画面中央がふさがっている (${JSON.stringify(out.center)})`,
);

// ---- Build 3: MENU（つづける／ホームへ） ---------------------------------
out.menu = await page.evaluate(async () => {
  const { game } = window.__dorokei;
  const t0 = game.time;
  document.getElementById('menuBtn').click();
  await new Promise((r) => setTimeout(r, 450));
  const open = !document.getElementById('pause').classList.contains('hidden');
  const t1 = game.time;
  document.getElementById('pauseResume').click();
  await new Promise((r) => setTimeout(r, 350));
  const closed = document.getElementById('pause').classList.contains('hidden');
  const t2 = game.time;
  return { open, closed, pausedTime: +(t0 - t1).toFixed(2), resumedTime: +(t1 - t2).toFixed(2) };
});
check(out.menu.open, 'MENU ボタンでメニューが開かない');
check(out.menu.closed, '「つづける」でメニューが閉じない');
check(out.menu.pausedTime === 0, `メニュー中も試合が進んでしまう (${out.menu.pausedTime})`);
check(out.menu.resumedTime > 0, '「つづける」で試合が再開しない');

out.homeFlow = await page.evaluate(async () => {
  document.getElementById('menuBtn').click();
  await new Promise((r) => setTimeout(r, 200));
  document.getElementById('pauseHome').click();
  await new Promise((r) => setTimeout(r, 200));
  const confirm = !document.getElementById('pauseConfirm').classList.contains('hidden');
  document.getElementById('pauseHomeNo').click();
  await new Promise((r) => setTimeout(r, 150));
  const cancelled = document.getElementById('pauseConfirm').classList.contains('hidden');
  document.getElementById('pauseHome').click();
  await new Promise((r) => setTimeout(r, 150));
  document.getElementById('pauseHomeYes').click();
  await new Promise((r) => setTimeout(r, 350));
  return {
    confirm,
    cancelled,
    titleShown: !document.getElementById('title').classList.contains('hidden'),
    hudHidden: document.getElementById('hud').classList.contains('hidden'),
    pauseHidden: document.getElementById('pause').classList.contains('hidden'),
  };
});
check(out.homeFlow.confirm, 'ホームへ の確認が出ない');
check(out.homeFlow.cancelled, '確認をキャンセルできない');
check(
  out.homeFlow.titleShown && out.homeFlow.hudHidden && out.homeFlow.pauseHidden,
  `ホームへ戻れない (${JSON.stringify(out.homeFlow)})`,
);

// ---- Build 3: iPhone 縦・横でHUDが重ならない ---------------------------
out.layout = {};
for (const [name, viewport] of [
  ['portrait', { width: 430, height: 932 }],
  ['landscape', { width: 932, height: 430 }],
]) {
  await page.setViewportSize(viewport);
  await page.evaluate(() => {
    window.__dorokei.startGame({
      playerRole: 'thief',
      playerSpy: 'never',
      spyMode: 'none',
      autoplay: true,
      seed: 31,
    });
  });
  await page.waitForTimeout(500);
  out.layout[name] = await page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    const overlap = (a, b) =>
      !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const stack = rect('.hud-stack');
    const radar = rect('.radar');
    const role = rect('#roleCard');
    const stick = rect('#stick');
    const action = rect('#actionBtn');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      vw,
      vh,
      stackRadar: overlap(stack, radar),
      roleRadar: overlap(role, radar),
      roleStick: overlap(role, stick),
      roleAction: overlap(role, action),
      roleRight: role ? +(role.x + role.w).toFixed(0) : null,
      roleBottom: role ? +(role.y + role.h).toFixed(0) : null,
      center: (() => {
        const el = document.elementFromPoint(vw / 2, vh / 2);
        return el?.id || el?.tagName;
      })(),
    };
  });
  const L = out.layout[name];
  check(!L.stackRadar && !L.roleRadar, `${name}: HUDとミニマップが重なる`);
  check(!L.roleStick && !L.roleAction, `${name}: 役カードが操作ボタンと重なる`);
  check(L.roleRight < L.vw * 0.6, `${name}: 役カードが画面中央に食い込む (${L.roleRight}/${L.vw})`);
  check(L.center === 'scene' || L.center === 'CANVAS', `${name}: 中央が ${L.center} でふさがれている`);
}
await page.setViewportSize({ width: 900, height: 600 });
await page.waitForTimeout(200);

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

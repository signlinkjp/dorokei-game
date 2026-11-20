// DOROKEI — UI / ゲームループ
import { Game, ROLE, MAP } from './core.js';
import { World } from './render.js';
import { Minimap } from './minimap.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const world = new World(canvas);
const minimap = new Minimap($('minimap'));

const ui = {
  hud: $('hud'),
  title: $('title'),
  result: $('result'),
  timer: $('timerValue'),
  copCount: $('copCount'),
  thiefCount: $('thiefCount'),
  jailCount: $('jailCount'),
  lootCount: $('lootCount'),
  viewBtn: $('viewBtn'),
  roleBanner: $('roleBanner'),
  roleTag: $('roleTag'),
  roleText: $('roleText'),
  eventFeed: $('eventFeed'),
  gauge: $('gauge'),
  gaugeLabel: $('gaugeLabel'),
  gaugeFill: $('gaugeFill'),
  spyNote: $('spyNote'),
  hiddenNote: $('hiddenNote'),
  stick: $('stick'),
  knob: $('stickKnob'),
  actionBtn: $('actionBtn'),
  startBtn: $('startBtn'),
  againBtn: $('againBtn'),
  homeBtn: $('homeBtn'),
  resultTitle: $('resultTitle'),
  resultReason: $('resultReason'),
  resultKicker: $('resultKicker'),
  resultStats: $('resultStats'),
};

const settings = { playerRole: 'auto', spyMode: 'both', playerSpy: 'random' };
let game = null;
let mode = 'title'; // title | playing | ended
let shownEvents = 0;
let eventTimer = 0;
let bannerTimer = 0;

// ---- タイトル背景用のデモシーン -------------------------------------------
const showcase = new Game({ seed: 12, autoplay: true });
showcase.stepSeconds(24);
world.setGame(showcase);
world.setView('map');
world.snapCamera();

function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---- 設定UI ---------------------------------------------------------------
function bindSeg(id, key, attr) {
  const box = $(id);
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    for (const b of box.querySelectorAll('.seg-btn')) b.classList.remove('active');
    btn.classList.add('active');
    settings[key] = btn.dataset[attr];
  });
}
bindSeg('rolePick', 'playerRole', 'role');
bindSeg('spyPick', 'spyMode', 'spy');
bindSeg('selfSpyPick', 'playerSpy', 'self');

const ROLE_INFO = {
  [ROLE.COP]: { tag: '警察', cls: 'cop', text: '泥棒を全員牢屋に入れろ' },
  [ROLE.COP_SPY]: { tag: '内通者', cls: 'spy-cop', text: '警官のフリで牢屋を解錠せよ' },
  [ROLE.THIEF]: { tag: '泥棒', cls: 'thief', text: 'お宝を5つ脱出ゲートへ運べ' },
  [ROLE.THIEF_SPY]: { tag: '密告者', cls: 'spy-thief', text: '泥棒に紛れて密告・お宝を奪い返せ' },
};

function startGame(opts = {}) {
  const params = new URLSearchParams(location.search);
  game = new Game({
    seed: opts.seed ?? Number(params.get('seed') || Math.floor(Math.random() * 99999)),
    playerRole: opts.playerRole ?? settings.playerRole,
    spyMode: opts.spyMode ?? settings.spyMode,
    playerSpy: opts.playerSpy ?? settings.playerSpy,
    autoplay: opts.autoplay ?? false,
  });
  shownEvents = 0;
  ui.eventFeed.innerHTML = '';
  bannerTimer = 0;

  const p = game.player;
  const info = ROLE_INFO[p.role];
  ui.roleBanner.className = `role-banner ${info.cls}`;
  ui.roleTag.textContent = info.tag;
  ui.roleText.textContent = info.text;
  ui.roleBanner.classList.remove('faded');
  bannerTimer = 5.0;
  ui.spyNote.classList.toggle('hidden', !p.isSpy);
  if (p.isSpy) {
    ui.spyNote.textContent =
      p.role === ROLE.COP_SPY
        ? '内通者：牢屋の前で長押し＝解錠（警官に見られると発覚）'
        : '密告者：ボタンで密告／ゲート前で長押し＝お宝を奪い返す';
  }
  ui.hiddenNote.classList.add('hidden');

  world.setGame(game);
  world.setView(opts.view || 'follow');
  world.snapCamera();

  if (opts.warp) game.stepSeconds(opts.warp);

  ui.title.classList.add('hidden');
  ui.result.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  mode = 'playing';
  ui.startBtn.blur();
  minimap.draw(game);
}

function endGame() {
  mode = 'ended';
  const copsWin = game.winner === 'cops';
  ui.resultTitle.textContent = copsWin ? '警察陣営の勝利' : '泥棒陣営の勝利';
  ui.resultTitle.className = `result-title ${copsWin ? 'cops' : 'thieves'}`;
  ui.resultKicker.textContent = game.reason.includes('時間切れ') ? 'TIME UP' : 'GAME SET';
  ui.resultReason.textContent = game.reason;
  const s = game.stats;
  const cells = [
    [s.arrests, '確保'],
    [`${game.securedCount}/${game.cfg.treasureRequired}`, 'お宝搬出'],
    [s.rescues + s.unlocks, '救出・解錠'],
    [s.returns, '奪い返し'],
    [s.exposures, '正体発覚'],
    [s.hides, '隠れた'],
  ];
  ui.resultStats.innerHTML = cells
    .map(([v, l]) => `<div class="stat"><b>${v}</b><small>${l}</small></div>`)
    .join('');
  ui.result.classList.remove('hidden');
}

ui.startBtn.addEventListener('click', () => startGame());
ui.againBtn.addEventListener('click', () => startGame());
ui.homeBtn.addEventListener('click', () => {
  mode = 'title';
  ui.result.classList.add('hidden');
  ui.title.classList.remove('hidden');
  ui.hud.classList.add('hidden');
  world.setGame(showcase);
  world.setView('map');
  world.snapCamera();
});

ui.viewBtn.addEventListener('click', () => {
  const v = world.toggleView();
  ui.viewBtn.textContent = v === 'follow' ? '俯瞰' : '通常';
});

// ---- 入力 -----------------------------------------------------------------
const keys = new Set();
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') game?.setAction(true);
  if (e.code === 'KeyV') ui.viewBtn.click();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') game?.setAction(false);
});

let stickPointer = null;
const STICK_MAX = 44;
function stickMove(e) {
  const rect = ui.stick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const len = Math.hypot(dx, dy);
  if (len > STICK_MAX) {
    dx = (dx / len) * STICK_MAX;
    dy = (dy / len) * STICK_MAX;
  }
  ui.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  game?.setPlayerMove(dx / STICK_MAX, dy / STICK_MAX);
}
function stickReset() {
  stickPointer = null;
  ui.knob.style.transform = 'translate(0px, 0px)';
  game?.setPlayerMove(0, 0);
}
ui.stick.addEventListener('pointerdown', (e) => {
  stickPointer = e.pointerId;
  ui.stick.setPointerCapture(e.pointerId);
  stickMove(e);
});
ui.stick.addEventListener('pointermove', (e) => {
  if (e.pointerId === stickPointer) stickMove(e);
});
ui.stick.addEventListener('pointerup', stickReset);
ui.stick.addEventListener('pointercancel', stickReset);

ui.actionBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  ui.actionBtn.classList.add('pressed');
  game?.setAction(true);
});
const release = () => {
  ui.actionBtn.classList.remove('pressed');
  game?.setAction(false);
};
ui.actionBtn.addEventListener('pointerup', release);
ui.actionBtn.addEventListener('pointerleave', release);
ui.actionBtn.addEventListener('pointercancel', release);

// ---- HUD ------------------------------------------------------------------
function actionLabel(p) {
  const nearDoor = Math.hypot(p.x - MAP.jailDoor.x, p.z - MAP.jailDoor.z) < game.cfg.actionRange;
  const nearGate = Math.hypot(p.x - MAP.gate.x, p.z - MAP.gate.z) < game.cfg.returnRange;
  const jailedCount = game.jailedTeammates(p).length;
  if (p.state === 'jailed') return { text: '牢屋の中', cls: '' };
  if (p.role === ROLE.COP) return nearDoor ? { text: 'つかまえる', cls: 'cop' } : { text: 'ダッシュ', cls: 'cop' };
  if (p.role === ROLE.COP_SPY)
    return nearDoor && jailedCount > 0
      ? { text: '解錠\n長押し', cls: 'spy' }
      : { text: 'ダッシュ', cls: 'spy' };
  if (p.role === ROLE.THIEF_SPY) {
    if (nearGate && game.securedCount > 0) return { text: 'もどす\n長押し', cls: 'spy' };
    return { text: '密告', cls: 'spy' };
  }
  if (p.carrying != null) return { text: 'にげろ', cls: '' };
  if (nearDoor && jailedCount > 0) return { text: '救出\n長押し', cls: '' };
  if (p.hidden) return { text: '出る', cls: 'hidden-mode' };
  if (game.bushAt(p) >= 0) return { text: 'かくれる', cls: 'hidden-mode' };
  return { text: 'ひろう', cls: '' };
}

function setActionBtn(p) {
  const { text, cls } = actionLabel(p);
  if (ui.actionBtn.dataset.label !== text) {
    ui.actionBtn.textContent = text;
    ui.actionBtn.dataset.label = text;
  }
  const wanted = `action-btn${cls ? ` ${cls}` : ''}`;
  if (ui.actionBtn.className.replace(' pressed', '') !== wanted) {
    ui.actionBtn.className = wanted;
  }
}

function updateHud(dt) {
  if (!game) return;
  const c = game.counts();
  ui.timer.textContent = formatTime(game.time);
  ui.copCount.textContent = c.copFree;
  ui.thiefCount.textContent = c.thiefFree;
  ui.jailCount.textContent = c.jailed;
  ui.lootCount.textContent = `${c.secured}/${c.required}`;

  const p = game.player;
  setActionBtn(p);

  // ゲージ
  if (p.actionT > 0.01) {
    const ratio = Math.min(1, p.actionT / game.cfg.actionTime);
    ui.gauge.classList.remove('hidden');
    ui.gaugeFill.style.width = `${ratio * 100}%`;
    ui.gaugeLabel.textContent =
      p.role === ROLE.COP_SPY
        ? '解錠中…'
        : p.role === ROLE.THIEF_SPY
          ? 'お宝を奪い返し中…'
          : '救出中…';
  } else {
    ui.gauge.classList.add('hidden');
  }

  // 隠れ中の表示
  ui.hiddenNote.classList.toggle('hidden', !p.hidden);

  // ロールバナーを少し小さく
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) ui.roleBanner.classList.add('faded');
  }

  // イベントフィード
  if (game.events.length !== shownEvents) {
    const fresh = game.events.slice(shownEvents);
    shownEvents = game.events.length;
    for (const e of fresh) {
      const div = document.createElement('div');
      div.className = `ev ${e.type}`;
      div.textContent = e.label;
      ui.eventFeed.appendChild(div);
    }
    while (ui.eventFeed.children.length > 4) ui.eventFeed.firstElementChild.remove();
  }
  eventTimer += dt;
  if (eventTimer > 0.6) eventTimer = 0;

  if (game.phase === 'ended' && mode === 'playing') endGame();
}

// ---- ループ ---------------------------------------------------------------
function keyboardMove() {
  let x = 0;
  let z = 0;
  if (keys.has('ArrowUp') || keys.has('KeyW')) z -= 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) z += 1;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
  return { x, z };
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;

  if (mode === 'title') {
    showcase.step(dt * 0.9);
    world.update(showcase, dt);
    world.render();
  } else if (game) {
    if (mode === 'playing' && stickPointer === null) {
      const k = keyboardMove();
      game.setPlayerMove(k.x, k.z);
    }
    if (mode === 'playing') game.step(dt);
    world.update(game, dt);
    minimap.draw(game);
    updateHud(dt);
    world.render();
  }
  requestAnimationFrame(frame);
}

// ---- デモ / スクリーンショット用 -----------------------------------------
const params = new URLSearchParams(location.search);
if (params.get('demo')) {
  startGame({
    playerRole: params.get('team') || 'auto',
    spyMode: params.get('spy') || 'both',
    playerSpy: params.get('self') || 'random',
    autoplay: true,
    seed: Number(params.get('seed') || 7),
    warp: Number(params.get('warp') || 30),
    view: ['top', 'map'].includes(params.get('view')) ? params.get('view') : 'follow',
  });
  if (['top', 'map'].includes(params.get('view'))) ui.viewBtn.textContent = '通常';
  ui.hud.classList.toggle('hidden', params.get('hud') === '0');
}

window.__dorokei = {
  get game() {
    return game;
  },
  world,
  minimap,
  startGame,
  settings,
  showcase,
};

requestAnimationFrame(frame);

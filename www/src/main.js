// DOROKEI — UI / ゲームループ（Build 3）
// 音（Web Audio）・言語・ステージ選択・設定／あそびかた／プライバシーのモーダル、
// 茂みの残り秒数ゲージ、警察の「🔍 捜索」、自分の役とミッションの常時表示、
// プレイ中の MENU（タイトルへ戻る）、牢屋・拘束中のスティック俯瞰カメラをまとめて面倒みる。
import { Game, ROLE, MAP, CFG, spyNameKey, spyDescKey } from './core.js';
import { World } from './render.js';
import { Minimap } from './minimap.js';
import { AudioEngine, pickSfx } from './audio.js';
import { STAGES, DEFAULT_STAGE, isStagePlayable } from './stages.js';
import { LANGS, DEFAULT_LANG, t, applyI18n } from './i18n.js';

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
  soundBtn: $('soundBtn'),
  menuBtn: $('menuBtn'),
  roleCard: $('roleCard'),
  roleTag: $('roleTag'),
  roleText: $('roleText'),
  roleChip: $('roleChip'),
  eventFeed: $('eventFeed'),
  gauge: $('gauge'),
  gaugeLabel: $('gaugeLabel'),
  gaugeFill: $('gaugeFill'),
  hideGauge: $('hideGauge'),
  hideLabel: $('hideLabel'),
  hideFill: $('hideFill'),
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
  stageGrid: $('stageGrid'),
  stageNote: $('stageNote'),
  modal: $('modal'),
  modalClose: $('modalClose'),
  langSelect: $('langSelect'),
  timePick: $('timePick'),
  soundPick: $('soundPick'),
  howtoBtn: $('howtoBtn'),
  settingsBtn: $('settingsBtn'),
  privacyBtn: $('privacyBtn'),
  privacyBtn2: $('privacyBtn2'),
  pause: $('pause'),
  pauseClose: $('pauseClose'),
  pauseResume: $('pauseResume'),
  pauseHome: $('pauseHome'),
  pauseHomeYes: $('pauseHomeYes'),
  pauseHomeNo: $('pauseHomeNo'),
  pauseConfirm: $('pauseConfirm'),
  pauseSound: $('pauseSound'),
  pauseHowto: $('pauseHowto'),
  pauseSettings: $('pauseSettings'),
  pauseRoleTag: $('pauseRoleTag'),
  pauseRoleMission: $('pauseRoleMission'),
};

// ---- 設定（端末内に保存） -------------------------------------------------
const STORE_KEY = 'dorokei.settings.v1';
const DEFAULTS = {
  sound: true,
  duration: 300,
  lang: DEFAULT_LANG,
  stage: DEFAULT_STAGE,
  playerRole: 'auto',
  spyMode: 'both',
  playerSpy: 'random',
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

const settings = loadSettings();
if (!CFG.durations.includes(Number(settings.duration))) settings.duration = DEFAULTS.duration;
if (!isStagePlayable(settings.stage)) settings.stage = DEFAULT_STAGE;
if (!LANGS.some((l) => l.id === settings.lang)) settings.lang = DEFAULT_LANG;

function saveSettings() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    /* 保存できない環境ではそのまま遊ぶ */
  }
}

const audio = new AudioEngine({ enabled: settings.sound !== false });

let game = null;
let mode = 'title'; // title | playing | ended
let shownEvents = 0;
let eventTimer = 0;
let defectNotice = 0; // 寝返り直後のチップ表示（秒）
let paused = false; // MENU を開いている間はゲームを止める
let frozen = false; // ?chars=1 のキャラ撮影用に時計を止める

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

// ---- 言語 -----------------------------------------------------------------
function lang() {
  return settings.lang;
}

function stageName(s) {
  return lang() === 'ja' ? s.nameJa || s.name : s.nameEn || s.name;
}

// ---- 自分の役とやるべきこと（Build 3） ------------------------------------
// 役目が変わるゲームなので、左上のカードに「役」＋「1行ミッション」を常に出し、
// 拘束→寝返りの瞬間もそのまま切り替わる。
const MISSION_KEY = {
  [ROLE.COP]: 'mission.cop',
  [ROLE.THIEF]: 'mission.thief',
  [ROLE.COP_SPY]: 'mission.copSpy',
  [ROLE.THIEF_SPY]: 'mission.thiefSpy',
};

function roleClass(role) {
  if (role === ROLE.COP) return 'cop';
  if (role === ROLE.THIEF) return 'thief';
  if (role === ROLE.COP_SPY) return 'spy-cop';
  if (role === ROLE.THIEF_SPY) return 'spy-thief';
  return 'cop';
}

function roleTagKey(p) {
  if (p.isSpy) return spyNameKey(p.role, game?.spyMode || settings.spyMode) || 'role.cop';
  return p.role === ROLE.COP ? 'role.cop' : 'role.thief';
}

function missionKeyOf(role) {
  return MISSION_KEY[role] || 'mission.cop';
}

/**
 * カードの中身を組み立てる。
 * state: free | jailed | detained
 * sig が変わった時だけ DOM を書き換える（毎フレームのチラつきを防ぐ）
 */
function roleCardView(p) {
  if (!p) return null;
  const teamWord = (team) => t(team === 'cop' ? 'team.cop' : 'team.thief', lang());
  if (p.state === 'detained') {
    const toTeam = p.looks === 'cop' ? 'cop' : 'thief';
    const secs = Math.max(0, Math.ceil(p.detainLeft || 0));
    return {
      cls: 'detained',
      tag: t('role.detainedTag', lang()),
      mission: t('role.detainedMission', lang())
        .replace('{n}', String(secs))
        .replace('{team}', teamWord(toTeam)),
      chip: t('role.detainedHint', lang()),
      sig: `detained|${secs}|${toTeam}`,
    };
  }
  if (p.state === 'jailed') {
    return {
      cls: 'detained',
      tag: t('hud.jail', lang()),
      mission: t('role.jailedMission', lang()),
      chip: t('role.detainedHint', lang()),
      sig: 'jailed',
    };
  }
  const isSpy = !!p.isSpy;
  const tag = t(roleTagKey(p), lang());
  const mission = t(missionKeyOf(p.role), lang());
  let chip = '';
  if (defectNotice > 0) chip = t('role.defectedChip', lang()).replace('{team}', teamWord(p.team));
  return { cls: roleClass(p.role), tag, mission, chip, sig: `${p.role}|${isSpy}|${chip}` };
}

let roleSig = '';
function refreshRoleCard(force = false) {
  if (!game) return;
  const p = game.player;
  const view = roleCardView(p);
  if (!view) return;
  if (!force && view.sig === roleSig) return;
  roleSig = view.sig;
  ui.roleCard.className = `role-card ${view.cls}`;
  ui.roleTag.textContent = view.tag;
  ui.roleText.textContent = view.mission;
  ui.roleChip.textContent = view.chip || '';
  ui.roleChip.classList.toggle('hidden', !view.chip);
  if (ui.pauseRoleTag) ui.pauseRoleTag.textContent = view.tag;
  if (ui.pauseRoleMission) ui.pauseRoleMission.textContent = view.mission;
}

function spyNoteFor(p) {
  const mode = game?.spyMode || settings.spyMode;
  const key = spyDescKey(p.role, mode);
  return key ? t(key, lang()) : '';
}

function buildLangSelect() {
  ui.langSelect.innerHTML = '';
  for (const l of LANGS) {
    const o = document.createElement('option');
    o.value = l.id;
    o.textContent = l.label;
    ui.langSelect.appendChild(o);
  }
  ui.langSelect.value = settings.lang;
}

function renderStageCards() {
  ui.stageGrid.innerHTML = '';
  for (const s of STAGES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `stage-card${s.available ? '' : ' coming'}${settings.stage === s.id ? ' active' : ''}`;
    b.dataset.stage = s.id;
    const sub = s.available
      ? lang() === 'ja'
        ? s.tagline
        : s.taglineEn
      : t('stage.comingSoon', lang());
    const emoji = document.createElement('span');
    emoji.className = 'stage-emoji';
    emoji.textContent = s.emoji;
    const bName = document.createElement('b');
    bName.textContent = stageName(s);
    const bSub = document.createElement('small');
    bSub.textContent = sub;
    b.append(emoji, bName, bSub);
    if (s.available) b.title = lang() === 'ja' ? s.desc : s.descEn;
    ui.stageGrid.appendChild(b);
  }
}

function setLang(id) {
  settings.lang = LANGS.some((l) => l.id === id) ? id : DEFAULT_LANG;
  saveSettings();
  applyI18n(document, settings.lang);
  if (ui.langSelect.value !== settings.lang) ui.langSelect.value = settings.lang;
  renderStageCards();
  syncDynamicLabels();
}

function syncDynamicLabels() {
  ui.viewBtn.textContent = world.view === 'follow' ? t('hud.map', lang()) : t('hud.follow', lang());
  ui.soundBtn.textContent = audio.enabled ? '🔊' : '🔇';
  ui.soundBtn.setAttribute('aria-pressed', String(audio.enabled));
  ui.hiddenNote.textContent =
    lang() === 'ja'
      ? '物陰に隠れている（動くと出る・最大5秒）'
      : 'Hidden — move to come out (up to 5s)';
  if (game) {
    roleSig = '';
    refreshRoleCard(true);
  }
  // ボタンの文言キャッシュを捨てて次のフレームで作り直す
  delete ui.actionBtn.dataset.label;
}

// ---- あそびかた／設定／プライバシーのモーダル -----------------------------
function openModal(name) {
  ui.modal.classList.remove('hidden');
  for (const panel of ui.modal.querySelectorAll('.panel')) {
    panel.classList.toggle('active', panel.dataset.panel === name);
  }
  applyI18n(ui.modal, settings.lang);
  audio.play('tap');
}

function closeModal() {
  ui.modal.classList.add('hidden');
}

// ---- サウンド -------------------------------------------------------------
function setSound(on) {
  settings.sound = !!on;
  audio.setEnabled(settings.sound);
  saveSettings();
  syncSoundActive();
  syncDynamicLabels();
  if (settings.sound) {
    audio.unlock();
    audio.play('tap');
    if (mode === 'playing' && !frozen) audio.startMusic();
  }
}

function syncSoundActive() {
  for (const b of ui.soundPick.querySelectorAll('.seg-btn')) {
    b.classList.toggle('active', (b.dataset.sound === 'on') === !!settings.sound);
  }
}

// ---- 設定UI ---------------------------------------------------------------
function bindSeg(id, key, attr, after) {
  const box = $(id);
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    for (const b of box.querySelectorAll('.seg-btn')) b.classList.remove('active');
    btn.classList.add('active');
    settings[key] = btn.dataset[attr];
    saveSettings();
    audio.play('tap');
    after?.(settings[key]);
  });
}

function syncSeg(id, attr, value) {
  const box = $(id);
  if (!box) return;
  for (const b of box.querySelectorAll('.seg-btn')) {
    b.classList.toggle('active', String(b.dataset[attr]) === String(value));
  }
}

bindSeg('rolePick', 'playerRole', 'role');
bindSeg('spyPick', 'spyMode', 'spy');
bindSeg('selfSpyPick', 'playerSpy', 'self');
bindSeg('timePick', 'duration', 'duration', (v) => {
  settings.duration = Number(v) || DEFAULTS.duration;
  saveSettings();
});
ui.timePick.addEventListener('click', () => {
  settings.duration = Number(settings.duration);
  saveSettings();
});

ui.soundPick.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  setSound(btn.dataset.sound === 'on');
});

ui.langSelect.addEventListener('change', () => {
  setLang(ui.langSelect.value);
  audio.play('tap');
});

ui.stageGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.stage-card');
  if (!btn) return;
  const stage = STAGES.find((s) => s.id === btn.dataset.stage);
  if (!stage) return;
  if (!stage.available) {
    ui.stageNote.classList.remove('hidden');
    ui.stageNote.textContent = `🏛️ ${stageName(stage)} — ${t('stage.comingSoonNote', lang())}`;
    audio.play('tap');
    return;
  }
  settings.stage = stage.id;
  saveSettings();
  ui.stageNote.classList.add('hidden');
  renderStageCards();
  audio.play('tap');
});

ui.howtoBtn.addEventListener('click', () => openModal('howto'));
ui.settingsBtn.addEventListener('click', () => openModal('settings'));
ui.privacyBtn.addEventListener('click', () => openModal('privacy'));
ui.privacyBtn2.addEventListener('click', () => openModal('privacy'));
ui.modalClose.addEventListener('click', closeModal);
ui.modal.addEventListener('click', (e) => {
  if (e.target === ui.modal) closeModal();
  if (e.target.closest('[data-close]')) closeModal();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (!ui.pause.classList.contains('hidden')) closePause();
    else if (!ui.modal.classList.contains('hidden')) closeModal();
  }
});

// ---- ゲームの開始・終了 ---------------------------------------------------
function startGame(opts = {}) {
  const params = new URLSearchParams(location.search);
  game = new Game({
    seed: opts.seed ?? Number(params.get('seed') || Math.floor(Math.random() * 99999)),
    playerRole: opts.playerRole ?? settings.playerRole,
    spyMode: opts.spyMode ?? settings.spyMode,
    playerSpy: opts.playerSpy ?? settings.playerSpy,
    stage: opts.stage ?? settings.stage,
    cfg: { duration: opts.duration ?? Number(settings.duration) ?? CFG.duration },
    autoplay: opts.autoplay ?? false,
  });
  shownEvents = 0;
  ui.eventFeed.innerHTML = '';
  defectNotice = 0;
  frozen = false;

  const p = game.player;
  roleSig = '';
  refreshRoleCard(true);
  ui.spyNote.classList.toggle('hidden', !p.isSpy);
  if (p.isSpy) ui.spyNote.textContent = spyNoteFor(p);
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

  // 最初のタップで音を解錠してから、開始音とBGM
  audio.unlock();
  audio.play('start');
  audio.startMusic();
  syncDynamicLabels();
}

function endGame() {
  mode = 'ended';
  audio.stopMusic();
  const copsWin = game.winner === 'cops';
  const playerTeam = game.player?.team;
  const youWin = playerTeam ? (copsWin ? 'cop' : 'thief') === playerTeam : copsWin;
  ui.resultTitle.textContent =
    lang() === 'ja'
      ? copsWin
        ? '警察陣営の勝利'
        : '泥棒陣営の勝利'
      : copsWin
        ? 'Cops win'
        : 'Thieves win';
  ui.resultTitle.className = `result-title ${copsWin ? 'cops' : 'thieves'}`;
  ui.resultKicker.textContent = game.reason.includes('時間切れ') ? 'TIME UP' : 'GAME SET';
  ui.resultReason.textContent = game.reason;
  const s = game.stats;
  const cells = [
    [s.arrests, t('stat.arrests', lang())],
    [`${game.securedCount}/${game.cfg.treasureRequired}`, t('stat.secured', lang())],
    [s.rescues + s.unlocks, t('stat.rescue', lang())],
    [s.returns, t('stat.returns', lang())],
    [s.exposures, t('stat.exposed', lang())],
    [s.hides, t('stat.hides', lang())],
    [s.searches, t('stat.searches', lang())],
  ];
  ui.resultStats.innerHTML = cells
    .map(([v, l]) => `<div class="stat"><b>${v}</b><small>${l}</small></div>`)
    .join('');
  ui.result.classList.remove('hidden');
  ui.result.dataset.youWin = String(youWin);
}

function returnToTitle() {
  mode = 'title';
  paused = false;
  audio.stopMusic();
  ui.pause.classList.add('hidden');
  ui.result.classList.add('hidden');
  ui.title.classList.remove('hidden');
  ui.hud.classList.add('hidden');
  world.setGame(showcase);
  world.setView('map');
  world.snapCamera();
}

// ---- プレイ中の MENU -------------------------------------------------------
function openPause() {
  if (mode !== 'playing') return;
  paused = true;
  ui.pauseConfirm.classList.add('hidden');
  applyI18n(ui.pause, settings.lang);
  ui.pauseSound.textContent = `${audio.enabled ? '🔊' : '🔇'} ${t('menu.sound', lang())}`;
  refreshRoleCard(true);
  ui.pause.classList.remove('hidden');
  audio.play('tap');
}

function closePause() {
  paused = false;
  ui.pause.classList.add('hidden');
}

ui.menuBtn.addEventListener('click', openPause);
ui.pauseClose.addEventListener('click', closePause);
ui.pauseResume.addEventListener('click', () => {
  audio.play('tap');
  closePause();
});
ui.pause.addEventListener('click', (e) => {
  if (e.target === ui.pause) closePause();
});
ui.pauseHome.addEventListener('click', () => {
  audio.play('tap');
  ui.pauseConfirm.classList.remove('hidden');
});
ui.pauseHomeNo.addEventListener('click', () => {
  audio.play('tap');
  ui.pauseConfirm.classList.add('hidden');
});
ui.pauseHomeYes.addEventListener('click', () => {
  audio.play('tap');
  returnToTitle();
});
ui.pauseSound.addEventListener('click', () => {
  setSound(!settings.sound);
  ui.pauseSound.textContent = `${audio.enabled ? '🔊' : '🔇'} ${t('menu.sound', lang())}`;
});
ui.pauseHowto.addEventListener('click', () => openModal('howto'));
ui.pauseSettings.addEventListener('click', () => openModal('settings'));

ui.startBtn.addEventListener('click', () => {
  audio.unlock();
  audio.play('tap');
  startGame();
});
ui.againBtn.addEventListener('click', () => startGame());
ui.homeBtn.addEventListener('click', () => returnToTitle());

ui.viewBtn.addEventListener('click', () => {
  const v = world.toggleView();
  ui.viewBtn.textContent = v === 'follow' ? t('hud.map', lang()) : t('hud.follow', lang());
  audio.play('tap');
});

ui.soundBtn.addEventListener('click', () => setSound(!settings.sound));

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
let stickVec = { x: 0, z: 0 };
const STICK_MAX = 44;
const PAN_SPEED = 34; // 牢屋ビューのパン速度（m/秒）

/** 牢屋・拘束中はキャラを動かさず、スティックで俯瞰カメラだけを動かす */
function cameraOnlyMode() {
  const p = game?.player;
  return !!p && (p.state === 'jailed' || p.state === 'detained');
}

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
  stickVec = { x: dx / STICK_MAX, z: dy / STICK_MAX };
  if (!cameraOnlyMode()) game?.setPlayerMove(stickVec.x, stickVec.z);
}
function stickReset() {
  stickPointer = null;
  stickVec = { x: 0, z: 0 };
  ui.knob.style.transform = 'translate(0px, 0px)';
  if (!cameraOnlyMode()) game?.setPlayerMove(0, 0);
}
ui.stick.addEventListener('pointerdown', (e) => {
  audio.unlock();
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
  audio.unlock();
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
  if (p.state === 'detained') {
    return { text: `${Math.max(0, Math.ceil(p.detainLeft))}s`, cls: 'cooldown' };
  }
  if (p.state === 'jailed') return { text: t('hud.jail', lang()), cls: '' };
  if (p.role === ROLE.COP) {
    if (game.canSearch(p)) return { text: t('search.ready', lang()), cls: 'search' };
    return nearDoor ? { text: 'つかまえる', cls: 'cop' } : { text: 'ダッシュ', cls: 'cop' };
  }
  if (p.role === ROLE.COP_SPY) {
    return nearDoor && jailedCount > 0
      ? { text: '解錠\n長押し', cls: 'spy' }
      : { text: 'ダッシュ', cls: 'spy' };
  }
  if (p.role === ROLE.THIEF_SPY) {
    if (nearGate && game.securedCount > 0) return { text: 'もどす\n長押し', cls: 'spy' };
    return { text: '密告', cls: 'spy' };
  }
  if (p.carrying != null) return { text: 'にげろ', cls: '' };
  if (nearDoor && jailedCount > 0) return { text: '救出\n長押し', cls: '' };
  if (p.hidden) return { text: '出る', cls: 'hidden-mode' };
  if (game.bushAt(p) >= 0) {
    return p.hideCd > 0
      ? { text: `${t('hide.wait', lang())} ${Math.ceil(p.hideCd)}s`, cls: 'cooldown' }
      : { text: 'かくれる', cls: 'hidden-mode' };
  }
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

function updateHideGauge(p) {
  if (p.hidden) {
    const ratio = Math.max(0, p.hideLeft / game.cfg.hideMax);
    ui.hideGauge.classList.remove('hidden');
    ui.hideLabel.textContent = `${t('hide.label', lang())} ${p.hideLeft.toFixed(1)}s`;
    ui.hideFill.style.width = `${ratio * 100}%`;
    ui.hideFill.className = ratio < 0.34 ? 'low' : '';
    return;
  }
  if (p.looks === 'thief' && p.hideCd > 0 && game.bushAt(p) >= 0) {
    const ratio = Math.max(0, p.hideCd / game.cfg.hideCooldown);
    ui.hideGauge.classList.remove('hidden');
    ui.hideLabel.textContent = `${t('hide.cooldown', lang())} ${p.hideCd.toFixed(1)}s`;
    ui.hideFill.style.width = `${ratio * 100}%`;
    ui.hideFill.className = 'cool';
    return;
  }
  ui.hideGauge.classList.add('hidden');
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
  updateHideGauge(p);

  // 長押しゲージ
  if (p.actionT > 0.01) {
    const ratio = Math.min(1, p.actionT / game.cfg.actionTime);
    ui.gauge.classList.remove('hidden');
    ui.gaugeFill.style.width = `${ratio * 100}%`;
    ui.gaugeLabel.textContent =
      p.role === ROLE.COP_SPY
        ? lang() === 'ja'
          ? '解錠中…'
          : 'Unlocking…'
        : p.role === ROLE.THIEF_SPY
          ? lang() === 'ja'
            ? 'お宝を奪い返し中…'
            : 'Taking loot back…'
          : lang() === 'ja'
            ? '救出中…'
            : 'Rescuing…';
  } else {
    ui.gauge.classList.add('hidden');
  }

  ui.hiddenNote.classList.toggle('hidden', !p.hidden);

  // 役・状態が変わった瞬間にカードを切り替える（拘束カウントダウンも毎秒更新）
  refreshRoleCard();
  if (defectNotice > 0) {
    defectNotice = Math.max(0, defectNotice - dt);
    if (defectNotice === 0) refreshRoleCard(true);
  }
  // スパイの案内（寝返り後は消す）
  ui.spyNote.classList.toggle('hidden', !p.isSpy);
  if (p.isSpy) {
    const note = spyNoteFor(p);
    if (ui.spyNote.textContent !== note) ui.spyNote.textContent = note;
  }

  // イベントフィード（新しいイベントに効果音を付ける）
  if (game.events.length !== shownEvents) {
    const fresh = game.events.slice(shownEvents);
    shownEvents = game.events.length;
    for (const e of fresh) {
      const div = document.createElement('div');
      div.className = `ev ${e.type}`;
      div.textContent = e.label;
      ui.eventFeed.appendChild(div);
      const sfx = pickSfx(e, game.player?.team);
      if (sfx) audio.play(sfx);
      // 自分が発覚・寝返りしたらカードを即切り替える
      if (game.player && e.by === game.player.id) {
        if (e.type === 'betray') {
          defectNotice = 6;
          roleSig = '';
          refreshRoleCard(true);
        } else if (e.type === 'expose') {
          roleSig = '';
          refreshRoleCard(true);
        }
      }
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
    if (!frozen) showcase.step(dt * 0.9);
    world.update(showcase, dt);
    world.render();
  } else if (game) {
    if (mode === 'playing' && !frozen && !paused) {
      const k = keyboardMove();
      if (cameraOnlyMode()) {
        // 牢屋・拘束中：スティック／矢印キーで俯瞰カメラをパンする
        const sx = stickVec.x + k.x;
        const sz = stickVec.z + k.z;
        if (sx || sz) world.panLookBy(sx * PAN_SPEED * dt, sz * PAN_SPEED * dt);
      } else if (stickPointer === null) {
        game.setPlayerMove(k.x, k.z);
      }
      game.step(dt);
    }
    world.update(game, dt);
    minimap.draw(game);
    updateHud(dt);
    world.render();
  }
  requestAnimationFrame(frame);
}

// ---- キャラ図鑑（スクリーンショット用 ?chars=1） --------------------------
function showCharacters(params) {
  startGame({
    playerRole: 'cop',
    playerSpy: 'never',
    spyMode: 'none',
    autoplay: true,
    seed: 4,
    view: 'chars',
  });
  const p = game.player; // 警官役
  const thief = game.agents.find((a) => a.looks === 'thief');
  for (const a of game.agents) {
    if (a !== p && a !== thief) {
      a.x = 72;
      a.z = 72;
      a.state = 'free';
    }
  }
  p.x = -1.0;
  p.z = 20;
  p.dir = params.get('back') ? Math.PI : 0;
  if (thief) {
    thief.x = 1.1;
    thief.z = 20;
    thief.dir = params.get('back') ? Math.PI : 0;
    if (params.get('carry')) {
      const t0 = game.treasures[0];
      t0.state = 'carried';
      t0.carrier = thief.id;
      thief.carrying = t0.id;
    }
  }
  if (params.get('back')) world.charFocus = { x: 0.1, z: 20 };
  world.setView('chars');
  world.snapCamera();
  frozen = true;
  ui.hud.classList.add('hidden');
  ui.title.classList.add('hidden');
}

// ---- デモ / スクリーンショット用 -----------------------------------------
const params = new URLSearchParams(location.search);

if (params.get('chars')) {
  showCharacters(params);
} else if (params.get('demo')) {
  startGame({
    playerRole: params.get('team') || 'auto',
    spyMode: params.get('spy') || 'both',
    playerSpy: params.get('self') || 'random',
    autoplay: true,
    seed: Number(params.get('seed') || 7),
    warp: Number(params.get('warp') || 30),
    duration: Number(params.get('duration') || settings.duration),
    view: ['top', 'map'].includes(params.get('view')) ? params.get('view') : 'follow',
  });
  if (['top', 'map'].includes(params.get('view'))) ui.viewBtn.textContent = t('hud.follow', lang());
  ui.hud.classList.toggle('hidden', params.get('hud') === '0');

  // 牢屋・拘束中のスクリーンショット用（?jail=1）
  if (params.get('jail') && game) {
    const p = game.player;
    const witness = game.agents.find((a) => a !== p && a.state === 'free' && a.team !== p.team);
    if (p.isSpy) game.expose(p, witness);
    const after = Number(params.get('detain') || 2);
    if (after > 0) game.stepSeconds(after);
    world.centerJailView();
    world.snapCamera();
  }
}

window.__dorokei = {
  get game() {
    return game;
  },
  world,
  minimap,
  audio,
  settings,
  startGame,
  showcase,
  openModal,
  closeModal,
  openPause,
  closePause,
  returnToTitle,
  setLang,
  setSound,
  get paused() {
    return paused;
  },
  freeze(on) {
    frozen = !!on;
  },
};

// ---- 初期表示 -------------------------------------------------------------
buildLangSelect();
applyI18n(document, settings.lang);
renderStageCards();
syncSeg('rolePick', 'role', settings.playerRole);
syncSeg('spyPick', 'spy', settings.spyMode);
syncSeg('selfSpyPick', 'self', settings.playerSpy);
syncSeg('timePick', 'duration', settings.duration);
syncSoundActive();
syncDynamicLabels();

requestAnimationFrame(frame);

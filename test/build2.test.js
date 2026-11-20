// Build 2 の新機能テスト：茂み5秒／クールタイム3秒・警察の捜索・ステージ・音・言語
import test from 'node:test';
import assert from 'node:assert/strict';

import { Game, ROLE, MAP, CFG, JAIL_SLOTS } from '../www/src/core.js';
import { STAGES, DEFAULT_STAGE, stageById, isStagePlayable } from '../www/src/stages.js';
import { AudioEngine, pickSfx, SFX_NAMES } from '../www/src/audio.js';
import { LANGS, STRINGS, t, isLang } from '../www/src/i18n.js';

function makeGame(opts = {}) {
  return new Game({ seed: 42, cfg: { arrestRange: 0 }, ...opts });
}

function take(g, pred) {
  return g.agents.find(pred);
}

/** 他のエージェントを街の隅へ退避させ、単体の挙動を調べる */
function park(g, keep) {
  for (const a of g.agents) {
    if (keep.includes(a) || a.state === 'jailed') continue;
    a.x = 73;
    a.z = 73;
    a.path = null;
  }
}

// ---- 茂みの秒数制限 -------------------------------------------------------
test('茂みは1回 最大5秒・解除後クールタイム3秒（トモアキさん指定）', () => {
  assert.equal(CFG.hideMax, 5);
  assert.equal(CFG.hideCooldown, 3);

  const g = makeGame({ playerRole: 'thief', playerSpy: 'never', spyMode: 'none' });
  const p = g.player;
  park(g, [p]);
  const bush = MAP.bushes[0];
  p.x = bush.x;
  p.z = bush.z;

  assert.equal(g.hide(p), true);
  assert.equal(p.hidden, true);
  assert.equal(p.hideLeft, CFG.hideMax);

  g.stepSeconds(4.9);
  assert.equal(p.hidden, true, 'まだ5秒経っていない');
  assert.ok(p.hideLeft > 0 && p.hideLeft < 0.2);

  g.stepSeconds(0.3);
  assert.equal(p.hidden, false, '5秒で自動的に姿を現す');
  assert.equal(p.hideLeft, 0);
  assert.ok(p.hideCd > 2.5 && p.hideCd <= CFG.hideCooldown, '解除後は3秒のクールタイム');
  assert.ok(g.events.some((e) => e.type === 'unhide'), '姿を現したイベントが出る');

  // クールタイム中は隠れ直せない
  assert.equal(g.hide(p), false);
  g.stepSeconds(1.0);
  assert.equal(g.hide(p), false, '3秒たつまでは隠れられない');
  g.stepSeconds(2.2);
  assert.equal(g.hide(p), true, '3秒たてばまた隠れられる');
});

test('隠れている間の残り秒数は毎フレーム減り、ゲージ表示に使える', () => {
  const g = makeGame({ playerRole: 'thief', playerSpy: 'never', spyMode: 'none' });
  const p = g.player;
  park(g, [p]);
  p.x = MAP.bushes[1].x;
  p.z = MAP.bushes[1].z;
  g.hide(p);
  g.stepSeconds(2);
  assert.ok(Math.abs(p.hideLeft - 3) < 0.05, `残り ${p.hideLeft}`);
  assert.equal(p.hidden, true);
});

test('手動で解除した時もクールタイムが入る', () => {
  const g = makeGame({ playerRole: 'thief', playerSpy: 'never', spyMode: 'none' });
  const p = g.player;
  park(g, [p]);
  p.x = MAP.bushes[2].x;
  p.z = MAP.bushes[2].z;
  g.hide(p);
  g.unhide(p);
  assert.equal(p.hidden, false);
  assert.equal(p.hideCd, CFG.hideCooldown);
  assert.equal(g.hide(p), false);
});

// ---- 警察の「捜索」 -------------------------------------------------------
test('警察は茂みの近く（5.5m以内）で捜索でき、4.5m以内の隠れた泥棒を炙り出して確保する', () => {
  const g = makeGame({ playerRole: 'cop', playerSpy: 'never', spyMode: 'none' });
  const cop = g.player;
  assert.equal(cop.looks, 'cop');
  const thief = take(g, (a) => a.role === ROLE.THIEF);
  const bush = MAP.bushes[0];
  park(g, [cop, thief]);

  thief.x = bush.x;
  thief.z = bush.z;
  thief.hidden = true;
  thief.hideLeft = 5;

  cop.x = bush.x + 2.4;
  cop.z = bush.z;
  assert.equal(g.canSearch(cop), true, '茂みの近くでは捜索できる');
  assert.equal(thief.state, 'free');

  const res = g.search(cop);
  assert.equal(res.ok, true);
  assert.equal(res.revealed, 1);
  assert.equal(thief.hidden, false);
  assert.equal(thief.state, 'jailed', '捜索で見つけた泥棒は確保される');
  assert.equal(g.stats.searches, 1);
  assert.equal(g.counts().jailed, 1);
  const fx = g.effects.filter((e) => e.type === 'search');
  assert.equal(fx.length, 1, '足元にサーチ波紋が出る');
  assert.equal(fx[0].radius, CFG.searchRadius);
  assert.ok(g.events.some((e) => e.type === 'search' && e.count === 1));
});

test('捜索は茂みから離れていると使えず、4.5mより遠くに隠れた泥棒には届かない', () => {
  const g = makeGame({ playerRole: 'cop', playerSpy: 'never', spyMode: 'none' });
  const cop = g.player;
  const thief = take(g, (a) => a.role === ROLE.THIEF);
  park(g, [cop, thief]);

  // 茂みから遠い道路の上
  cop.x = 0;
  cop.z = 30;
  assert.equal(g.canSearch(cop), false);
  assert.equal(g.search(cop).ok, false);
  assert.equal(g.stats.searches, 0);

  // 茂みの近くに移動 → 使える。ただし隠れた泥棒は6m先なので届かない
  const bush = MAP.bushes[0];
  cop.x = bush.x + 2.0;
  cop.z = bush.z;
  thief.x = bush.x - 6;
  thief.z = bush.z;
  thief.hidden = true;
  thief.hideLeft = 5;
  assert.equal(g.canSearch(cop), true);
  const res = g.search(cop);
  assert.equal(res.ok, true);
  assert.equal(res.revealed, 0);
  assert.equal(thief.hidden, true, '4.5mより遠くは炙り出せない');
  assert.equal(thief.state, 'free');
  assert.ok(g.events.some((e) => e.type === 'search' && e.count === 0));
});

test('隠れていない泥棒は捜索では捕まらない（近づいて確保する）', () => {
  const g = makeGame({ playerRole: 'cop', playerSpy: 'never', spyMode: 'none' });
  const cop = g.player;
  const thief = take(g, (a) => a.role === ROLE.THIEF);
  park(g, [cop, thief]);
  const bush = MAP.bushes[0];
  cop.x = bush.x + 2;
  cop.z = bush.z;
  thief.x = bush.x;
  thief.z = bush.z;
  thief.hidden = false;
  const res = g.search(cop);
  assert.equal(res.revealed, 0);
  assert.equal(thief.state, 'free');
});

test('捜索には短いクールタイムがあり、スパイ（内通者）は捜索できない', () => {
  const g = makeGame({ playerRole: 'cop', playerSpy: 'never', spyMode: 'none' });
  const cop = g.player;
  park(g, [cop]);
  const bush = MAP.bushes[3];
  cop.x = bush.x + 2;
  cop.z = bush.z;
  assert.equal(g.canSearch(cop), true);
  g.search(cop);
  assert.equal(g.canSearch(cop), false, '直後は再捜索できない');
  g.stepSeconds(CFG.searchCooldown + 0.1);
  assert.equal(g.canSearch(cop), true, 'クールタイム後にまた捜索できる');

  const spyGame = makeGame({ playerRole: 'cop', playerSpy: 'always', spyMode: 'cops' });
  const spy = spyGame.player;
  assert.equal(spy.role, ROLE.COP_SPY);
  park(spyGame, [spy]);
  spy.x = bush.x + 2;
  spy.z = bush.z;
  assert.equal(spyGame.canSearch(spy), false, '内通者は捕まえる側に回らない');
  assert.equal(spyGame.search(spy).ok, false);
});

test('波紋エフェクトは0.75秒ほどで消える', () => {
  const g = makeGame({ playerRole: 'cop', playerSpy: 'never', spyMode: 'none' });
  const cop = g.player;
  park(g, [cop]);
  const bush = MAP.bushes[4];
  cop.x = bush.x + 2;
  cop.z = bush.z;
  g.search(cop);
  assert.equal(g.effects.length, 1);
  g.stepSeconds(1.0);
  assert.equal(g.effects.length, 0);
});

// ---- ステージ台帳 ---------------------------------------------------------
test('City が基本ステージで、次のステージは「準備中」として並ぶ', () => {
  assert.equal(DEFAULT_STAGE, 'city');
  assert.equal(isStagePlayable('city'), true);
  assert.equal(stageById('city').name, 'City');
  assert.equal(stageById('city').available, true);

  const coming = STAGES.filter((s) => !s.available);
  assert.ok(coming.length >= 2, '次回以降のステージ枠がある');
  assert.ok(coming.some((s) => s.name === '美術館'), '美術館（Coming Soon）がある');
  for (const s of coming) {
    assert.equal(s.emoji.length > 0, true);
    assert.equal(isStagePlayable(s.id), false);
  }
});

test('Game は遊べるステージだけを受け付け、制限時間は3/5/7分から選べる', () => {
  const g = new Game({ stage: 'city' });
  assert.equal(g.stage, 'city');
  assert.throws(() => new Game({ stage: 'museum' }), /ステージ/);
  assert.deepEqual(CFG.durations, [180, 300, 420]);
  for (const d of CFG.durations) {
    const game = new Game({ cfg: { duration: d } });
    assert.equal(game.time, d);
  }
});

test('対戦終了イベントには勝った陣営が入る（勝敗ジングル用）', () => {
  const g = makeGame({ playerRole: 'cop', playerSpy: 'never' });
  g.time = 0.05;
  g.step(0.1);
  const end = g.events.at(-1);
  assert.equal(end.type, 'end');
  assert.equal(end.winner, 'cops');
});

// ---- 音（Web Audio / Node でも安全） --------------------------------------
test('効果音の名前とイベント対応が揃っている', () => {
  for (const name of [
    'tap', 'start', 'pickup', 'deliver', 'arrest', 'unlock', 'rescue',
    'hideback', 'expose', 'hide', 'search', 'whistle', 'win', 'lose',
  ]) {
    assert.ok(SFX_NAMES.includes(name), `${name} がない`);
  }
  assert.equal(pickSfx({ type: 'pickup' }), 'pickup');
  assert.equal(pickSfx({ type: 'deliver' }), 'deliver');
  assert.equal(pickSfx({ type: 'arrest' }), 'arrest');
  assert.equal(pickSfx({ type: 'unlock' }), 'unlock');
  assert.equal(pickSfx({ type: 'hideback' }), 'hideback');
  assert.equal(pickSfx({ type: 'return' }), 'hideback');
  assert.equal(pickSfx({ type: 'expose' }), 'expose');
  assert.equal(pickSfx({ type: 'hide' }), 'hide');
  assert.equal(pickSfx({ type: 'unhide' }), 'hide');
  assert.equal(pickSfx({ type: 'search' }), 'search');
  assert.equal(pickSfx({ type: 'end', winner: 'cops' }, 'cop'), 'win');
  assert.equal(pickSfx({ type: 'end', winner: 'cops' }, 'thief'), 'lose');
  assert.equal(pickSfx({ type: 'nope' }), null);
  assert.equal(pickSfx(null), null);
});

test('AudioContext が無い環境でも AudioEngine は落ちない（オフライン安全）', () => {
  const audio = new AudioEngine();
  assert.equal(audio.available, false);
  assert.equal(audio.play('tap'), false);
  audio.startMusic();
  audio.stopMusic();
  audio.setEnabled(false);
  audio.setEnabled(true);
  assert.equal(new AudioEngine({ enabled: false }).enabled, false);
});

// ---- 言語（日本語・英語＋12言語の土台） ---------------------------------
test('14言語（日本語・英語＋12）が並び、どのキーも ja/en が揃っている', () => {
  assert.equal(LANGS.length, 14);
  assert.equal(LANGS[0].id, 'ja');
  assert.equal(LANGS[1].id, 'en');
  assert.equal(isLang('ja'), true);
  assert.equal(isLang('de'), true);
  assert.equal(isLang('xx'), false);

  const missing = Object.entries(STRINGS)
    .filter(([, v]) => !v.ja || !v.en)
    .map(([k]) => k);
  assert.deepEqual(missing, [], `ja/en が欠けているキー: ${missing.join(',')}`);

  assert.equal(t('btn.start', 'ja'), 'ゲームスタート');
  assert.equal(t('btn.start', 'en'), 'Start game');
  assert.equal(t('btn.start', 'de'), 'Start game', '未翻訳は英語へフォールバック');
  assert.equal(t('time.5', 'ko'), '5분', '主要言語は個別翻訳');
  assert.equal(t('no.such.key', 'ja'), 'no.such.key');
});

// Build 5 の新機能テスト
//   2回目・バックグラウンド復帰後に音が無音のまま戻らないバグの修正（AudioContext の復帰・作り直し・
//   BGM 予約の継続）／頭上の識別タグの拡大とコントラスト／
//   人狼警察の解錠で救出された泥棒がその場で震えて固まるバグの修正／
//   救出された側の「5秒間は次の仲間を助けられない」ルール／
//   スパイ発覚後の拘束 15秒 → 10秒／お宝を戻すクールタイム 36秒 → 5秒／
//   Build 5 ワークフローとビルド番号
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Game, ROLE, MAP, CFG, JAIL_SLOTS } from '../www/src/core.js';
import { STRINGS, t } from '../www/src/i18n.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const take = (g, pred) => g.agents.find(pred);

function park(g, keep = []) {
  for (const a of g.agents) {
    if (keep.includes(a) || a.state !== 'free') continue;
    a.x = 73;
    a.z = 73;
    a.path = null;
  }
}

function jail(g, agent, at = g.t) {
  const slot = g.freeJailSlot();
  agent.state = 'jailed';
  agent.jailSlot = slot;
  agent.jailedAt = at;
  agent.hidden = false;
  agent.carrying = null;
  agent.x = JAIL_SLOTS[slot].x;
  agent.z = JAIL_SLOTS[slot].z;
  return slot;
}

// ---- 1. 音が止まったまま戻らないバグ -------------------------------------
// Node には Web Audio が無いので、iOS の状態遷移（suspended / interrupted / closed）を
// まねる最小の偽 AudioContext を作って、AudioEngine の復帰ロジックを検証する。

class FakeParam {
  constructor(v) {
    this.value = v;
  }
  setValueAtTime(v) {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v) {
    this.value = v;
    return this;
  }
}

class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.out = [];
  }
  connect(n) {
    this.out.push(n);
    return n;
  }
  disconnect() {}
}

class FakeAudioContext {
  constructor() {
    this.state = 'suspended'; // iOS は最初 suspended で作られる
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.destination = new FakeNode(this, 'destination');
    this.notes = 0; // start() された発音ノード数
    this.resumeCalls = 0;
    this.resumeWorks = true;
    this.closed = false;
  }
  _track(node) {
    this._nodes.push(node);
    return node;
  }
  get _nodes() {
    if (!this.__nodes) this.__nodes = [];
    return this.__nodes;
  }
  createGain() {
    const n = new FakeNode(this, 'gain');
    n.gain = new FakeParam(1);
    return this._track(n);
  }
  createOscillator() {
    const n = new FakeNode(this, 'osc');
    n.frequency = new FakeParam(440);
    n.type = 'sine';
    n.start = () => {
      this.notes += 1;
    };
    n.stop = () => {};
    return this._track(n);
  }
  createBuffer(channels, length, rate) {
    return {
      length,
      sampleRate: rate,
      numberOfChannels: channels,
      getChannelData: () => new Float32Array(length),
    };
  }
  createBufferSource() {
    const n = new FakeNode(this, 'buffer');
    n.start = () => {
      this.notes += 1;
    };
    n.stop = () => {};
    return this._track(n);
  }
  createBiquadFilter() {
    const n = new FakeNode(this, 'filter');
    n.frequency = new FakeParam(1000);
    n.type = 'lowpass';
    return this._track(n);
  }
  resume() {
    this.resumeCalls += 1;
    if (this.resumeWorks && (this.state === 'suspended' || this.state === 'interrupted')) {
      this.state = 'running';
    }
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    this.closed = true;
    return Promise.resolve();
  }
}

async function makeAudio() {
  const created = [];
  globalThis.window = {
    AudioContext: class extends FakeAudioContext {
      constructor() {
        super();
        created.push(this);
      }
    },
  };
  const { AudioEngine } = await import('../www/src/audio.js');
  const audio = new AudioEngine({});
  return { audio, created, ctx: () => audio.ctx };
}

test('2回目・バックグラウンド復帰後も BGM と効果音が鳴り続ける（AudioContext の復帰）', async () => {
  const { audio } = await makeAudio();
  // 1回目のタップ: suspended → running になり、BGM の音符が積まれる
  audio.unlock();
  assert.equal(audio.ctx.state, 'running', 'タップで AudioContext が起きない');
  audio.startMusic();
  audio.ctx.currentTime = 1;
  audio.tick(1000);
  const first = audio.ctx.notes;
  assert.ok(first > 0, 'BGM が鳴っていない');

  // 2回目のプレイ相当: iOS が interrupted にして、resume も通らない状態
  audio.ctx.state = 'interrupted';
  audio.ctx.resumeWorks = false;
  audio.ctx.currentTime += 4;
  const before = audio.ctx.notes;
  audio.tick(2000);
  assert.equal(audio.ctx.notes, before, '止まっている間に音を積んでいる');

  // 見張り（tick）が resume を試み、だめなら AudioContext ごと作り直す
  const old = audio.ctx;
  for (let i = 1; i <= 6; i++) audio.tick(2000 + i * 900);
  assert.notEqual(audio.ctx, old, 'interrupted から戻らない時に AudioContext を作り直していない');
  assert.equal(old.closed, true, '古い AudioContext を閉じていない');
  assert.equal(audio.ctx.state, 'running', '作り直した AudioContext が起きていない');

  // 復帰後は BGM がまた鳴る（無音のままにならない）
  const after = audio.ctx.notes;
  audio.ctx.currentTime += 1;
  audio.tick(20000);
  assert.ok(audio.ctx.notes > after, '復帰後に BGM が鳴り直さない');
  audio.stopMusic(); // BGM の setInterval を止めてテストを終わらせる
});

test('閉じた（closed）AudioContext は作り直し、効果音も復帰後に1回鳴らす', async () => {
  const { audio } = await makeAudio();
  audio.unlock();
  audio.startMusic();
  const first = audio.ctx;

  // 画面収録や長時間のバックグラウンドで閉じられるケース
  await first.close();
  assert.equal(audio.ctx.state, 'closed');
  const next = audio.ensureCtx();
  assert.notEqual(next, first, '閉じた AudioContext を使い続けている');
  next.resume();
  audio.ctx.currentTime = 2;
  audio.tick(30000);

  // 鳴らせない状態で押された音は、復帰した直後に1回だけ鳴る
  next.state = 'suspended';
  next.resumeWorks = false;
  const before = next.notes;
  assert.equal(audio.play('arrest'), false, '止まっている間は音を積まない');
  next.resumeWorks = true;
  audio.tick(31000);
  assert.equal(next.state, 'running');
  audio.tick(31100);
  assert.ok(next.notes > before, '復帰後に押した効果音が鳴らない');
  audio.stopMusic();
});

test('長く止まった後の BGM は、過去にたまった音符をまとめて鳴らさない', async () => {
  const { audio } = await makeAudio();
  audio.unlock();
  audio.startMusic();
  const ctx = audio.ctx;
  ctx.currentTime = 1;
  audio.tick(1000);
  const base = ctx.notes;
  // タイマーが間引かれて予定が 10 秒ほど過去に取り残された状態を作る
  audio._nextNoteTime = ctx.currentTime - 10;
  ctx.currentTime += 10;
  audio.tick(11000);
  const burst = ctx.notes - base;
  assert.ok(burst < 40, `過去の音符をまとめて鳴らしている (${burst})`);
  assert.ok(audio._nextNoteTime > ctx.currentTime - 0.3, 'BGM の予定が今に合っていない');
  audio.stopMusic();
});

test('メインループが音の見張り（audio.tick）と復帰イベントを持っている', () => {
  const js = read('www/src/main.js');
  assert.match(js, /audio\.tick\(now\)/);
  assert.match(js, /visibilitychange/);
  assert.match(js, /pageshow/);
  assert.match(js, /audio\.revive\(\)/);
  const audioJs = read('www/src/audio.js');
  assert.match(audioJs, /revive\(/);
  assert.match(audioJs, /_rebuild\(/);
  assert.match(audioJs, /state === 'closed'/);
});

// ---- 2. 頭上の識別タグ（YOU / A〜J）を読みやすい大きさに ------------------
test('頭上タグは Build 4 より大きく、縁取り＋影で読める（プレイは邪魔しない高さ）', () => {
  const js = read('www/src/render.js');
  const m = /tag\.scale\.set\(a\.isPlayer \? ([\d.]+) : ([\d.]+), a\.isPlayer \? ([\d.]+) : ([\d.]+)/.exec(
    js,
  );
  assert.ok(m, 'タグの大きさ指定が見つからない');
  const [playerW, mateW, playerH, mateH] = m.slice(1).map(Number);
  assert.ok(playerW >= 1.2 && playerH >= 0.6, `自分のタグが小さい (${playerW}x${playerH})`);
  assert.ok(mateW >= 0.8 && mateH >= 0.4, `仲間のタグが小さい (${mateW}x${mateH})`);
  assert.ok(playerH <= 0.9 && mateH <= 0.6, '大きすぎて視界を塞ぐ');
  // 縁取り（strokeText 相当の stroke）と影で、明るい道路でも読める
  assert.match(js, /g\.strokeStyle = 'rgba\(255,255,255/);
  assert.match(js, /g\.shadowColor/);
  assert.match(js, /c\.width = 320/);
  // 頭上に出す位置は頭（1.67m）より上
  const pos = /tag\.position\.set\(0, a\.isPlayer \? ([\d.]+) : ([\d.]+), 0\)/.exec(js);
  assert.ok(pos, 'タグの高さ指定がない');
  assert.ok(Number(pos[1]) > 2.1 && Number(pos[2]) > 2.0, '頭に重なっている');
});

// ---- 3. 人狼警察が解錠で救出した泥棒が、その場で震えて固まらない ----------
test('人狼警察の解錠で救出された泥棒は、その場で震えずに逃げ出す（境目での振動バグ）', () => {
  const g = new Game({
    seed: 4,
    players: 8,
    playerRole: 'cop',
    playerSpy: 'always',
    spyMode: 'both',
  });
  const spy = g.player;
  assert.equal(spy.role, ROLE.COP_SPY);
  const thieves = g.agents.filter((a) => a.role === ROLE.THIEF);
  park(g, [spy]);
  jail(g, thieves[0]);
  jail(g, thieves[1]);

  // 牢屋の前で解錠（逮捕されないよう、警官は遠くにいる）
  spy.x = MAP.jailDoor.x;
  spy.z = MAP.jailDoor.z - 1;
  g.setPlayerMove(0, 0);
  g.setAction(true);
  let freed = null;
  for (let i = 0; i < 60 * 4 && !freed; i++) {
    g.step(1 / 60);
    freed = thieves.find((t) => t.state === 'free') || null;
  }
  assert.ok(freed, '解錠で救出されない');
  g.setAction(false);
  // 人狼警察は解錠した場所（救出された泥棒のすぐ近く）に残る = 報告された状況
  const start = { x: freed.x, z: freed.z };

  // 10秒間の動きを見る（0.25秒ごと）
  const pts = [];
  for (let i = 0; i < 60 * 10; i++) {
    g.step(1 / 60);
    if (i % 15 === 0) pts.push({ x: freed.x, z: freed.z });
  }
  let moved = 0;
  let reverses = 0;
  for (let i = 1; i < pts.length; i++) {
    moved += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (i >= 2) {
      const v1 = { x: pts[i - 1].x - pts[i - 2].x, z: pts[i - 1].z - pts[i - 2].z };
      const v2 = { x: pts[i].x - pts[i - 1].x, z: pts[i].z - pts[i - 1].z };
      const m1 = Math.hypot(v1.x, v1.z);
      const m2 = Math.hypot(v2.x, v2.z);
      if (m1 > 0.05 && m2 > 0.05 && (v1.x * v2.x + v1.z * v2.z) / (m1 * m2) < -0.5) reverses += 1;
    }
  }
  assert.ok(moved > 12, `救出された泥棒がほとんど動かない (${moved.toFixed(1)}m)`);
  assert.ok(reverses <= 8, `その場で震えている（向きの反転 ${reverses}回）`);
  // 2秒以内に救出地点から離れる
  const early = Math.max(
    ...pts.slice(0, 9).map((p) => Math.hypot(p.x - start.x, p.z - start.z)),
  );
  assert.ok(early > 1.5, '救出地点から動き出さない');
  // 牢屋に入る前の経路・回り込みを持ち越していない
  assert.equal(freed.detour, null);
  assert.equal(freed.stuckT, 0);
});

test('救出された泥棒の AI 状態（経路・回り込み・引っかかり）はリセットされる', () => {
  const g = new Game({ seed: 21, players: 8, playerRole: 'cop', playerSpy: 'never', spyMode: 'none' });
  const thief = g.agents.find((a) => a.role === ROLE.THIEF);
  jail(g, thief);
  thief.detour = { x: 10, z: 10, t: 1 };
  thief.stuckT = 0.9;
  thief.pathTarget = { x: 1, z: 1 };
  const freed = g.freeOne('unlock', g.agents.find((a) => a.role === ROLE.COP));
  assert.equal(freed, thief);
  assert.equal(thief.detour, null, '古い回り込み先が残っている');
  assert.equal(thief.stuckT, 0, '引っかかり時間が残っている');
  assert.equal(thief.pathTarget, null, '古い経路目標が残っている');
});

// ---- 4. 救出された側は「逃走から5秒後」まで次の仲間を助けられない --------
test('救出された泥棒は、逃走から5秒たつまで次の仲間を助けられない', () => {
  assert.equal(CFG.rescueTouchCd, 5);
  const g = new Game({ seed: 33, players: 8, playerRole: 'cop', playerSpy: 'never', spyMode: 'none' });
  const [a, b, c] = g.agents.filter((x) => x.role === ROLE.THIEF);
  park(g, [a, b, c]);
  jail(g, a);
  jail(g, b);

  // 解錠で a を助ける
  g.freeOne('unlock', g.agents.find((x) => x.role === ROLE.COP));
  assert.equal(a.state, 'free');
  assert.equal(a.touchCd, 5, '救出された側に5秒のクールタイムが入っていない');

  // a が b に触れても、5秒たつまでは救出できない
  a.x = b.x + 0.8;
  a.z = b.z;
  assert.equal(g.touchRescue(a, b), false, 'クールタイム中にタッチ救出できてしまう');
  assert.equal(b.state, 'jailed');

  // 5秒たてば助けられる
  g.stepSeconds(5.1);
  a.x = b.x + 0.8;
  a.z = b.z;
  assert.equal(g.touchRescue(a, b), true, '5秒後もタッチ救出できない');
  assert.equal(b.state, 'free');
});

test('牢屋前の長押し救出も、助けられた側は5秒たつまで使えない', () => {
  const g = new Game({ seed: 34, players: 8, playerRole: 'thief', playerSpy: 'never', spyMode: 'none' });
  const player = g.player;
  assert.equal(player.role, ROLE.THIEF);
  const mate = g.agents.find((x) => x.role === ROLE.THIEF && x !== player);
  park(g, [player, mate]);
  jail(g, mate, 0);
  player.touchCd = 4;
  player.x = MAP.jailDoor.x;
  player.z = MAP.jailDoor.z - 1;
  g.setPlayerMove(0, 0);
  g.setAction(true);
  g.stepSeconds(2.2);
  assert.equal(mate.state, 'jailed', 'クールタイム中なのに長押し救出できてしまう');
  g.stepSeconds(4.0);
  assert.equal(mate.state, 'free', '5秒後に長押し救出できない');
});

// ---- 5. スパイ発覚後の拘束は 15秒 → 10秒 ----------------------------------
test('スパイ発覚後の拘束は 10秒（15秒の表記が残っていない）', () => {
  assert.equal(CFG.detainTime, 10);
  const g = new Game({ seed: 7, players: 8, playerRole: 'cop', playerSpy: 'always', spyMode: 'both' });
  const spy = g.player;
  g.expose(spy);
  assert.equal(spy.detainLeft, 10);
  assert.match(g.events.at(-1).label, /10秒拘束/);
  g.stepSeconds(9.5);
  assert.equal(spy.state, 'detained', '10秒より前に寝返っている');
  g.stepSeconds(1);
  assert.equal(spy.role, ROLE.COP, '10秒後に寝返らない');

  // 画面の文言（ja/en）も10秒でそろえる
  for (const key of [
    'rule.spy',
    'role.detainedTag',
    'role.copSpy.desc',
    'role.thiefSpy.desc',
    'role.spyUnified.desc',
    'howto.spyDesc',
    'howto.betrayDesc',
  ]) {
    assert.ok(STRINGS[key], `${key} がない`);
    assert.ok(!/15\s*秒|15초|15s|15 seconds/.test(STRINGS[key].ja || ''), `${key}/ja に15秒が残る`);
    assert.ok(!/15초|15s|15 seconds/.test(STRINGS[key].en || ''), `${key}/en に15秒が残る`);
  }
  assert.match(t('role.detainedTag', 'ja'), /10秒/);
  assert.match(t('role.detainedTag', 'en'), /10s/);
  assert.match(read('www/index.html'), /10秒拘束/);
  assert.ok(!/15秒拘束/.test(read('www/index.html')));
  assert.ok(!/15秒拘束/.test(read('www/src/i18n.js')));
});

// ---- 6. お宝を戻すクールタイムは 5秒 --------------------------------------
test('お宝を戻したら5秒後に次の1個を戻せる（36秒→5秒）', () => {
  assert.equal(CFG.returnCooldown, 5);
  const g = new Game({ seed: 65, players: 8, playerRole: 'thief', playerSpy: 'always', spyMode: 'thieves' });
  const spy = g.player;
  assert.equal(spy.role, ROLE.THIEF_SPY);
  for (const t of g.agents) if (t !== spy) t.state = 'detained'; // 他の動きを止めて観察する
  g.treasures[0].state = 'secured';
  g.treasures[1].state = 'secured';
  g.treasures[2].state = 'secured';
  spy.x = MAP.gate.x;
  spy.z = MAP.gate.z + 2;
  g.setPlayerMove(0, 0);
  g.setAction(true);
  g.stepSeconds(1.7);
  assert.equal(g.securedCount, 2, '1つ戻せていない');
  assert.ok(spy.ai.returnCd > 4, '5秒のクールタイムが入っていない');
  g.stepSeconds(2.0);
  assert.equal(g.securedCount, 2, 'クールタイム中に戻してしまう');
  g.stepSeconds(5.0);
  assert.equal(g.securedCount, 1, '5秒たっても次の1個を戻せない');
  // 画面のボタンに残り秒数を出す
  assert.match(read('www/src/main.js'), /p\.ai\.returnCd > 0/);
});

// ---- Build 5 の出荷準備 ---------------------------------------------------
test('Build 5 のワークフロー定義（1行目がビルド名コメント・BUILD_NUMBER と preflight が5）', () => {
  const yml = read('docs/ios-testflight-build5.yml');
  const lines = yml.split('\n');
  assert.equal(lines[0], '# DOROKEI iOS TestFlight Build 5', '1行目がビルド名コメントでない');
  assert.match(yml, /BUILD_NUMBER: "5"/);
  assert.match(yml, /CURRENT_PROJECT_VERSION = 5;/);
  assert.ok(!/CURRENT_PROJECT_VERSION = 4;/.test(yml));
  assert.match(yml, /dorokei-testflight-build5-evidence/);
  assert.match(yml, /detainTime: 10/);
  assert.match(yml, /returnCooldown: 5/);
  assert.match(yml, /rescueTouchCd: 5/);
  assert.match(yml, /test -f test\/build5\.test\.js/);
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  const versions = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => Number(m[1]));
  assert.equal(versions.length, 2, 'ビルド番号の指定が2箇所でない');
  assert.deepEqual(versions, [5, 5], 'ビルド番号が5になっていない');
});

test('npm test に Build 5 のテストが入っている', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.test, /test\/build5\.test\.js/);
});

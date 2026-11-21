// Build 6 の新機能テスト
//   1. ホーム画面（バックグラウンド）往復で音が出なくなる問題の徹底対策
//      - iOS WKWebView は state が 'running' のまま currentTime だけ止まることがある。
//        時計の停止を検知して AudioContext ごと作り直す／戻った時に測り直す。
//   2. 「泥棒に触れているのに確保できない」の修正
//      - 確保判定 1.9 → 2.35m／押し合い（separateAgents）の後にもう一度判定／
//        確保クールタイム 5.5 → 2.0秒
//   3. スティック上の紫の説明バナー（役ヒント）の ON/OFF と保存
//   4. 勝利条件の穴：本物の泥棒が全員牢屋で、残りが正体を隠したスパイだけになったら
//      警察の勝利で試合を終える（時間切れまで詰む問題）＋逆陣営の点検
//   5. Build 6 の出荷準備（pbxproj・index.html・docs/ios-testflight-build6.yml）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Game, ROLE, CFG, MAP, JAIL_SLOTS } from '../www/src/core.js';
import { STRINGS, t } from '../www/src/i18n.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function newGame(opts = {}) {
  return new Game({
    seed: 5,
    players: 8,
    playerRole: 'cop',
    playerSpy: 'never',
    spyMode: 'none',
    ...opts,
  });
}

/** 邪魔なキャラを街の隅へ（警察と泥棒は離して置く） */
function clear(g, keep = []) {
  let copI = 0;
  let thiefI = 0;
  for (const a of g.agents) {
    if (keep.includes(a) || a.state !== 'free') continue;
    if (a.looks === 'cop') {
      a.x = 73 - (copI++ % 3) * 3.5;
      a.z = -73 + Math.floor(copI / 3) * 3.5;
    } else {
      a.x = -73 + (thiefI++ % 3) * 3.5;
      a.z = -73 + Math.floor(thiefI / 3) * 3.5;
    }
    a.path = null;
    a.pathTarget = null;
  }
}

function jail(g, agent) {
  const slot = g.freeJailSlot();
  agent.state = 'jailed';
  agent.jailSlot = slot;
  agent.jailedAt = g.t;
  agent.hidden = false;
  agent.carrying = null;
  agent.path = null;
  agent.x = JAIL_SLOTS[slot].x;
  agent.z = JAIL_SLOTS[slot].z;
  return slot;
}

// ---- 1. 音：currentTime が止まったまま（running なのに無音） -----------------
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
  }
  connect(n) {
    return n;
  }
  disconnect() {}
}

class FrozenClockContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.destination = new FakeNode(this, 'destination');
    this.notes = 0;
    this.closed = false;
  }
  createGain() {
    const n = new FakeNode(this, 'gain');
    n.gain = new FakeParam(1);
    return n;
  }
  createOscillator() {
    const n = new FakeNode(this, 'osc');
    n.frequency = new FakeParam(440);
    n.type = 'sine';
    n.start = () => {
      this.notes += 1;
    };
    n.stop = () => {};
    return n;
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
    const n = new FakeNode(this, 'buf');
    n.start = () => {
      this.notes += 1;
    };
    n.stop = () => {};
    return n;
  }
  createBiquadFilter() {
    const n = new FakeNode(this, 'filter');
    n.frequency = new FakeParam(1000);
    n.type = 'lowpass';
    return n;
  }
  resume() {
    // iOS の「running のまま固まる」症状をまねる：running なら resume しても何も変わらない
    if (this.state === 'suspended' || this.state === 'interrupted') this.state = 'running';
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
    AudioContext: class extends FrozenClockContext {
      constructor() {
        super();
        created.push(this);
      }
    },
  };
  const { AudioEngine } = await import('../www/src/audio.js');
  const audio = new AudioEngine({});
  return { audio, created };
}

test('音: currentTime が止まったら AudioContext を作り直す（running のまま無音）', async () => {
  const { audio } = await makeAudio();
  audio.unlock();
  audio.startMusic();
  audio.ctx.currentTime = 2;
  audio.tick(1000);
  const first = audio.ctx;
  assert.equal(first.state, 'running');
  const before = first.notes;

  // ホーム画面から戻った後：state は running のまま currentTime が進まない
  audio.tick(1300); // まだ様子見（600ms 未満）
  assert.equal(audio.ctx, first, '様子見の間に作り直している');
  audio.tick(1800); // 800ms 止まったまま → 作り直す
  assert.notEqual(audio.ctx, first, '時計が止まったままなのに作り直していない');
  assert.equal(first.closed, true, '古い AudioContext を閉じていない');
  assert.equal(audio.ctx.state, 'running', '作り直した AudioContext が起きていない');

  // 作り直したあとも BGM が鳴る（無音のまま放置しない）
  audio.ctx.currentTime = 5;
  audio.tick(2600);
  assert.ok(audio.ctx.notes > 0, '作り直したあとに BGM が鳴っていない');
  assert.ok(before >= 0);
  audio.stopMusic(); // BGM の setInterval を止めてテストを終わらせる
});

test('音: 時計が進んでいる時は作り直さない（無駄な再生成をしない）', async () => {
  const { audio, created } = await makeAudio();
  audio.unlock();
  audio.startMusic();
  const first = audio.ctx;
  for (let i = 0; i < 20; i++) {
    first.currentTime += 0.25;
    audio.tick(1000 + i * 250);
  }
  assert.equal(audio.ctx, first, '正常なのに AudioContext を作り直している');
  assert.equal(created.length, 1);
  audio.stopMusic();
});

test('音: バックグラウンドから戻ったら測り直し、止まっていれば作り直す', async () => {
  const { audio } = await makeAudio();
  audio.unlock();
  audio.startMusic();
  audio.ctx.currentTime = 3;
  audio.tick(1000);
  const old = audio.ctx;
  // 隠れている間に currentTime が止まる
  audio.resumeFromBackground(9000);
  assert.notEqual(audio.ctx, old, '復帰時に AudioContext を作り直していない');
  assert.equal(audio.ctx.state, 'running');
  assert.ok(audio.clockStalled(9100) === false, '作り直した直後に止まっている判定になっている');
  audio.stopMusic();
});

test('音: 復帰用の入口が main.js から呼ばれている', () => {
  const js = read('www/src/main.js');
  assert.match(js, /audio\.resumeFromBackground\(\)/);
  assert.match(js, /visibilitychange/);
  // ネイティブ側でも AVAudioSession を取り直す
  const swift = read('ios/App/App/AppDelegate.swift');
  assert.match(swift, /import AVFoundation/);
  assert.match(swift, /setActive\(true\)/);
  assert.match(swift, /applicationDidBecomeActive/);
});

// ---- 2. 触れているのに確保できないバグ -------------------------------------
test('確保: 判定距離を体の大きさより広くとってある（触れて見える距離で捕まる）', () => {
  assert.ok(CFG.arrestRange >= 2.3, `確保距離が狭すぎる (${CFG.arrestRange})`);
  assert.ok(CFG.arrestRange > CFG.radius * 2 + 0.8, '体（半径0.62）が重なる距離より判定が狭い');
  assert.ok(CFG.arrestCooldown <= 2.0, `確保クールタイムが長すぎる (${CFG.arrestCooldown})`);
});

test('確保: 2.2m（旧判定1.9では届かない距離）で触れていれば1フレームで確保できる', () => {
  const g = newGame();
  const cop = g.agents.find((a) => a.role === ROLE.COP);
  const thief = g.agents.find((a) => a.role === ROLE.THIEF);
  clear(g, [cop, thief]);
  thief.x = 0;
  thief.z = 0;
  thief.path = null;
  cop.x = 2.2;
  cop.z = 0;
  cop.path = null;
  cop.arrestCd = 0;
  assert.equal(g.canArrest(cop, thief), true);
  assert.equal(g.resolveArrests() >= 1, true, '触れているのに確保されない');
  assert.equal(thief.state, 'jailed');
  assert.equal(g.stats.arrests, 1);
});

test('確保: 押し合い（separateAgents）の後にも判定するので、重なりから漏れない', () => {
  const g = newGame();
  const cop = g.agents.find((a) => a.role === ROLE.COP);
  const thief = g.agents.find((a) => a.role === ROLE.THIEF);
  clear(g, [cop, thief]);
  cop.x = 10;
  cop.z = 10;
  cop.arrestCd = 0;
  thief.x = 10.2;
  thief.z = 10.1;
  thief.path = null;
  // 実際のゲームの1フレーム（移動→押し合い→確保判定）
  g.step(1 / 60);
  assert.equal(thief.state, 'jailed', '重なった状態から確保できていない');
});

test('確保: 確保クールタイムは2秒で、その間は次の泥棒を捕まえない／過ぎれば捕まえる', () => {
  const g = newGame();
  const cop = g.agents.find((a) => a.role === ROLE.COP);
  const thieves = g.agents.filter((a) => a.role === ROLE.THIEF);
  clear(g, [cop, thieves[0], thieves[1]]);
  cop.x = 0;
  cop.z = 0;
  cop.arrestCd = 0;
  thieves[0].x = 1.5;
  thieves[0].z = 0;
  g.resolveArrests();
  assert.equal(thieves[0].state, 'jailed');
  assert.ok(Math.abs(cop.arrestCd - 2.0) < 0.001, `確保クールタイムが2秒でない (${cop.arrestCd})`);
  // すぐ隣に次の泥棒が来ても、クールタイム中は確保しない
  thieves[1].x = 1.2;
  thieves[1].z = 0;
  g.resolveArrests();
  assert.equal(thieves[1].state, 'free', 'クールタイム中に確保している');
  // 2秒たてば確保できる
  cop.arrestCd = 0;
  g.resolveArrests();
  assert.equal(thieves[1].state, 'jailed', '2秒たっても次の泥棒を確保できない');
});

test('確保: 救出直後の無敵（immune）は今まで通り守られる', () => {
  const g = newGame();
  const cop = g.agents.find((a) => a.role === ROLE.COP);
  const thief = g.agents.find((a) => a.role === ROLE.THIEF);
  clear(g, [cop, thief]);
  cop.x = 0;
  cop.z = 0;
  cop.arrestCd = 0;
  thief.x = 1.4;
  thief.z = 0;
  thief.immune = 1.0;
  g.resolveArrests();
  assert.equal(thief.state, 'free', '無敵中の泥棒を確保している');
  thief.immune = 0;
  g.resolveArrests();
  assert.equal(thief.state, 'jailed');
});

test('確保: 正体を隠したままの潜入捜査官（FBI）は警察に捕まらない（仕様の確認）', () => {
  const g = newGame({ spyMode: 'thieves' });
  const cop = g.agents.find((a) => a.role === ROLE.COP);
  const fbi = g.agents.find((a) => a.role === ROLE.THIEF_SPY);
  assert.ok(fbi, 'FBI がいない');
  clear(g, [cop, fbi]);
  cop.x = 0;
  cop.z = 0;
  cop.arrestCd = 0;
  fbi.x = 1.0;
  fbi.z = 0;
  g.resolveArrests();
  assert.equal(fbi.state, 'free');
});

// ---- 3. 役ヒント（紫の説明バナー）の ON/OFF --------------------------------
test('役ヒント: 設定の初期値は ON で、ON/OFF が端末に保存される', () => {
  const js = read('www/src/main.js');
  assert.match(js, /spyHint: true/, '初期値が ON になっていない');
  assert.match(js, /function setSpyHint/, '切り替え関数がない');
  assert.match(js, /settings\.spyHint = /);
  assert.match(js, /saveSettings\(\)/, '保存していない');
  const html = read('www/index.html');
  assert.match(html, /id="hintPick"/, 'タイトル設定に切り替えがない');
  assert.match(html, /id="pauseHint"/, 'プレイ中の MENU に切り替えがない');
  assert.match(html, /data-hint="on"/);
  assert.match(html, /data-hint="off"/);
  // バナー自体は設定を見て出し分ける
  assert.match(js, /p\.isSpy && spyHintOn\(\)/);
  // 言語（日本語・英語）の文言がある
  assert.ok(STRINGS['settings.hint'].ja && STRINGS['settings.hint'].en);
  assert.ok(STRINGS['menu.spyHint'].ja && STRINGS['menu.spyHint'].en);
  assert.equal(t('settings.hint', 'ja'), STRINGS['settings.hint'].ja);
});

// ---- 4. 勝利条件の穴（スパイだけ残って詰む） -------------------------------
test('勝利: 本物の泥棒が全員牢屋で残りが未寝返りのFBIだけなら、その時点で警察の勝利', () => {
  // FBI（潜入捜査官）は本当は警察側（team='cop'）なので、泥棒陣営の残りには数えない。
  // つまり本物の泥棒が全員牢屋なら、FBI が自由に歩いていても警察の勝ちで試合を終える。
  const g = newGame({ players: 8, spyMode: 'thieves' });
  const fbi = g.agents.find((a) => a.role === ROLE.THIEF_SPY);
  assert.equal(fbi.team, 'cop', 'FBI の陣営が警察側になっていない');
  const thieves = g.agents.filter((a) => a.role === ROLE.THIEF);
  clear(g, [fbi]);
  for (const th of thieves) jail(g, th);
  g.step(1 / 60);
  assert.equal(g.phase, 'ended', 'FBI だけ残っても試合が終わらない');
  assert.equal(g.winner, 'cops');
  assert.match(g.reason, /泥棒を全員確保した/);
});

test('勝利: 泥棒陣営に残ったのが未発覚の人狼警察（警官の見た目で逮捕できない）だけなら警察の勝利', () => {
  const g = newGame({ players: 8, spyMode: 'cops' });
  const mole = g.agents.find((a) => a.role === ROLE.COP_SPY);
  assert.equal(mole.team, 'thief');
  const thieves = g.agents.filter((a) => a.role === ROLE.THIEF);
  clear(g, [mole]);
  for (const th of thieves) jail(g, th);
  g.step(1 / 60);
  assert.equal(g.phase, 'ended', '逮捕できないスパイだけ残っても試合が終わらない（時間切れまで詰む）');
  assert.equal(g.winner, 'cops');
  assert.match(g.reason, /スパイ/, '理由に「残りはスパイだけ」と出ていない');
});

test('勝利: 寝返り後の元FBIは本物の泥棒なので、自由なら試合は続く（確保すれば終わる）', () => {
  const g = newGame({ players: 8, spyMode: 'thieves' });
  const fbi = g.agents.find((a) => a.role === ROLE.THIEF_SPY);
  const thieves = g.agents.filter((a) => a.role === ROLE.THIEF);
  clear(g, [fbi]);
  for (const th of thieves) jail(g, th);
  // 寝返り済み（見た目どおり泥棒）
  fbi.role = ROLE.THIEF;
  fbi.team = 'thief';
  fbi.isSpy = false;
  fbi.betrayUsed = true;
  g.step(1 / 60);
  assert.equal(g.phase, 'playing', '確保できる泥棒が残っているのに試合が終わっている');
  jail(g, fbi);
  g.step(1 / 60);
  assert.equal(g.phase, 'ended');
  assert.equal(g.winner, 'cops');
});

test('勝利: 正体が発覚して拘束中のスパイがいる間は勝敗を決めない（Build 3 の約束を維持）', () => {
  const g = newGame({ players: 8, spyMode: 'cops' });
  const mole = g.agents.find((a) => a.role === ROLE.COP_SPY);
  const thieves = g.agents.filter((a) => a.role === ROLE.THIEF);
  clear(g, [mole]);
  for (const th of thieves) jail(g, th);
  g.expose(mole, thieves[0]);
  g.checkWin();
  assert.equal(g.phase, 'playing', '拘束中のスパイだけで警察の勝ちにしている');
  g.stepSeconds(CFG.detainTime + 0.3);
  assert.equal(mole.team, 'cop');
  assert.equal(g.phase, 'ended');
  assert.equal(g.winner, 'cops');
});

test('勝利: 人狼警察（見た目警官）だけが自由でも警察の勝利で詰まらない', () => {
  const g = newGame({ players: 8, spyMode: 'cops' });
  const mole = g.agents.find((a) => a.role === ROLE.COP_SPY);
  const thieves = g.agents.filter((a) => a.role === ROLE.THIEF);
  clear(g, [mole]);
  for (const th of thieves) jail(g, th);
  g.step(1 / 60);
  assert.equal(g.phase, 'ended', '人狼警察が残ると試合が終わらない');
  assert.equal(g.winner, 'cops');
});
test('勝利: 泥棒陣営の勝ち（お宝をすべて搬出）は今まで通り成立する', () => {
  const g = newGame({ players: 8, spyMode: 'none' });
  for (const tr of g.treasures) tr.state = 'secured';
  g.step(1 / 60);
  assert.equal(g.phase, 'ended');
  assert.equal(g.winner, 'thieves');
});

test('勝利: 本物の泥棒が1人でも自由なら、時間内は試合を終えない', () => {
  const g = newGame({ players: 8, spyMode: 'both' });
  const thieves = g.agents.filter((a) => a.role === ROLE.THIEF);
  const free = thieves[0];
  clear(g, [free]);
  for (const th of thieves.slice(1)) jail(g, th);
  g.step(1 / 60);
  assert.equal(g.phase, 'playing');
  assert.equal(g.winner, null);
});

// ---- 5. Build 6 の出荷準備 ------------------------------------------------
test('Build 6 のビルド番号（pbxproj 2箇所と index.html 表記）', () => {
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  const versions = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => Number(m[1]));
  assert.equal(versions.length, 2, 'ビルド番号の指定が2箇所でない');
  assert.deepEqual(versions, [6, 6], 'ビルド番号が6になっていない');
  assert.match(read('www/index.html'), /Build 6/);
  assert.ok(!/Build 5/.test(read('www/index.html')), 'Build 5 の表記が残っている');
});

test('Build 6 のワークフロー定義（1行目がビルド名コメント・BUILD_NUMBER と preflight が6）', () => {
  const yml = read('docs/ios-testflight-build6.yml');
  const lines = yml.split('\n');
  assert.equal(lines[0], '# DOROKEI iOS TestFlight Build 6', '1行目がビルド名コメントでない');
  assert.match(yml, /BUILD_NUMBER: "6"/);
  assert.match(yml, /CURRENT_PROJECT_VERSION = 6;/);
  assert.ok(!/CURRENT_PROJECT_VERSION = 5;/.test(yml));
  assert.match(yml, /dorokei-testflight-build6-evidence/);
  assert.match(yml, /detainTime: 10/);
  assert.match(yml, /arrestCooldown: 2\.0/);
  assert.match(yml, /test -f test\/build6\.test\.js/);
});

test('npm test に Build 6 のテストが入っている', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.test, /test\/build6\.test\.js/);
});

test('街のデータは壊れていない（牢屋・ゲート・お宝の位置）', () => {
  assert.ok(MAP.jail && MAP.gate && MAP.jailDoor);
  assert.equal(MAP.treasureSpots.length >= 5, true);
});

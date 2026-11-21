// Build 4 の新機能テスト
//   参加人数（4〜10人）と警察・泥棒の内訳／人数に応じたお宝数／
//   壁・角で引っかからない移動／キャラ同士の重なり防止／
//   タッチ救出と「プレイヤー優先→先に捕まった順」の救出優先度／救出後の2.5秒無敵＋加速／
//   スパイ作業中の接近アラート／人狼警察の往復振動の修正／
//   ビルのオクルージョン透過・ゲートの光の柱・牢屋の見通し・POLICEロゴ・識別タグ・
//   iOSのコピー／長押し選択の無効化／Build 4 ワークフロー
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  Game,
  ROLE,
  MAP,
  CFG,
  JAIL_SLOTS,
  splitTeams,
  treasureCountFor,
} from '../www/src/core.js';
import { STRINGS, t } from '../www/src/i18n.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function makeGame(opts = {}) {
  return new Game({ seed: 42, cfg: { arrestRange: 0 }, ...opts });
}

const take = (g, pred) => g.agents.find(pred);
const freeAgents = (g) => g.agents.filter((a) => a.state === 'free');

function park(g, keep = []) {
  for (const a of g.agents) {
    if (keep.includes(a) || a.state !== 'free') continue;
    a.x = 73;
    a.z = 73;
    a.path = null;
  }
}

/** 手動で泥棒を牢屋へ入れる（arrestを介さずに収容順を制御したい時用） */
function jail(g, agent, t = g.t) {
  const slot = g.freeJailSlot();
  agent.state = 'jailed';
  agent.jailSlot = slot;
  agent.jailedAt = t;
  agent.hidden = false;
  agent.carrying = null;
  agent.x = JAIL_SLOTS[slot].x;
  agent.z = JAIL_SLOTS[slot].z;
  return slot;
}

// ---- 参加人数 -------------------------------------------------------------
test('参加人数 4〜10人から警察・泥棒の内訳を自動で決める（警察1以上・泥棒2以上）', () => {
  const table = {
    4: [1, 3],
    5: [2, 3],
    6: [2, 4],
    7: [3, 4],
    8: [3, 5],
    9: [4, 5],
    10: [4, 6],
  };
  for (const [n, [cops, thieves]] of Object.entries(table)) {
    const s = splitTeams(Number(n));
    assert.equal(s.cops, cops, `${n}人の警察`);
    assert.equal(s.thieves, thieves, `${n}人の泥棒`);
    assert.equal(s.total, Number(n));
    assert.ok(s.cops >= 1 && s.thieves >= 2, `${n}人でも警察1以上・泥棒2以上`);
  }
  // 範囲外は丸める
  assert.deepEqual(splitTeams(2), { cops: 1, thieves: 3, total: 4 });
  assert.deepEqual(splitTeams(99), { cops: 4, thieves: 6, total: 10 });
  assert.equal(CFG.maxPlayers, 10);
  assert.deepEqual(CFG.playerOptions, [4, 5, 6, 7, 8, 9, 10]);
  // 既定は従来どおり 8人（警察3・泥棒5）
  assert.deepEqual(splitTeams(8), { cops: 3, thieves: 5, total: 8 });
});

test('10人（警察4・泥棒6）でも全員が破綻なく並ぶ（名前・初期位置・牢屋スロット）', () => {
  const g = new Game({ seed: 5, players: 10 });
  assert.equal(g.players, 10);
  assert.equal(g.agents.length, 10);
  const cops = g.agents.filter((a) => a.looks === 'cop');
  const thieves = g.agents.filter((a) => a.looks === 'thief');
  assert.equal(cops.length, 4);
  assert.equal(thieves.length, 6);
  assert.equal(g.counts().cops + g.counts().thieves, 10);

  // 名前（識別タグの元）が全員ユニークで、同じ見た目の中でも重ならない
  assert.equal(new Set(g.agents.map((a) => a.name)).size, 10);
  assert.equal(new Set(cops.map((a) => a.name.slice(-1))).size, 4);
  assert.equal(new Set(thieves.map((a) => a.name.slice(-1))).size, 6);

  // 開始位置が壁の中ではなく、全員が街の中にいる
  for (const a of g.agents) {
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z));
    assert.ok(a.x > MAP.bounds.minX && a.x < MAP.bounds.maxX);
    assert.ok(a.z > MAP.bounds.minZ && a.z < MAP.bounds.maxZ);
    for (const o of g.colliders) {
      const inside =
        Math.abs(a.x - o.x) < o.w / 2 + CFG.radius - 0.01 &&
        Math.abs(a.z - o.z) < o.d / 2 + CFG.radius - 0.01;
      assert.equal(inside, false, `${a.name} が建物の中から始まっている`);
    }
  }
  // 同陣営の開始位置が同じ場所に重なっていない
  for (const group of [cops, thieves]) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const d = Math.hypot(group[i].x - group[j].x, group[i].z - group[j].z);
        assert.ok(d > 0.9, `${group[i].name} と ${group[j].name} の開始位置が重なっている (${d.toFixed(2)}m)`);
      }
    }
  }

  // 牢屋は泥棒6＋拘束スパイでも足りる
  assert.ok(JAIL_SLOTS.length >= 7);
  const slots = new Set();
  for (const th of g.agents.filter((a) => a.role === ROLE.THIEF || a.role === ROLE.THIEF_SPY)) {
    th.state = 'jailed';
    th.jailSlot = g.freeJailSlot();
    slots.add(th.jailSlot);
  }
  assert.equal(slots.size, g.agents.filter((a) => a.team === 'thief').length, '牢屋のスロットが重複した');
});

test('人数が増えても AI が10人で120秒間破綻しない（NaNなし・街から出ない）', () => {
  const g = new Game({ seed: 20261121, players: 10, autoplay: true });
  g.stepSeconds(120);
  for (const a of g.agents) {
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z), `${a.name} が NaN`);
    assert.ok(a.x > MAP.bounds.minX && a.x < MAP.bounds.maxX, `${a.name} が街の外`);
    assert.ok(a.z > MAP.bounds.minZ && a.z < MAP.bounds.maxZ, `${a.name} が街の外`);
  }
  assert.ok(['playing', 'ended'].includes(g.phase));
});

// ---- お宝の数 -------------------------------------------------------------
test('人数に合わせてお宝の数が変わる（4人=3個 / 6人=4個 / 8〜10人=5個）', () => {
  assert.equal(treasureCountFor(4), 3);
  assert.equal(treasureCountFor(5), 3);
  assert.equal(treasureCountFor(6), 4);
  assert.equal(treasureCountFor(7), 4);
  assert.equal(treasureCountFor(8), 5);
  assert.equal(treasureCountFor(9), 5);
  assert.equal(treasureCountFor(10), 5);

  for (const n of [4, 6, 8, 10]) {
    const g = new Game({ seed: 3, players: n });
    const want = treasureCountFor(n);
    assert.equal(g.cfg.treasureRequired, want);
    assert.equal(g.cfg.treasureCount, want);
    assert.equal(g.treasures.length, want);
    assert.equal(g.counts().required, want);
  }
});

test('4人（お宝3個）は3個すべて運べば泥棒の勝ち、2個だと時間切れまで勝負がつかない', () => {
  const g = new Game({ seed: 8, players: 4 });
  assert.equal(g.cfg.treasureRequired, 3);
  assert.equal(g.treasures.length, 3);
  g.treasures[0].state = 'secured';
  g.treasures[1].state = 'secured';
  g.checkWin();
  assert.equal(g.phase, 'playing', '2/3ではまだ勝負がつかない');
  g.treasures[2].state = 'secured';
  g.checkWin();
  assert.equal(g.phase, 'ended');
  assert.equal(g.winner, 'thieves');

  // 時間切れで1つでも守っていれば警察の勝ち
  const g2 = new Game({ seed: 9, players: 4 });
  g2.treasures[0].state = 'secured';
  g2.time = 0;
  g2.checkWin();
  assert.equal(g2.winner, 'cops');
  assert.match(g2.reason, /1\/3/);
});

// ---- 移動（壁・角で引っかからない） --------------------------------------
test('建物の角に押し付けられても、壁沿いに滑って抜け出せる（斜め入力で固まらない）', () => {
  const g = makeGame({ players: 8, autoplay: false });
  const cop = g.player;
  park(g, [cop]);
  // 美術館（62,-16 / 18x14）の北西角の外側に置き、壁の中へ向かって斜めに進む
  cop.x = 52.0;
  cop.z = -23.9;
  g.setPlayerMove(1, -1);
  const start = { x: cop.x, z: cop.z };
  g.stepSeconds(2.5);
  const moved = Math.hypot(cop.x - start.x, cop.z - start.z);
  assert.ok(moved > 1.5, `角で止まったまま（${moved.toFixed(2)}m しか動いていない）`);
  assert.ok(cop.x > start.x || cop.z < start.z, '壁に沿って動いていない');
});

test('目標が建物の中にあっても、壁の中へ歩き続けず外側で止まる', () => {
  const g = makeGame({ players: 8 });
  const a = g.agents.find((x) => !x.isPlayer);
  park(g, [a]);
  // 建物の中心を目標にする（内部へは入れない）
  const target = g.freeTarget({ x: -62, z: -62 });
  const inside = Math.abs(target.x + 62) < 9 && Math.abs(target.z + 62) < 6;
  assert.equal(inside, false, '建物の中が目標のまま');
  a.x = -62;
  a.z = -75 + 6;
  a.path = null;
  a.pathAge = 2;
  for (let i = 0; i < 180; i++) g.step(1 / 60);
  for (const o of g.colliders) {
    const insideWall =
      Math.abs(a.x - o.x) < o.w / 2 + CFG.radius - 0.05 &&
      Math.abs(a.z - o.z) < o.d / 2 + CFG.radius - 0.05;
    assert.equal(insideWall, false, `${a.name} が壁の中に入った`);
  }
});

test('CPU 8人を4分動かしても、引っかかって止まる時間がごく短い', () => {
  let stuckSeconds = 0;
  for (const seed of [7, 99, 1234]) {
    const g = new Game({ seed, players: 8, autoplay: true });
    const orig = g.think.bind(g);
    const intent = new Map();
    g.think = (a, dt) => {
      const r = orig(a, dt);
      intent.set(a.id, Math.hypot(r.mx, r.mz));
      return r;
    };
    for (let i = 0; i < 120 * 60 && g.phase === 'playing'; i++) {
      const before = g.agents.map((a) => ({ id: a.id, x: a.x, z: a.z, state: a.state }));
      g.step(1 / 60);
      for (const b of before) {
        const a = g.agents.find((x) => x.id === b.id);
        if (!a || a.state !== 'free') continue;
        const want = intent.get(a.id) || 0;
        if (want > 0.35 && Math.hypot(a.x - b.x, a.z - b.z) < 0.002) stuckSeconds += 1 / 60;
      }
    }
  }
  assert.ok(stuckSeconds < 6, `引っかかりすぎ（${stuckSeconds.toFixed(1)}秒 / 3試合×2分）`);
});

test('キャラ同士が同じ場所に重ならない（1人に見えるバグの防止）', () => {
  const g = makeGame({ players: 8 });
  const a = g.agents.find((x) => !x.isPlayer);
  const b = g.agents.find((x) => !x.isPlayer && x !== a);
  a.x = 0;
  a.z = 0;
  b.x = 0.05;
  b.z = 0.02;
  g.separateAgents();
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(d > 0.9, `重なったまま（${d.toFixed(2)}m）`);
  // 完全に同じ座標でも必ず離れる
  a.x = b.x = 5;
  a.z = b.z = 5;
  g.separateAgents();
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 0.9);
  // プレイヤーが重なっても、少なくとも一人分の幅は離れる
  const p = g.player;
  p.x = a.x;
  p.z = a.z;
  p.state = 'free';
  a.state = 'free';
  g.separateAgents();
  assert.ok(Math.hypot(p.x - a.x, p.z - a.z) > 0.5, 'プレイヤーと重なったまま');
});

// ---- 救出の優先順位 ------------------------------------------------------
test('救出の優先順位は「プレイヤー(YOU) → 先に捕まった順」', () => {
  const g = new Game({ seed: 11, players: 8, playerRole: 'thief', playerSpy: 'never', spyMode: 'none' });
  const player = g.player;
  const mates = g.agents.filter((a) => a.role === ROLE.THIEF && a !== player).slice(0, 2);
  park(g, [player]);
  // プレイヤーを最初に収容し、そのあとに仲間を収容（時間はプレイヤーが一番古い）
  // さらに「先に捕まった順」の確認用に別の2人を入れる
  jail(g, player, 10);
  jail(g, mates[0], 12);
  jail(g, mates[1], 20);
  const jailed = g.agents.filter((a) => a.state === 'jailed');
  assert.equal(g.pickJailTarget(jailed), player, 'プレイヤーが最優先されない');

  // プレイヤーが牢屋にいない場合は、一番古い（=先に捕まった）仲間
  player.state = 'free';
  player.jailSlot = -1;
  player.jailedAt = 0;
  const jailed2 = g.agents.filter((a) => a.state === 'jailed');
  assert.equal(g.pickJailTarget(jailed2), mates[0], '先に捕まった仲間が優先されない');

  // 直接タッチした相手は、その相手を優先
  assert.equal(g.pickJailTarget(jailed2, mates[1]), mates[1], 'タッチした相手が優先されない');
});

test('freeOne は優先順位どおりに助け、直接タッチ指定も尊重する', () => {
  const g = new Game({ seed: 12, players: 8, playerRole: 'thief', playerSpy: 'never', spyMode: 'none' });
  const player = g.player;
  const mates = g.agents.filter((a) => a.role === ROLE.THIEF && a !== player).slice(0, 2);
  park(g, [player]);
  jail(g, mates[0], 5);
  jail(g, player, 9);
  jail(g, mates[1], 20);

  const first = g.freeOne('unlock', null);
  assert.equal(first, player, 'プレイヤーが最初に助けられない');
  const second = g.freeOne('rescue', null);
  assert.equal(second, mates[0], '次は先に捕まった仲間のはず');
  const third = g.freeOne('rescue', null, mates[1]);
  assert.equal(third, mates[1]);
  assert.equal(g.freeOne('rescue', null), null, '牢屋が空なら誰も助けない');
});

test('CPU泥棒は「プレイヤー→先に捕まった順」の相手を助けに向かう', () => {
  const g = new Game({ seed: 13, players: 8, playerRole: 'thief', playerSpy: 'never', spyMode: 'none' });
  const player = g.player;
  const mate = g.agents.find((a) => a.role === ROLE.THIEF && a !== player);
  const rescuer = g.agents.find((a) => a.role === ROLE.THIEF && a !== player && a !== mate);
  park(g, [rescuer, player]);
  jail(g, mate, 3);
  jail(g, player, 8);
  // 牢屋の前に警官を置かない（張り込みなし）
  for (const a of g.agents) if (a.looks === 'cop') a.x = 70, (a.z = -70);
  rescuer.x = -62;
  rescuer.z = 46;
  rescuer.path = null;
  g.stepSeconds(0.2);
  const jailed = g.agents.filter((a) => a.state === 'jailed');
  assert.equal(g.pickJailTarget(jailed), player);
  // プレイヤーが解放されたら、次は先に捕まった仲間
  player.state = 'free';
  player.jailedAt = 0;
  const jailed2 = g.agents.filter((a) => a.state === 'jailed');
  assert.equal(g.pickJailTarget(jailed2), mate);
});

// ---- 救出後の無敵＋ちょい加速 --------------------------------------------
test('救出された泥棒は2.5秒つかまらず、少しだけ足が速い（リング演出つき）', () => {
  assert.equal(CFG.rescueImmunity, 2.5);
  assert.ok(CFG.rescueBoost >= 1.15 && CFG.rescueBoost <= 1.25);
  const g = new Game({ seed: 21, players: 8, playerRole: 'thief', playerSpy: 'never', spyMode: 'none' });
  const player = g.player;
  const cop = g.agents.find((a) => a.looks === 'cop' && !a.isSpy);
  park(g, [player, cop]);
  jail(g, player, 4);

  const freed = g.freeOne('unlock', null);
  assert.equal(freed, player);
  assert.equal(player.state, 'free');
  assert.equal(player.immune, 2.5);
  assert.equal(player.escapeT, CFG.rescueBoostTime);
  assert.ok(Math.abs(player.immune - CFG.rescueImmunity) < 1e-9);

  // 救出直後は確保されない
  cop.arrestCd = 0;
  player.x = cop.x + 1;
  player.z = cop.z;
  assert.equal(g.canArrest(cop, player), false, '救出直後に確保されてしまう');

  // 2.5秒たてば通常どおり確保できる
  g.stepSeconds(2.6);
  assert.ok(player.immune <= 0.01);
  assert.equal(player.escapeT, 0);
  cop.arrestCd = 0;
  player.x = cop.x + 1;
  player.z = cop.z;
  player.hidden = false;
  assert.equal(g.canArrest(cop, player), true);
});

test('加速中は通常より速く動き、時間がたつと元に戻る', () => {
  const g = new Game({ seed: 22, players: 8, playerRole: 'thief', playerSpy: 'never', spyMode: 'none' });
  const a = g.agents.find((x) => x.role === ROLE.THIEF && !x.isPlayer);
  park(g, [a]);
  a.x = 0;
  a.z = 30;
  a.escapeT = 0;
  const base = g.speedOf(a);
  const before = a.x;
  g.setPlayerMove(0, 0);
  // 直接 moveWithSlide で同じ入力を与えて距離を比べる
  g.moveWithSlide(a, 1, 0, base, 1 / 60);
  const normal = a.x - before;

  a.x = 0;
  a.z = 30;
  a.escapeT = 1.5;
  const boostedSpeed = base * (a.escapeT > 0 ? g.cfg.rescueBoost : 1);
  const before2 = a.x;
  g.moveWithSlide(a, 1, 0, boostedSpeed, 1 / 60);
  const boosted = a.x - before2;
  assert.ok(boosted > normal * 1.1, `加速していない (${normal.toFixed(4)} → ${boosted.toFixed(4)})`);
});

// ---- タッチ救出 ----------------------------------------------------------
test('捕まっていない泥棒が牢屋の仲間にタッチすると2人とも逃げられる', () => {
  const g = new Game({ seed: 31, players: 8, playerRole: 'thief', playerSpy: 'never', spyMode: 'none' });
  const player = g.player;
  const mate = g.agents.find((a) => a.role === ROLE.THIEF && a !== player);
  park(g, [player]);
  const slot = jail(g, mate, 6);
  // プレイヤーが牢屋の中の仲間のすぐ横に立つ
  player.x = JAIL_SLOTS[slot].x + 1.1;
  player.z = JAIL_SLOTS[slot].z;
  player.path = null;
  g.stepSeconds(0.2);
  assert.equal(mate.state, 'free', 'タッチで助からない');
  assert.equal(player.state, 'free');
  assert.equal(g.stats.touchRescues, 1);
  assert.ok(mate.immune > 2.2 && mate.immune <= 2.5, `救出直後の無敵が短い (${mate.immune})`);
  assert.ok(mate.escapeT > 0, '助けられた側が逃げる加速を持っていない');
  assert.ok(player.escapeT > 0, '助けた側が逃げる加速を持っていない');
  assert.ok(player.immune > 0, '助けた側も一瞬つかまらない');
  assert.ok(g.events.some((e) => e.type === 'rescue' && /タッチ/.test(e.label)));
});

test('タッチ救出は連鎖しない（クールタイムで誤作動を防ぐ）／拘束中のスパイは対象外', () => {
  const g = new Game({ seed: 32, players: 8, playerRole: 'thief', playerSpy: 'never', spyMode: 'none' });
  const player = g.player;
  const friends = g.agents.filter((a) => a.role === ROLE.THIEF && a !== player).slice(0, 2);
  park(g, [player]);
  jail(g, friends[0], 5);
  jail(g, friends[1], 6);
  player.x = JAIL_SLOTS[friends[0].jailSlot].x + 1.0;
  player.z = JAIL_SLOTS[friends[0].jailSlot].z;
  g.stepSeconds(0.2);
  assert.equal(friends[0].state, 'free');
  assert.equal(friends[1].state, 'jailed', '同じ瞬間に2人も助けてしまう');
  assert.ok(player.touchCd > 0, 'クールタイムが入っていない');
  // クールタイムが明ければ、次の仲間もタッチで助けられる
  player.touchCd = 0;
  player.x = JAIL_SLOTS[friends[1].jailSlot].x + 1.0;
  player.z = JAIL_SLOTS[friends[1].jailSlot].z;
  g.step(1 / 60);
  assert.equal(friends[1].state, 'free');

  // 拘束中のスパイ（detained）は救出されない
  const g2 = new Game({ seed: 33, players: 8, playerRole: 'cop', playerSpy: 'always' });
  const spy = g2.player;
  park(g2, [spy]);
  g2.expose(spy);
  assert.equal(spy.state, 'detained');
  g2.freeOne('rescue', null);
  assert.equal(spy.state, 'detained', '拘束中のスパイが救出された');
});

// ---- スパイの接近アラート -------------------------------------------------
test('スパイ作業中、相手が13mまで来たら「⚠ 接近！」が出る（発覚の7.5mより手前）', () => {
  const g = new Game({ seed: 41, players: 8, playerRole: 'cop', playerSpy: 'always', spyMode: 'both' });
  const spy = g.player;
  assert.equal(spy.isSpy, true);
  assert.equal(spy.team, 'thief');
  // 人狼警察（見た目警官）を発覚させられるのは警察側
  const opp = g.agents.find((a) => a.role === ROLE.COP && a !== spy);
  assert.ok(opp, '警官が見つからない');
  park(g, [spy, opp]);
  spy.x = 0;
  spy.z = 0;
  opp.x = 30;
  opp.z = 0;
  assert.equal(g.spyAlert(spy), null, '遠すぎるのに警告が出た');
  opp.x = 13;
  const near = g.spyAlert(spy);
  assert.ok(near, '接近しているのに警告が出ない');
  assert.ok(near.dist > CFG.exposeRange && near.dist <= CFG.spyAlertRange);
  assert.equal(near.danger, false);
  opp.x = 8.5;
  assert.equal(g.spyAlert(spy).danger, true, '危険距離で強調されない');
  // スパイでない人には出ない
  assert.equal(g.spyAlert(opp), null);
});

test('潜入捜査官には泥棒の接近、人狼警察には警官の接近を知らせる', () => {
  const g = new Game({ seed: 42, players: 8, playerRole: 'thief', playerSpy: 'always', spyMode: 'thieves' });
  const spy = g.player;
  assert.equal(spy.role, ROLE.THIEF_SPY);
  const mate = g.agents.find((a) => a.role === ROLE.THIEF && a !== spy);
  const cop = g.agents.find((a) => a.role === ROLE.COP && !a.isSpy);
  park(g, [spy, mate, cop]);
  spy.x = 0;
  spy.z = 0;
  cop.x = 0;
  cop.z = 12;
  mate.x = 40;
  mate.z = 40;
  assert.equal(g.spyAlert(spy), null, '警官ではなく泥棒に反応している');
  mate.x = 11;
  mate.z = 0;
  const alert = g.spyAlert(spy);
  assert.ok(alert, '泥棒が近づいても警告が出ない');
  assert.equal(alert.agent.id, mate.id);
});

// ---- 人狼警察の動き（往復の振動） ----------------------------------------
test('人狼警察は警官の前で「牢屋↔持ち場」を往復し続けない', () => {
  const g = new Game({ seed: 77, players: 8, playerRole: 'cop', playerSpy: 'always', autoplay: true });
  const spy = g.agents.find((a) => a.role === ROLE.COP_SPY);
  assert.ok(spy);
  let flips = 0;
  let side = null;
  for (let i = 0; i < 90 * 60 && g.phase === 'playing'; i++) {
    g.step(1 / 60);
    if (spy.state !== 'free') continue;
    const atDoor = Math.hypot(spy.x - MAP.jailDoor.x, spy.z - MAP.jailDoor.z) < 8;
    const now = atDoor ? 'door' : 'away';
    if (side && side !== now) flips++;
    side = now;
  }
  // 90秒で牢屋の近くを行き来するのは数回まで（Build 3 は毎フレーム反転していた）
  assert.ok(flips <= 12, `往復しすぎ（${flips}回 / 90秒）`);
});

// ---- 画面側（オクルージョン・目印・ロゴ・識別タグ） --------------------
test('高いビルの裏では建物を透かし、カメラも少し上げる', () => {
  const js = read('www/src/render.js');
  assert.match(js, /updateOcclusion/);
  assert.match(js, /segmentRectRange/);
  assert.match(js, /fade/);
  assert.match(js, /camLift/);
  assert.match(js, /this\.buildings\s*=\s*\[\]/);
  assert.match(js, /b\.fade \+= \(want - b\.fade\)/);
});

test('POLICE ロゴを警察の背中に入れ、頭上に極小の YOU / A / B … を出す', () => {
  const js = read('www/src/render.js');
  assert.match(js, /policePatchTexture/);
  assert.match(js, /fillText\('POLICE'/);
  assert.match(js, /backPatch/);
  assert.match(js, /tagTexture/);
  assert.match(js, /tagLetter/);
  assert.match(js, /a\.isPlayer \? 'YOU' : tagLetter\(a\.name\)/);
  assert.match(js, /tag\.scale\.set\(a\.isPlayer \? [\d.]+ : [\d.]+/);
  // 寝返りで見た目が変わったらタグの色も合わせる
  assert.match(js, /g\.userData\.look !== a\.looks/);
});

test('牢屋を見通しよくし、遠くから分かる JAIL の目印を出す', () => {
  const js = read('www/src/render.js');
  // 屋根は中央を大きく吹き抜けにし、手前は外す
  assert.match(js, /const ring = 1\.0;/);
  assert.match(js, /jailBeam/);
  assert.match(js, /jailBadge/);
  assert.match(js, /JAIL'/);
  // 壁は低めにして中が見えるように
  for (const w of MAP.jailWalls) assert.ok(w.h <= 1.8, `牢屋の壁が高い（${w.h}）`);
});

test('脱出ゲートは光の柱・浮かぶしるし・地面の矢印で分かるようにする', () => {
  const js = read('www/src/render.js');
  assert.match(js, /gatePillar/);
  assert.match(js, /gateBeacon/);
  assert.match(js, /gateChevrons/);
  assert.match(js, /LOOT → EXIT/);
});

test('お宝を運んでいる間は足元にゲート方向のガイド矢印を出す', () => {
  const js = read('www/src/render.js');
  assert.match(js, /buildCarryGuide/);
  assert.match(js, /carryGuide/);
  assert.match(js, /player\.carrying != null && player\.state === 'free'/);
});

test('ミニマップに牢屋(JAIL)とゲート(EXIT)の位置サインを出す', () => {
  const js = read('www/src/minimap.js');
  assert.match(js, /marker\(/);
  assert.match(js, /'JAIL'/);
  assert.match(js, /'EXIT'/);
});

// ---- iOS のコピー・長押し選択の無効化 ------------------------------------
test('ゲーム画面では長押しコピー・文字選択・コールアウトを無効化する', () => {
  const css = read('www/styles.css');
  assert.match(css, /-webkit-user-select: none/);
  assert.match(css, /-webkit-touch-callout: none/);
  assert.match(css, /user-select: none/);
  // 入力欄だけは例外
  assert.match(css, /input,[\s\S]{0,120}-webkit-user-select: text/);
  assert.match(css, /\[contenteditable='true'\]/);

  const js = read('www/src/main.js');
  assert.match(js, /'contextmenu'/);
  assert.match(js, /'selectstart'/);
  assert.match(js, /'dragstart'/);
  assert.match(js, /e\.preventDefault\(\)/);
  assert.match(js, /TEXT_ENTRY/);
  assert.match(js, /removeAllRanges/);

  const html = read('www/index.html');
  assert.match(html, /user-scalable=no/);
});

// ---- UI 構成 --------------------------------------------------------------
test('タイトルで参加人数（4〜10人）を選べ、内訳とお宝数が出る', () => {
  const html = read('www/index.html');
  assert.match(html, /id="sizePick"/);
  for (const n of [4, 5, 6, 7, 8, 9, 10]) {
    assert.match(html, new RegExp(`data-size="${n}"`));
  }
  assert.match(html, /id="sizeNote"/);
  const js = read('www/src/main.js');
  assert.match(js, /bindSeg\('sizePick', 'players', 'size'/);
  assert.match(js, /treasureCountFor/);
  assert.match(js, /ruleThief/);
  assert.match(js, /lootGoal/);
  assert.ok(STRINGS['players.label'].ja && STRINGS['players.label'].en);
  assert.match(t('players.note', 'ja'), /\{cops\}/);
  assert.match(t('rule.thief', 'ja'), /\{n\}/);
  // 人数はゲームに渡る
  assert.match(js, /players: opts\.players \?\? Number\(settings\.players\)/);
});

test('プレイ中に「⚠ 接近！」アラートの枠がある', () => {
  const html = read('www/index.html');
  assert.match(html, /id="spyAlert"/);
  const css = read('www/styles.css');
  assert.match(css, /\.spy-alert/);
  const js = read('www/src/main.js');
  assert.match(js, /game\.spyAlert\(p\)/);
  assert.match(js, /⚠ 接近!/);
});

// ---- ビルド番号・ワークフロー --------------------------------------------
test('Build 4 のワークフロー定義（1行目が # で始まり、BUILD_NUMBER と preflight が4）', () => {
  const yml = read('docs/ios-testflight-build4.yml');
  assert.equal(yml.split('\n')[0], '# DOROKEI iOS TestFlight Build 4', '1行目はビルド名のコメント');
  assert.match(yml, /BUILD_NUMBER: "4"/);
  assert.match(yml, /CURRENT_PROJECT_VERSION = 4;/);
  assert.ok(!/CURRENT_PROJECT_VERSION = 3;/.test(yml));
  assert.match(yml, /splitTeams/);
  assert.match(yml, /id="sizePick"/);
  assert.match(yml, /touchRescueRange/);
  assert.match(yml, /rescueImmunity: 2\.5/);
  assert.match(yml, /spyAlertRange: 14/);
  assert.match(yml, /-webkit-touch-callout/);
  assert.match(yml, /dorokei-testflight-build4-evidence/);
  assert.match(yml, /test\/build4\.test\.js/);

  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  // Build 4 以降、ビルド番号は Build 5 へ引き継がれる（2箇所とも同じ番号で、巻き戻らない）
  const versions = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => Number(m[1]));
  assert.equal(versions.length, 2);
  assert.equal(new Set(versions).size, 1, '2箇所のビルド番号が揃っている');
  assert.ok(versions[0] >= 4, 'ビルド番号が Build 4 より戻っていない');
  assert.ok(!/CURRENT_PROJECT_VERSION = 3;/.test(pbx));

  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.test, /test\/build4\.test\.js/);
  assert.match(read('www/index.html'), /Build [45]/);
});

// ---- 新しいスパイルール（Build 4） ---------------------------------------
test('潜入捜査官（お宝を戻す役）は警察の通常逮捕対象外（接触しても牢屋に入らない）', () => {
  const g = new Game({ seed: 61, players: 8, playerRole: 'thief', playerSpy: 'always', spyMode: 'thieves' });
  const spy = g.player;
  assert.equal(spy.role, ROLE.THIEF_SPY);
  const cop = g.agents.find((a) => a.role === ROLE.COP);
  park(g, [spy, cop]);
  spy.x = 0;
  spy.z = 30;
  cop.x = 0.9;
  cop.z = 30;
  cop.arrestCd = 0;
  assert.equal(g.canArrest(cop, spy), false, '潜入捜査官を逮捕できてしまう');
  assert.equal(g.arrest(cop, spy), false);
  assert.equal(spy.state, 'free');
  // 何秒たっても捕まらない（警官が密着していても）
  g.stepSeconds(3);
  assert.equal(spy.state, 'free', '警官の近くで捕まった');
  // 本物の泥棒は今までどおり捕まえられる
  const thief = g.agents.find((a) => a.role === ROLE.THIEF);
  park(g, [spy, cop, thief]);
  thief.state = 'free';
  thief.hidden = false;
  thief.immune = 0;
  thief.x = 0.9;
  thief.z = 30;
  cop.arrestCd = 0;
  assert.equal(g.canArrest(cop, thief), true);
});

test('潜入捜査官の発覚は「ゲートのお宝戻し作業」を見られた時だけ', () => {
  const g = new Game({ seed: 62, players: 8, playerRole: 'thief', playerSpy: 'always', spyMode: 'thieves' });
  const spy = g.player;
  g.treasures[0].state = 'secured';
  const witness = g.agents.find((a) => a.role === ROLE.THIEF);
  park(g, [spy, witness]);
  // 泥棒のすぐ横を歩いても、戻し作業をしていなければバレない
  spy.x = witness.x + 2;
  spy.z = witness.z;
  g.setPlayerMove(0, 0);
  g.stepSeconds(1.5);
  assert.equal(spy.exposed, false, '作業していないのに発覚した');
  assert.equal(spy.state, 'free');
  // ゲートで戻し作業を泥棒に見られると発覚 → 拘束（Build 5 で10秒）
  spy.x = MAP.gate.x;
  spy.z = MAP.gate.z + 2;
  witness.x = MAP.gate.x + 3;
  witness.z = MAP.gate.z + 1;
  g.setAction(true);
  g.stepSeconds(0.6);
  assert.equal(spy.exposed, true, '戻し作業を見られても発覚しない');
  assert.equal(spy.state, 'detained');
});

test('人狼警察の発覚は「牢屋の解錠作業」を見られた時だけ', () => {
  const g = new Game({ seed: 63, players: 8, playerRole: 'cop', playerSpy: 'always', spyMode: 'both' });
  const spy = g.player;
  assert.equal(spy.role, ROLE.COP_SPY);
  const cop = g.agents.find((a) => a.role === ROLE.COP);
  const thief = g.agents.find((a) => a.role === ROLE.THIEF);
  park(g, [spy, cop, thief]);
  jail(g, thief, 5);
  // 警官のすぐ横を歩いても、解錠していなければバレない
  spy.x = cop.x + 2;
  spy.z = cop.z;
  g.stepSeconds(1.5);
  assert.equal(spy.exposed, false, '解錠していないのに発覚した');
  // 牢屋の前で解錠を始め、警官に見られると発覚
  spy.x = MAP.jailDoor.x;
  spy.z = MAP.jailDoor.z - 1;
  cop.x = MAP.jailDoor.x + 3;
  cop.z = MAP.jailDoor.z - 1;
  g.setAction(true);
  g.stepSeconds(0.6);
  assert.equal(spy.exposed, true, '解錠を見られても発覚しない');
  assert.equal(spy.state, 'detained');
});

test('「密告」の表現と位置ピンは廃止され、「お宝を戻す」に統一されている', () => {
  const g = new Game({ seed: 64, players: 8, playerRole: 'thief', playerSpy: 'always', spyMode: 'thieves' });
  const spy = g.player;
  assert.equal(g.whistle(spy), false);
  assert.equal(g.pings.length, 0);
  // UI 文言（ja/en）に「密告」が残っていない
  for (const lang of ['ja', 'en']) {
    for (const key of ['role.thiefSpy.desc', 'mission.thiefSpy', 'rule.spy', 'howto.spyDesc']) {
      assert.ok(!/密告/.test(t(key, lang)), `${key}/${lang} に密告が残っている`);
    }
  }
  for (const file of ['www/src/main.js', 'www/src/core.js', 'www/index.html']) {
    assert.ok(!/密告/.test(read(file)), `${file} に密告が残っている`);
  }
  // ボタンは「お宝を戻す」
  const mainJs = read('www/src/main.js');
  assert.match(mainJs, /お宝を戻す/);
  assert.match(mainJs, /お宝を戻しに/);
});

test('お宝を戻した直後はクールタイムがあり、連発で封殺しない', () => {
  const g = new Game({ seed: 65, players: 8, playerRole: 'thief', playerSpy: 'always', spyMode: 'thieves' });
  const spy = g.player;
  assert.ok(g.cfg.returnCooldown >= 5, 'クールタイムが短すぎる');
  g.treasures[0].state = 'secured';
  g.treasures[1].state = 'secured';
  park(g, [spy]);
  spy.x = MAP.gate.x;
  spy.z = MAP.gate.z + 2;
  g.setPlayerMove(0, 0);
  g.setAction(true);
  g.stepSeconds(1.7);
  assert.equal(g.securedCount, 1, '1つ戻せていない');
  assert.ok(spy.ai.returnCd > 0, 'クールタイムが入っていない');
  // まだ戻せるお宝があっても、クールタイム中は作業に入らない
  g.stepSeconds(2.0);
  assert.equal(g.securedCount, 1, 'クールタイム中に連続で戻してしまう');
});

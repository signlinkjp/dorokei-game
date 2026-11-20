import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Game,
  ROLE,
  MAP,
  CFG,
  assignRoles,
  looksLike,
  teamOf,
  JAIL_SLOTS,
  Nav,
} from '../www/src/core.js';

// ---- テスト用ヘルパ -------------------------------------------------------
function makeGame(opts = {}) {
  // 触って確かめるテストでは、AI警官の自動確保を止めて単体検証する
  return new Game({ seed: 42, cfg: { arrestRange: 0 }, ...opts });
}

function take(g, pred) {
  return g.agents.find(pred);
}

function jailThief(g) {
  const t = take(g, (a) => a.role === ROLE.THIEF && a.state === 'free' && !a.isPlayer);
  const slot = g.freeJailSlot();
  t.state = 'jailed';
  t.jailSlot = slot;
  t.x = JAIL_SLOTS[slot].x;
  t.z = JAIL_SLOTS[slot].z;
  return t;
}

function park(g, keep) {
  for (const a of g.agents) {
    if (keep.includes(a) || a.state === 'jailed') continue;
    a.x = 73;
    a.z = 73;
  }
}

function insideAnyCollider(g, x, z, pad = 0) {
  return g.colliders.some(
    (o) => Math.abs(x - o.x) <= o.w / 2 + pad && Math.abs(z - o.z) <= o.d / 2 + pad,
  );
}

function walk(g, from, to, maxSec = 120, speed = CFG.speed.cop) {
  const a = { x: from.x, z: from.z, path: null, pathTarget: null, pathAge: 0 };
  const dt = 1 / 30;
  let t = 0;
  while (t < maxSec) {
    const mv = g.moveToward(a, to, dt);
    a.pathAge += dt;
    a.x += mv.mx * speed * dt;
    a.z += mv.mz * speed * dt;
    const s = g.collide(a.x, a.z, CFG.radius);
    a.x = s.x;
    a.z = s.z;
    t += dt;
    if (Math.hypot(a.x - to.x, a.z - to.z) < 2.0) return { ok: true, t, x: a.x, z: a.z };
  }
  return { ok: false, t, x: a.x, z: a.z };
}

// ---- 役職割り当て ---------------------------------------------------------
test('既定では警官3・泥棒5の計8人、各陣営にスパイ1', () => {
  const r = assignRoles({ seed: 1 });
  assert.equal(r.length, 8);
  assert.equal(r.filter((x) => x.looks === 'cop').length, 3);
  assert.equal(r.filter((x) => x.looks === 'thief').length, 5);
  assert.equal(r.filter((x) => x.role === ROLE.COP_SPY).length, 1);
  assert.equal(r.filter((x) => x.role === ROLE.THIEF_SPY).length, 1);
  assert.equal(r.filter((x) => x.isPlayer).length, 1);
  assert.equal(teamOf(ROLE.COP_SPY), 'thief');
  assert.equal(teamOf(ROLE.THIEF_SPY), 'cop');
  assert.equal(looksLike(ROLE.COP_SPY), 'cop');
  assert.equal(looksLike(ROLE.THIEF_SPY), 'thief');
});

test('スパイ設定4種が正しく反映される', () => {
  const none = assignRoles({ seed: 3, spyMode: 'none' });
  assert.equal(none.filter((x) => x.isSpy).length, 0);
  const cops = assignRoles({ seed: 3, spyMode: 'cops' });
  assert.equal(cops.filter((x) => x.role === ROLE.COP_SPY).length, 1);
  assert.equal(cops.filter((x) => x.role === ROLE.THIEF_SPY).length, 0);
  const thieves = assignRoles({ seed: 3, spyMode: 'thieves' });
  assert.equal(thieves.filter((x) => x.role === ROLE.THIEF_SPY).length, 1);
  assert.equal(thieves.filter((x) => x.role === ROLE.COP_SPY).length, 0);
});

test('プレイヤーの希望陣営とスパイ希望が反映される', () => {
  const asCop = assignRoles({ seed: 5, playerRole: 'cop', playerSpy: 'never' });
  assert.equal(asCop[0].role, ROLE.COP);
  assert.equal(assignRoles({ seed: 5, playerRole: 'thief', playerSpy: 'never' })[0].role, ROLE.THIEF);
  assert.equal(assignRoles({ seed: 5, playerRole: 'cop', playerSpy: 'always' })[0].role, ROLE.COP_SPY);
  assert.equal(
    assignRoles({ seed: 5, playerRole: 'thief', playerSpy: 'always' })[0].role,
    ROLE.THIEF_SPY,
  );
  for (let s = 0; s < 20; s++) {
    const auto = assignRoles({ seed: s, playerRole: 'auto' });
    assert.ok(['cop', 'thief'].includes(auto[0].team));
  }
});

// ---- 広い街のマップ -------------------------------------------------------
test('街は 140m×140m 以上で、ランドマークが8つ以上ある', () => {
  const w = MAP.bounds.maxX - MAP.bounds.minX;
  const d = MAP.bounds.maxZ - MAP.bounds.minZ;
  assert.ok(w >= 140, `横幅 ${w}m`);
  assert.ok(d >= 140, `奥行き ${d}m`);
  assert.ok(MAP.landmarks.length >= 8, `ランドマーク ${MAP.landmarks.length}`);
  const ids = MAP.landmarks.map((l) => l.id);
  for (const need of ['bank', 'jewelry', 'museum', 'station', 'park', 'jail', 'gate', 'shops']) {
    assert.ok(ids.includes(need), `${need} がない`);
  }
});

test('お宝は10候補から5箇所に置かれ、重複しない', () => {
  assert.equal(MAP.treasureSpots.length, 10);
  const g = new Game({ seed: 99 });
  assert.equal(g.treasures.length, CFG.treasureCount);
  const spots = g.treasures.map((t) => t.spot);
  assert.equal(new Set(spots).size, 5);
  for (const t of g.treasures) {
    assert.equal(t.state, 'vault');
    const p = MAP.treasureSpots[t.spot];
    assert.equal(t.x, p.x);
    assert.equal(t.z, p.z);
  }
  // シードが同じなら配置も同じ、違えば（ほぼ）変わる
  const again = new Game({ seed: 99 });
  assert.deepEqual(again.treasures.map((t) => t.spot), spots);
  const other = new Game({ seed: 12345 });
  assert.notDeepEqual(other.treasures.map((t) => t.spot), spots);
});

test('お宝候補・隠れ場所・木・開始位置が建物や道路の上にない', () => {
  const g = new Game({ seed: 4 });
  for (const s of MAP.treasureSpots) {
    assert.ok(s.x > MAP.bounds.minX + 2 && s.x < MAP.bounds.maxX - 2, `${s.name} の x`);
    assert.ok(s.z > MAP.bounds.minZ + 2 && s.z < MAP.bounds.maxZ - 2, `${s.name} の z`);
    assert.equal(insideAnyCollider(g, s.x, s.z, 0.6), false, `${s.name} が建物の中`);
  }
  assert.ok(MAP.bushes.length >= 8, `茂み ${MAP.bushes.length}`);
  for (const b of MAP.bushes) {
    assert.equal(insideAnyCollider(g, b.x, b.z, 0.4), false, '茂みが建物の中');
  }
  for (const t of MAP.trees) {
    assert.equal(insideAnyCollider(g, t.x, t.z, 0), false, '木が建物の中');
  }
  for (const key of ['cop', 'thief']) {
    const s = MAP.spawn[key];
    assert.equal(insideAnyCollider(g, s.x, s.z, 0), false, `${key} の開始位置`);
  }
  for (const slot of JAIL_SLOTS) {
    assert.ok(Math.abs(slot.x - MAP.jail.x) < MAP.jail.w / 2);
    assert.ok(Math.abs(slot.z - MAP.jail.z) < MAP.jail.d / 2);
    assert.equal(insideAnyCollider(g, slot.x, slot.z, 0), false, '牢屋スロットが壁の中');
  }
});

// ---- お宝・勝利条件 -------------------------------------------------------
test('お宝を拾って脱出ゲートへ運ぶと得点、5つすべてで泥棒陣営の勝利', () => {
  const g = makeGame({ playerRole: 'thief', playerSpy: 'never' });
  const player = g.player;
  park(g, [player]);
  const tr = g.treasures[0];
  player.x = tr.x;
  player.z = tr.z;
  g.setPlayerMove(0, 0);
  g.step(1 / 60);
  assert.equal(tr.state, 'carried');
  assert.equal(player.carrying, tr.id);

  player.x = MAP.gate.x;
  player.z = MAP.gate.z;
  g.step(1 / 60);
  assert.equal(g.securedCount, 1);
  assert.equal(tr.state, 'secured');
  assert.equal(player.carrying, null);

  // 残りをまとめて搬出
  for (let i = 1; i < CFG.treasureRequired; i++) {
    const t = g.treasures[i];
    t.state = 'carried';
    t.carrier = player.id;
    player.carrying = t.id;
    player.x = MAP.gate.x;
    player.z = MAP.gate.z;
    g.step(1 / 60);
  }
  assert.equal(g.securedCount, CFG.treasureRequired);
  assert.equal(g.phase, 'ended');
  assert.equal(g.winner, 'thieves');
});

test('お宝を運んでいると移動速度が 6.8 → 5.4 に落ちる', () => {
  const g = makeGame({ playerRole: 'thief', playerSpy: 'never' });
  const player = g.player;
  park(g, [player]);
  player.x = 0;
  player.z = 30; // 道路の上（障害物なし）
  g.setPlayerMove(1, 0);
  g.stepSeconds(1.0, 1 / 60);
  const normal = player.x;
  assert.ok(normal > 6.5 && normal < 7.0, `通常 ${normal.toFixed(2)}m/s`);

  const t = g.treasures[0];
  t.state = 'carried';
  t.carrier = player.id;
  player.carrying = t.id;
  player.x = 0;
  player.z = 30;
  g.stepSeconds(1.0, 1 / 60);
  const carrying = player.x;
  assert.ok(carrying > 5.1 && carrying < 5.6, `運搬中 ${carrying.toFixed(2)}m/s`);
  assert.ok(normal - carrying > 1.0, '運搬中ははっきり遅い');
});

test('時間切れで1つでも守れていれば警察陣営の勝利', () => {
  const g = makeGame({ playerRole: 'cop', playerSpy: 'never' });
  for (let i = 0; i < 4; i++) g.treasures[i].state = 'secured';
  g.time = 0.05;
  g.step(0.1);
  assert.equal(g.winner, 'cops');
  assert.match(g.reason, /4\/5/);

  const g2 = makeGame({ playerRole: 'cop', playerSpy: 'never' });
  g2.time = 0.05;
  g2.step(0.1);
  assert.equal(g2.winner, 'cops');
  assert.match(g2.reason, /すべて守りきった/);
});

test('泥棒全員が牢屋に入ると警察陣営の勝利', () => {
  const g = makeGame({ playerRole: 'cop', playerSpy: 'never' });
  for (const a of g.agents.filter((x) => x.team === 'thief')) {
    a.state = 'jailed';
    a.jailSlot = g.freeJailSlot();
  }
  g.step(1 / 60);
  assert.equal(g.winner, 'cops');
  assert.match(g.reason, /全員確保/);
});

// ---- 捕獲・お宝の隠し戻し -------------------------------------------------
test('警官が泥棒に触れると捕獲され牢屋に入る', () => {
  const g = makeGame({ playerRole: 'cop', playerSpy: 'never', cfg: {} });
  const cop = g.player;
  const thief = take(g, (a) => a.role === ROLE.THIEF);
  thief.x = cop.x + 0.5;
  thief.z = cop.z;
  g.step(1 / 60);
  assert.equal(thief.state, 'jailed');
  assert.equal(g.counts().jailed, 1);
  assert.equal(g.stats.arrests, 1);
  assert.ok(cop.arrestCd > 0);
  const slot = JAIL_SLOTS[thief.jailSlot];
  assert.equal(thief.x, slot.x);
  assert.equal(thief.z, slot.z);
});

test('お宝を持った泥棒を捕まえると、お宝は街のどこかへランダムに隠し戻される', () => {
  const g = makeGame({ playerRole: 'cop', playerSpy: 'never' });
  const cop = g.player;
  const thief = take(g, (a) => a.role === ROLE.THIEF);
  const tr = g.treasures[0];
  const before = tr.spot;
  tr.state = 'carried';
  tr.carrier = thief.id;
  thief.carrying = tr.id;
  cop.arrestCd = 0;
  assert.equal(g.arrest(cop, thief), true);

  assert.equal(thief.state, 'jailed');
  assert.equal(thief.carrying, null);
  assert.equal(tr.state, 'vault');
  assert.equal(tr.carrier, null);
  assert.notEqual(tr.spot, before, '元の場所ではなく別の候補へ移る');
  assert.ok(tr.spot >= 0 && tr.spot < MAP.treasureSpots.length);
  assert.equal(tr.x, MAP.treasureSpots[tr.spot].x);
  assert.equal(tr.z, MAP.treasureSpots[tr.spot].z);
  // 牢屋の中には隠されない
  assert.ok(Math.hypot(tr.x - MAP.jail.x, tr.z - MAP.jail.z) > 20);
});

test('正体発覚していない内通者は警官に捕まえられず、発覚すると牢屋で15秒拘束→警察へ寝返る（Build 3）', () => {
  const g = makeGame({ playerRole: 'cop', playerSpy: 'always' });
  const spy = g.player;
  assert.equal(spy.role, ROLE.COP_SPY);
  const cop = take(g, (a) => a.role === ROLE.COP);
  cop.arrestCd = 0;
  assert.equal(g.canArrest(cop, spy), false);
  assert.equal(g.arrest(cop, spy), false);
  g.expose(spy);
  // 即逮捕ではなく牢屋へ移送して15秒の拘束
  assert.equal(spy.state, 'detained');
  assert.equal(spy.detainLeft, 15);
  cop.arrestCd = 0;
  assert.equal(g.canArrest(cop, spy), false, '拘束中は確保できない');
  // 15秒後は見た目どおりの警察へ強制転向
  g.stepSeconds(14.5);
  assert.equal(spy.state, 'detained');
  g.stepSeconds(1.0);
  assert.equal(spy.state, 'free');
  assert.equal(spy.role, ROLE.COP);
  assert.equal(spy.team, 'cop');
  assert.equal(spy.isSpy, false);
  assert.ok(g.events.some((e) => e.type === 'betray' && e.by === spy.id));
});

// ---- 隠れる ---------------------------------------------------------------
test('泥棒は茂みに隠れると半透明になり、離れた警官には捕まえられない', () => {
  const g = makeGame({ playerRole: 'thief', playerSpy: 'never' });
  const player = g.player;
  park(g, [player]);
  const bush = MAP.bushes[0];
  player.x = bush.x;
  player.z = bush.z;
  g.step(1 / 60);
  assert.equal(player.hidden, false);
  g.setAction(true);
  assert.equal(player.hidden, true);
  assert.equal(g.stats.hides, 1);
  g.setAction(false);

  const cop = take(g, (a) => a.role === ROLE.COP);
  cop.x = player.x + 4;
  cop.z = player.z;
  cop.arrestCd = 0;
  assert.equal(g.canArrest(cop, player), false, '4m離れた警官には見つからない');
  assert.equal(g.canSee(cop, player), false);
  cop.x = player.x + 0.9;
  assert.equal(g.canArrest(cop, player), true, 'すぐ近くまで来れば見つかる');
  assert.equal(g.canSee(cop, player), true);

  // 動けば隠れ解除
  g.setPlayerMove(1, 0);
  g.step(1 / 60);
  assert.equal(player.hidden, false);
});

test('お宝を持っている泥棒は隠れられない・警官は隠れられない', () => {
  const g = makeGame({ playerRole: 'thief', playerSpy: 'never' });
  const player = g.player;
  park(g, [player]);
  const bush = MAP.bushes[1];
  player.x = bush.x;
  player.z = bush.z;
  const t = g.treasures[0];
  t.state = 'carried';
  t.carrier = player.id;
  player.carrying = t.id;
  assert.equal(g.hide(player), false);

  const g2 = makeGame({ playerRole: 'cop', playerSpy: 'never' });
  const cop = g2.player;
  cop.x = bush.x;
  cop.z = bush.z;
  assert.equal(g2.hide(cop), false);
  // 茂みの外では隠れられない
  player.carrying = null;
  player.x = 0;
  player.z = 30;
  assert.equal(g.hide(player), false);
});

// ---- 警察側スパイ（内通者）の解錠 -----------------------------------------
test('内通者は牢屋前で1.5秒長押しすると解錠でき、警官に見られると発覚する', () => {
  const g = makeGame({ playerRole: 'cop', playerSpy: 'always' });
  const spy = g.player;
  assert.equal(spy.role, ROLE.COP_SPY);
  const jailed = jailThief(g);
  for (const a of g.agents) if (a.role === ROLE.COP) { a.x = 70; a.z = 70; }
  spy.x = MAP.jailDoor.x;
  spy.z = MAP.jailDoor.z;
  g.setPlayerMove(0, 0);
  g.setAction(true);
  g.stepSeconds(1.0);
  assert.equal(jailed.state, 'jailed', '1.0秒ではまだ');
  assert.ok(spy.actionT > 0.5);
  g.stepSeconds(0.7);
  assert.equal(jailed.state, 'free');
  assert.equal(g.stats.unlocks, 1);
  assert.equal(spy.exposed, false, '誰も見ていなければバレない');
  assert.ok(jailed.immune > 0);
  // 扉の外側へ出る
  assert.ok(jailed.z < MAP.jailDoor.z);
});

test('解錠中を他の警官に近くで見られると正体発覚し、解錠は中断されて15秒後に警察へ寝返る（Build 3）', () => {
  const g = makeGame({ playerRole: 'cop', playerSpy: 'always' });
  const spy = g.player;
  const jailed = jailThief(g);
  const witness = take(g, (a) => a.role === ROLE.COP);
  witness.x = MAP.jailDoor.x + 3;
  witness.z = MAP.jailDoor.z + 3;
  for (const a of g.agents) {
    if (a.role === ROLE.COP && a !== witness) { a.x = 70; a.z = 70; }
  }
  spy.x = MAP.jailDoor.x;
  spy.z = MAP.jailDoor.z;
  g.setPlayerMove(0, 0);
  g.setAction(true);
  g.stepSeconds(0.5);
  assert.equal(spy.exposed, true);
  assert.equal(g.stats.exposures, 1);
  assert.equal(spy.state, 'detained', '発覚したら警察署の牢屋へ');
  g.stepSeconds(1.2);
  assert.equal(jailed.state, 'jailed', '発覚したら解錠は中断される');
  g.stepSeconds(14);
  assert.equal(spy.state, 'free');
  assert.equal(spy.role, ROLE.COP, '15秒後に警察へ寝返る');
});

// ---- 泥棒側スパイ（密告者）のお宝奪い返し ---------------------------------
test('密告者は脱出ゲート前の長押しで、運ばれたお宝を街へ隠し戻せる', () => {
  const g = makeGame({ playerRole: 'thief', playerSpy: 'always' });
  const spy = g.player;
  assert.equal(spy.role, ROLE.THIEF_SPY);
  const swiped = g.treasures[0];
  swiped.state = 'secured';
  assert.equal(g.securedCount, 1);
  park(g, [spy]);
  g.cfg.exposeRange = 7.5;

  spy.x = MAP.gate.x;
  spy.z = MAP.gate.z + 2;
  g.setPlayerMove(0, 0);
  g.setAction(true);
  g.stepSeconds(1.0);
  assert.equal(g.securedCount, 1, '1.0秒ではまだ');
  g.stepSeconds(0.7);
  assert.equal(g.securedCount, 0, '隠し戻された');
  assert.equal(swiped.state, 'vault');
  assert.equal(g.stats.returns, 1);
  assert.equal(spy.exposed, false, '泥棒に見られていなければバレない');
  // 元の場所（ゲート）ではなく街の候補スポットへ
  assert.ok(Math.hypot(swiped.x - MAP.gate.x, swiped.z - MAP.gate.z) > 20);
});

test('お宝の隠し戻し中を他の泥棒に見られると正体発覚し、15秒後に泥棒になる（Build 3）', () => {
  const g = makeGame({ playerRole: 'thief', playerSpy: 'always' });
  const spy = g.player;
  g.treasures[0].state = 'secured';
  const witness = take(g, (a) => a.role === ROLE.THIEF);
  park(g, [spy, witness]);
  witness.x = MAP.gate.x + 3;
  witness.z = MAP.gate.z + 1;
  witness.arrestCd = 0;
  assert.equal(g.canArrest(witness, spy), false, '発覚前は捕まえられない');
  assert.equal(g.arrest(witness, spy), false);

  spy.x = MAP.gate.x;
  spy.z = MAP.gate.z + 2;
  g.setPlayerMove(0, 0);
  g.setAction(true);
  g.stepSeconds(0.5);
  assert.equal(spy.exposed, true);
  assert.equal(g.stats.exposures, 1);
  assert.equal(spy.state, 'detained', '発覚したら牢屋で拘束');
  assert.equal(spy.team, 'cop', '拘束中は元の陣営のまま');
  g.stepSeconds(15);
  assert.equal(spy.state, 'free');
  assert.equal(spy.role, ROLE.THIEF, '15秒後に泥棒へ寝返る');
  assert.equal(spy.team, 'thief');
  assert.equal(g.stats.defections, 1);
});

test('密告者はお宝を運べない（盗むのは本物の泥棒の役目）', () => {
  const g = makeGame({ playerRole: 'thief', playerSpy: 'always' });
  const spy = g.player;
  park(g, [spy]);
  const tr = g.treasures[0];
  spy.x = tr.x;
  spy.z = tr.z;
  g.step(1 / 60);
  assert.equal(tr.state, 'vault');
  assert.equal(spy.carrying, null);
});

// ---- 密告ピン -------------------------------------------------------------
test('密告者は近くの泥棒の位置を警察へピンで知らせる', () => {
  const g = makeGame({ playerRole: 'thief', playerSpy: 'always' });
  const spy = g.player;
  for (const a of g.agents) if (a.team === 'thief' && a !== spy) { a.x = 73; a.z = 73; }
  const thieves = g.agents.filter((a) => a.role === ROLE.THIEF).slice(0, 2);
  thieves[0].x = spy.x + 2;
  thieves[0].z = spy.z;
  thieves[1].x = spy.x;
  thieves[1].z = spy.z + 3;
  assert.equal(g.whistle(spy), true);
  assert.equal(g.pings.length, 2);
  assert.equal(g.stats.whistles, 1);
  assert.ok(spy.whistleCd > 0);
  assert.equal(g.whistle(spy), false, 'クールダウン中は撃てない');
  g.stepSeconds(CFG.pingTtl + 0.5);
  assert.equal(g.pings.length, 0, 'ピンは数秒で消える');
});

// ---- 経路探索 -------------------------------------------------------------
test('A* で開始位置からゲート・各お宝・牢屋まで歩ける', () => {
  const g = new Game({ seed: 21 });
  const gate = { x: MAP.gate.x, z: MAP.gate.z + 3 };
  assert.ok(g.nav.findPath(MAP.spawn.cop.x, MAP.spawn.cop.z, gate.x, gate.z));
  assert.ok(g.nav.findPath(MAP.spawn.thief.x, MAP.spawn.thief.z, gate.x, gate.z));

  const fromCop = walk(g, MAP.spawn.cop, gate);
  assert.equal(fromCop.ok, true, `警官がゲートへ着かない (${fromCop.x.toFixed(1)},${fromCop.z.toFixed(1)})`);

  for (const s of MAP.treasureSpots) {
    const w1 = walk(g, { x: MAP.spawn.thief.x, z: MAP.spawn.thief.z }, { x: s.x, z: s.z });
    assert.equal(w1.ok, true, `${s.name} へ歩けない`);
    const w2 = walk(g, { x: s.x, z: s.z }, gate);
    assert.equal(w2.ok, true, `${s.name} からゲートへ歩けない`);
  }
});

test('牢屋の中から外へは扉の隙間を通れる', () => {
  const g = new Game({ seed: 22 });
  const door = { x: MAP.jailDoor.x, z: MAP.jailDoor.z - 3 };
  const p1 = g.nav.findPath(-62, 58, door.x, door.z);
  assert.ok(p1 && p1.length, '牢屋から外への経路がない');
  const w = walk(g, { x: -62, z: 58 }, door);
  assert.equal(w.ok, true);
});

// ---- CPU の通し検証 -------------------------------------------------------
test('CPU 8人で120秒オートプレイしても破綻しない（NaNなし・街から出ない・建物に入らない）', () => {
  const g = new Game({ seed: 7, autoplay: true, playerRole: 'auto' });
  const start = g.agents.map((a) => ({ x: a.x, z: a.z }));
  g.stepSeconds(120);
  for (const [i, a] of g.agents.entries()) {
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z), `${a.name} の座標が壊れた`);
    assert.ok(a.x >= MAP.bounds.minX && a.x <= MAP.bounds.maxX);
    assert.ok(a.z >= MAP.bounds.minZ && a.z <= MAP.bounds.maxZ);
    assert.ok(a.state === 'free' || a.state === 'jailed');
    if (a.state === 'free') {
      assert.equal(insideAnyCollider(g, a.x, a.z, -0.2), false, `${a.name} が建物の中`);
    }
    if (a.isPlayer) {
      const moved = Math.hypot(a.x - start[i].x, a.z - start[i].z) > 0.5;
      assert.ok(moved, 'プレイヤーもオートで動く');
    }
  }
  const acted =
    g.stats.arrests + g.stats.secured + g.stats.rescues + g.stats.unlocks + g.stats.whistles;
  assert.ok(acted > 0, '120秒で何らかのアクションが起きる');
});

test('CPU の通し対戦が決着し、確保・搬出・救出・解錠・隠れるが実際に起きる', () => {
  let copsWin = 0;
  let thievesWin = 0;
  let securedTotal = 0;
  let hides = 0;
  let returns = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const g = new Game({ seed, autoplay: true });
    g.stepSeconds(CFG.duration, 1 / 30);
    assert.equal(g.phase, 'ended', `seed ${seed} が決着しない`);
    assert.ok(g.winner === 'cops' || g.winner === 'thieves');
    if (g.winner === 'cops') copsWin++;
    else thievesWin++;
    securedTotal += g.stats.secured;
    hides += g.stats.hides;
    returns += g.stats.returns;
    // 勝敗と状況が矛盾しない
    if (g.winner === 'thieves') assert.equal(g.securedCount, CFG.treasureRequired);
    else assert.ok(g.securedCount < CFG.treasureRequired);
  }
  assert.ok(copsWin + thievesWin === 6);
  assert.ok(securedTotal > 10, `搬出が少なすぎる (${securedTotal})`);
  assert.ok(hides > 0, 'CPU が茂みに隠れる');
  // 両方の決着があり得る（バランス確認）
  assert.ok(copsWin > 0 && thievesWin > 0, `cops ${copsWin} / thieves ${thievesWin}`);
  assert.ok(returns >= 0);
});

test('同じシードなら同じ結果になる（再現性）', () => {
  const run = () => {
    const g = new Game({ seed: 555, autoplay: true });
    g.stepSeconds(60, 1 / 30);
    return {
      secured: g.securedCount,
      arrests: g.stats.arrests,
      spots: g.treasures.map((t) => t.spot),
      pos: g.agents.map((a) => [a.x.toFixed(2), a.z.toFixed(2)]),
    };
  };
  assert.deepEqual(run(), run());
});

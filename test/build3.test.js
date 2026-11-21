// Build 3 の新機能テスト
//   スパイ呼び名の統一／発覚→牢屋で10秒拘束→相手陣営へ寝返り（1試合1回）／
//   拘束中の扱い（動けない・救出されない・勝敗判定）／警察署の中の牢屋レイアウト／HUD
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  Game,
  ROLE,
  MAP,
  CFG,
  JAIL_SLOTS,
  spyNameKey,
  spyDescKey,
  betrayRoleOf,
} from '../www/src/core.js';
import { STRINGS, t, LANGS } from '../www/src/i18n.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function makeGame(opts = {}) {
  return new Game({ seed: 42, cfg: { arrestRange: 0 }, ...opts });
}

const take = (g, pred) => g.agents.find(pred);

function park(g, keep) {
  for (const a of g.agents) {
    if (keep.includes(a) || a.state === 'jailed') continue;
    a.x = 73;
    a.z = 73;
    a.path = null;
  }
}

// ---- 呼び名の統一 ---------------------------------------------------------
test('片側だけスパイの時はどちらも「人狼（スパイ）」、双方の時は人狼警察／潜入捜査官（FBI）', () => {
  assert.equal(spyNameKey(ROLE.COP_SPY, 'both'), 'role.copSpy');
  assert.equal(spyNameKey(ROLE.THIEF_SPY, 'both'), 'role.thiefSpy');
  assert.equal(spyNameKey(ROLE.COP_SPY, 'cops'), 'role.spyUnified');
  assert.equal(spyNameKey(ROLE.THIEF_SPY, 'thieves'), 'role.spyUnified');
  assert.equal(spyNameKey(ROLE.COP, 'both'), null);
  assert.equal(spyNameKey(ROLE.THIEF, 'both'), null);

  assert.equal(t('role.copSpy', 'ja'), '🐺 人狼警察');
  assert.equal(t('role.thiefSpy', 'ja'), '🕵️ 潜入捜査官（FBI）');
  assert.equal(t('role.spyUnified', 'ja'), '🐺 人狼（スパイ）');
  assert.equal(t('role.copSpy', 'en'), '🐺 Wolf Cop');
  assert.equal(t('role.thiefSpy', 'en'), '🕵️ Undercover Agent (FBI)');

  // 旧 Build 2 の呼び名（内通者・密告者）は使わない
  for (const lang of ['ja', 'en', 'ko', 'zh-Hans', 'zh-Hant']) {
    assert.ok(!/内通者|密告者|Mole|Informer/.test(t('role.copSpy', lang) + t('role.thiefSpy', lang)));
  }
  assert.equal(spyDescKey(ROLE.COP_SPY, 'both'), 'role.copSpy.desc');
  assert.equal(spyDescKey(ROLE.THIEF_SPY, 'thieves'), 'role.spyUnified.desc');
});

test('寝返り先は「見た目どおりの陣営」の通常メンバー', () => {
  assert.equal(betrayRoleOf(ROLE.COP_SPY), ROLE.COP);
  assert.equal(betrayRoleOf(ROLE.THIEF_SPY), ROLE.THIEF);
  assert.equal(betrayRoleOf(ROLE.COP), ROLE.COP);
  assert.equal(betrayRoleOf(ROLE.THIEF), ROLE.THIEF);
});

// ---- 10秒拘束 → 寝返り（Build 5: 15 → 10秒） ------------------------------
test('スパイは発覚すると牢屋へ移送され、10秒間は動けず行動もできない', () => {
  assert.equal(CFG.detainTime, 10);
  const g = makeGame({ playerRole: 'cop', playerSpy: 'always' });
  const spy = g.player;
  assert.equal(spy.role, ROLE.COP_SPY);
  park(g, [spy, take(g, (a) => a.role === ROLE.COP)]);

  g.expose(spy);
  assert.equal(spy.state, 'detained');
  assert.equal(spy.detainLeft, 10);
  assert.equal(g.stats.exposures, 1);
  const slot = spy.jailSlot;
  assert.ok(slot >= 0);
  assert.equal(spy.x, JAIL_SLOTS[slot].x);
  assert.equal(spy.z, JAIL_SLOTS[slot].z);
  assert.equal(g.counts().detained, 1);

  // 移動入力もアクションも効かない
  g.setPlayerMove(1, 0);
  g.setAction(true);
  g.setAction(false);
  g.stepSeconds(2);
  assert.equal(spy.x, JAIL_SLOTS[slot].x, '拘束中は移動しない');
  assert.equal(spy.z, JAIL_SLOTS[slot].z);
  assert.equal(spy.actionT, 0);
  assert.equal(g.stats.unlocks, 0);
  assert.equal(spy.state, 'detained');
  assert.ok(spy.detainLeft > 7.8 && spy.detainLeft < 8.2);
  assert.equal(g.events.some((e) => e.type === 'expose'), true);
});

test('10秒たつと元の陣営を捨て、見た目どおりの陣営へ強制転向する（1試合1回）', () => {
  const g = makeGame({ playerRole: 'thief', playerSpy: 'always', spyMode: 'thieves' });
  const spy = g.player;
  assert.equal(spy.role, ROLE.THIEF_SPY);
  assert.equal(spy.team, 'cop');
  park(g, [spy]);

  g.expose(spy);
  g.stepSeconds(9);
  assert.equal(spy.state, 'detained', '9秒ではまだ拘束中');
  assert.equal(spy.team, 'cop');
  g.stepSeconds(1.2);
  assert.equal(spy.state, 'free');
  assert.equal(spy.role, ROLE.THIEF);
  assert.equal(spy.team, 'thief');
  assert.equal(spy.isSpy, false);
  assert.equal(spy.exposed, false);
  assert.equal(spy.betrayUsed, true);
  assert.equal(g.stats.defections, 1);
  assert.ok(spy.immune > 0 && spy.immune <= CFG.freeImmunity, '転向直後は少しだけ確保されない');
  const betray = g.events.find((e) => e.type === 'betray');
  assert.ok(betray);
  assert.equal(betray.from, 'cop');
  assert.equal(betray.to, 'thief');

  // もう発覚イベントは起きない（1試合1回限り）
  assert.equal(g.expose(spy), false);
  g.stepSeconds(20);
  assert.equal(g.stats.defections, 1);
});

test('寝返った元スパイは新しい陣営の通常メンバーとして動く（警察は逮捕・泥棒はお宝を運べる）', () => {
  // 人狼警察（見た目警官・本当は泥棒）がバレて警察になる
  const g1 = makeGame({ playerRole: 'cop', playerSpy: 'always' });
  const mole = g1.player;
  const thief = take(g1, (a) => a.role === ROLE.THIEF);
  park(g1, [mole, thief]);
  assert.equal(g1.canArrest(mole, thief), false, 'スパイのうちは捕まえられない');
  g1.expose(mole);
  g1.stepSeconds(CFG.detainTime + 0.2);
  assert.equal(mole.role, ROLE.COP);
  thief.state = 'free';
  thief.x = mole.x + 1;
  thief.z = mole.z;
  mole.arrestCd = 0;
  assert.equal(g1.canArrest(mole, thief), true, '寝返り後は警察として確保できる');

  // 潜入捜査官（見た目泥棒・本当は警察）がバレて泥棒になる
  const g2 = makeGame({ playerRole: 'thief', playerSpy: 'always', spyMode: 'thieves' });
  const agent = g2.player;
  park(g2, [agent]);
  assert.equal(agent.role, ROLE.THIEF_SPY);
  g2.expose(agent);
  g2.stepSeconds(CFG.detainTime + 0.2);
  assert.equal(agent.role, ROLE.THIEF);
  const vault = g2.treasures.find((tr) => tr.state === 'vault');
  agent.x = vault.x;
  agent.z = vault.z;
  g2.stepSeconds(0.1);
  assert.equal(agent.carrying, vault.id, '寝返り後はお宝を運べる');
});

test('拘束中は解錠・救出の対象にならず、牢屋のスロットも重ならない', () => {
  const g = makeGame({ playerRole: 'cop', playerSpy: 'never', spyMode: 'none' });
  const cop = g.player;
  const thief = take(g, (a) => a.role === ROLE.THIEF);
  park(g, [cop, thief]);
  // 泥棒を1人牢屋へ、スパイ（別ゲームの設定だがここでは手動で作る）
  const spyGame = makeGame({ playerRole: 'cop', playerSpy: 'always' });
  const spy = spyGame.player;
  assert.equal(spyGame.freeJailSlot() >= 0, true);
  const jailed = spyGame.agents.find((a) => a.role === ROLE.THIEF);
  spyGame.arrest(spyGame.agents.find((a) => a.role === ROLE.COP), jailed);
  const jailedSlot = jailed.jailSlot;
  spyGame.expose(spy);
  assert.notEqual(spy.jailSlot, jailedSlot, '拘束中のスパイは別スロット');
  // 拘束中のスパイは救出されない
  const before = spyGame.agents.filter((a) => a.state === 'free').length;
  spyGame.freeOne('rescue', null);
  assert.equal(spy.state, 'detained');
  assert.ok(spyGame.agents.filter((a) => a.state === 'free').length > before);
});

test('泥棒が全員拘束・牢屋にいても、拘束中のスパイだけで警察の勝ちにはしない', () => {
  const g = makeGame({ playerRole: 'cop', playerSpy: 'never', spyMode: 'cops' });
  const mole = take(g, (a) => a.role === ROLE.COP_SPY);
  assert.ok(mole);
  const thieves = g.agents.filter((a) => a.role === ROLE.THIEF);
  for (const th of thieves) {
    th.state = 'jailed';
    th.jailSlot = g.freeJailSlot();
  }
  // 残る泥棒陣営は人狼警察だけ → 拘束中は「全員確保」にならない
  g.expose(mole);
  g.checkWin();
  assert.equal(g.phase, 'playing');
  // 10秒後に警察へ寝返ると泥棒陣営が空になり、警察の勝ちが成立する
  g.stepSeconds(CFG.detainTime + 0.2);
  assert.equal(mole.team, 'cop');
  g.checkWin();
  assert.equal(g.phase, 'ended');
  assert.equal(g.winner, 'cops');
});

test('相手陣営に現場を見られていないスパイは拘束されない（わざとバレる利敵を防ぐ）', () => {
  const g = makeGame({ playerRole: 'thief', playerSpy: 'always', spyMode: 'thieves' });
  const spy = g.player;
  g.treasures[0].state = 'secured';
  park(g, [spy]);
  spy.x = MAP.gate.x;
  spy.z = MAP.gate.z + 2;
  g.setPlayerMove(0, 0);
  g.setAction(true);
  g.stepSeconds(2);
  assert.equal(spy.exposed, false);
  assert.equal(spy.state, 'free');
  assert.equal(g.stats.exposures, 0);
});

test('拘束はスパイだけ。通常メンバーは発覚しない', () => {
  const g = makeGame({ playerRole: 'cop', playerSpy: 'never', spyMode: 'none' });
  const cop = g.player;
  const thief = take(g, (a) => a.role === ROLE.THIEF);
  assert.equal(g.expose(cop), false);
  assert.equal(g.expose(thief), false);
  assert.equal(cop.state, 'free');
  assert.equal(thief.state, 'free');
});

// ---- 警察署の中の牢屋 -----------------------------------------------------
test('牢屋は警察署の建物と一体（後ろに警察署、床は明るい白、入口から入れ る）', () => {
  const station = MAP.obstacles.find((o) => o.kind === 'police');
  assert.ok(station, '警察署の建物がある');
  assert.equal(station.x, MAP.jail.x);
  // 牢屋の奥（北）に接していて、牢屋の中には食い込まない
  assert.ok(station.z - station.d / 2 >= MAP.jail.z + MAP.jail.d / 2, '警察署は牢屋の奥に接する');
  assert.ok(Math.abs(station.z - (MAP.jail.z + MAP.jail.d / 2 + station.d / 2)) < 1.2);
  assert.equal(station.sign, 'POLICE');
  // 建物が街の外へはみ出さない
  assert.ok(station.z + station.d / 2 <= MAP.bounds.maxZ);
  // 牢屋の入口の隙間は空いている（入れないとゲームにならない）
  const door = MAP.jailDoor;
  const blocking = MAP.jailWalls.filter(
    (w) => Math.abs(door.x - w.x) <= w.w / 2 && Math.abs(door.z - w.z) <= w.d / 2,
  );
  assert.equal(blocking.length, 0, '入口に壁がない');
});

test('街のラベルとミニマップ用データに警察署（POLICE）がある', () => {
  const police = MAP.landmarks.find((l) => l.id === 'jail');
  assert.equal(police.label, 'POLICE');
  assert.equal(police.x, MAP.jail.x);
  assert.equal(police.z, MAP.jail.z);
});

// ---- HUD / 画面構成 --------------------------------------------------------
test('プレイ画面に自分の役＋ミッションのカード、MENU、左端の案内がある', () => {
  const html = read('www/index.html');
  assert.match(html, /id="roleCard"/);
  assert.match(html, /id="roleTag"/);
  assert.match(html, /id="roleText"/);
  assert.match(html, /id="roleChip"/);
  assert.match(html, /id="menuBtn"/);
  assert.match(html, /id="pause"/);
  assert.match(html, /id="pauseHomeYes"/);
  assert.match(html, /id="noteRail"/);
  // 画面中央に出ていた旧バナー・旧note-stackは無い
  assert.ok(!/note-stack/.test(html), '中央の note-stack は撤去');
  assert.ok(!/role-banner/.test(html), '旧 role-banner は撤去');
  // 役カードは左上のHUDエリア内
  assert.match(html, /class="hud-stack"[\s\S]*id="roleCard"/);
});

test('HUDの配置は中央を空ける（役カードは左上・ゲージは右下・案内は左端）', () => {
  const css = read('www/styles.css');
  assert.match(css, /\.hud-stack \{[\s\S]*?left: max\(10px/);
  assert.match(css, /\.note-rail \{[\s\S]*?left: max\(10px/);
  assert.match(css, /\.gauge \{[\s\S]*?right: max\(22px/);
  assert.match(css, /\.hide-gauge \{[\s\S]*?right: max\(22px/);
});

test('役とミッションの文言が14言語の土台（ja/en）で揃っている', () => {
  for (const key of [
    'role.cop',
    'role.thief',
    'role.copSpy',
    'role.thiefSpy',
    'role.spyUnified',
    'mission.cop',
    'mission.thief',
    'mission.copSpy',
    'mission.thiefSpy',
    'role.detainedTag',
    'role.detainedMission',
    'role.detainedHint',
    'role.defectedChip',
    'role.jailedMission',
    'team.cop',
    'team.thief',
    'menu.title',
    'menu.resume',
    'menu.home',
    'menu.homeConfirm',
    'menu.yes',
    'menu.no',
    'howto.betray',
    'howto.betrayDesc',
  ]) {
    assert.ok(STRINGS[key], `${key} がない`);
    assert.ok(STRINGS[key].ja, `${key} の日本語がない`);
    assert.ok(STRINGS[key].en, `${key} の英語がない`);
  }
  assert.equal(LANGS.length, 14);
  // 拘束の文言はプレースホルダ付き
  assert.match(t('role.detainedMission', 'ja'), /\{n\}/);
  assert.match(t('role.detainedMission', 'ja'), /\{team\}/);
  assert.match(t('role.defectedChip', 'en'), /\{team\}/);
  // 10秒・寝返りの説明が入っている（Build 5）
  assert.match(t('howto.betrayDesc', 'ja'), /10秒/);
  assert.match(t('howto.betrayDesc', 'ja'), /寝返/);
});

// ---- アイコン / ビルド番号 -------------------------------------------------
test('iOS アイコンは Build 3 の決定版（1024x1024・RGB・透過なし）', () => {
  const png = readFileSync(
    new URL('../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', import.meta.url),
  );
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const bitDepth = png[24];
  const colorType = png[25]; // 2 = truecolor(RGB), 6 = RGBA
  assert.equal(width, 1024);
  assert.equal(height, 1024);
  assert.equal(bitDepth, 8);
  assert.equal(colorType, 2, '透過なしのRGB PNG');
  const contents = JSON.parse(
    readFileSync(
      new URL('../ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json', import.meta.url),
      'utf8',
    ),
  );
  const img = contents.images[0];
  assert.equal(img.filename, 'AppIcon-512@2x.png');
  assert.equal(img.size, '1024x1024');
  assert.equal(img.platform, 'ios');
});

test('Build 3 のワークフロー定義（1行目が # で始まり、BUILD_NUMBER と preflight が3）', () => {
  const yml = read('docs/ios-testflight-build3.yml');
  assert.equal(yml.split('\n')[0].startsWith('# '), true, '1行目は必ず YAML コメント');
  assert.match(yml, /BUILD_NUMBER: "3"/);
  assert.match(yml, /CURRENT_PROJECT_VERSION = 3;/);
  assert.ok(!/CURRENT_PROJECT_VERSION = 2;/.test(yml));
  assert.match(yml, /hideMax: 5/);
  assert.match(yml, /detainTime: 15/);
  assert.match(yml, /id="roleCard"/);
  assert.match(yml, /id="menuBtn"/);
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  // Build 3 以降、ビルド番号は Build 4 へ引き継がれる（2箇所とも同じ番号で、巻き戻らない）
  const versions = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => Number(m[1]));
  assert.equal(versions.length, 2);
  assert.equal(new Set(versions).size, 1, '2箇所のビルド番号が揃っている');
  assert.ok(versions[0] >= 3, 'ビルド番号が Build 3 より戻っていない');
  assert.ok(!/CURRENT_PROJECT_VERSION = 2;/.test(pbx));
});

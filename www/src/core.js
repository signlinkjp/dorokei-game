// DOROKEI — ドロケー × 人狼（広い街・新ルール版）
// コアロジック（描画に依存しない純粋ロジック）。Node のユニットテストから直接読み込む。
//
// 新ルールの要点
//  - 警察は「探して捕まえる」。全員確保、または時間切れでお宝を1つでも守りきれば勝ち。
//  - 泥棒はお宝を規定数（=配置数5）すべて盗んで脱出ゲートへ運べば勝ち。隠れる・盗む・運ぶ・救出が可能。
//  - お宝を運んでいる間は移動速度が落ちる（6.8 → 5.4）。
//  - お宝を持ったまま捕まると、泥棒は牢屋へ・お宝は街のどこかへランダムに隠し戻される。
//  - 警察側スパイ（人狼警察）は牢屋を解錠できる。泥棒側スパイ（潜入捜査官）はゲートに運ばれたお宝を戻せる。
//  - Build 4: 潜入捜査官は警察の通常逮捕対象外。発覚は「解錠の作業」「お宝を戻す作業」を見られた時だけ。
//  - 解錠中を他の警察に、お宝の隠し戻し中を他の泥棒に近くで見られると正体発覚。
//    発覚後は元の陣営からも捕まえて牢屋へ送れる。
//  - Build 2: 茂みに隠れられるのは1回 最大5秒（解除後3秒のクールタイム）とし、
//    警察は茂みの近くで「捜索」して波紋で炙り出せるようにした。
//  - Build 3: スパイは現場を相手陣営に見られると即逮捕ではなく警察署の牢屋へ移送され、
//    15秒間その場で停止（俯瞰カメラで周りを見られる）。15秒後に見た目どおりの陣営へ
//    強制転向（寝返り）する。強制転向は発覚した時だけ・1試合1回限り。

import { DEFAULT_STAGE, isStagePlayable } from './stages.js';

export const ROLE = Object.freeze({
  COP: 'cop',
  COP_SPY: 'copSpy',
  THIEF: 'thief',
  THIEF_SPY: 'thiefSpy',
});

export const SPY_MODES = Object.freeze({
  both: '両方スパイあり',
  cops: '警察のみ',
  thieves: '泥棒のみ',
  none: 'スパイなし',
});

/** 見た目の陣営（制服の色）。スパイは相手陣営の服を着ている。 */
export function looksLike(role) {
  return role === ROLE.COP || role === ROLE.COP_SPY ? 'cop' : 'thief';
}

/** 本当の勝利目標の陣営。 */
export function teamOf(role) {
  return role === ROLE.COP || role === ROLE.THIEF_SPY ? 'cop' : 'thief';
}

export function isSpyRole(role) {
  return role === ROLE.COP_SPY || role === ROLE.THIEF_SPY;
}

/**
 * スパイの呼び名（Build 3）。
 *  - 片側だけスパイ（cops / thieves）… どちらも「人狼（スパイ）」に統一
 *  - 双方スパイ（both）… 警察側の敵＝「人狼警察」／泥棒側の警察スパイ＝「潜入捜査官（FBI）」
 * 戻り値は i18n のキー（表示は main.js が t() で引く）。
 */
export function spyNameKey(role, spyMode = 'both') {
  if (role === ROLE.COP_SPY) return spyMode === 'both' ? 'role.copSpy' : 'role.spyUnified';
  if (role === ROLE.THIEF_SPY) return spyMode === 'both' ? 'role.thiefSpy' : 'role.spyUnified';
  return null;
}

/** スパイの説明文の i18n キー（呼び名と同じ振り分け） */
export function spyDescKey(role, spyMode = 'both') {
  if (role === ROLE.COP_SPY) return spyMode === 'both' ? 'role.copSpy.desc' : 'role.spyUnified.desc';
  if (role === ROLE.THIEF_SPY) return spyMode === 'both' ? 'role.thiefSpy.desc' : 'role.spyUnified.desc';
  return null;
}

/** 発覚後に寝返る先の役職（見た目どおりの陣営の通常メンバー） */
export function betrayRoleOf(role) {
  if (role === ROLE.COP_SPY) return ROLE.COP;
  if (role === ROLE.THIEF_SPY) return ROLE.THIEF;
  return role;
}

export const CFG = Object.freeze({
  duration: 300, // 広い街に合わせた制限時間（秒）
  treasureCount: 5, // 配置するお宝の数
  treasureRequired: 5, // 泥棒が全部運ばないと勝てない（=1つでも守れば警察の勝ち）
  treasureSpots: 10, // お宝候補スポット数
  speed: { cop: 6.3, thief: 6.9, carry: 6.2 }, // 運搬中は遅くなる（Build 4 で再調整）
  copDash: 1.16, // Build 4: 追跡が強すぎて運搬が全部つかまっていたので緩めた
  radius: 0.62,
  arrestRange: 1.9,
  arrestCooldown: 5.5,
  pickupRange: 2.0,
  actionRange: 2.9,
  actionTime: 1.5,
  whistleRange: 11,
  whistleCooldown: 14,
  pingTtl: 4.0,
  freeImmunity: 2.0,
  exposeRange: 7.5,
  exposeAfter: 0.15,
  detainTime: 10, // スパイ発覚後の拘束秒数（Build 5: 15 → 10 に短縮・トモアキさん指定）
  copVision: 11, // Build 4: 運搬中の泥棒を見つける距離
  thiefDodge: 9.0,
  unlockCooldown: 5.0,
  hideReveal: 3.2, // 隠れている泥棒が見つかる距離
  hideRange: 1.2, // 茂みに隠れられる距離（中心から+半径）
  hideMax: 5, // 1回の隠れは最大5秒（トモアキさん指定）
  hideKeepRange: 7.0, // Build 5: 隠れたまま待つのは警官がこの距離にいる間だけ
  hideCooldown: 3, // 解除後3秒は隠れ直せない（同）
  searchRange: 5.5, // 警察が「捜索」できる茂みまでの距離
  searchRadius: 4.5, // 捜索の波紋が届き、隠れている泥棒を炙り出す距離
  searchCooldown: 1.6, // 連打しすぎないための短いクールタイム
  durations: [180, 300, 420], // 設定で選べる制限時間（3分/5分/7分）
  returnRange: 5.0, // 脱出ゲート前でお宝を隠し戻せる距離
  returnCooldown: 5, // Build 5: お宝を戻したあと、次の戻し作業までの間隔（トモアキさん指定で36 → 5秒）
  bushDodge: 4.5, // 泥棒が茂みへ逃げ込む距離
  // ---- Build 4 ----
  touchRescueRange: 1.6, // 捕まっていない泥棒が牢屋の仲間にタッチして救出できる距離
  touchRescueCd: 1.4, // タッチ救出の連鎖を防ぐクールタイム（誤作動防止）
  stuckAfter: 0.35, // この秒数ぶん進めていなければ「引っかかった」とみなして回り込む
  detourTime: 1.0, // 回り込みを続ける秒数
  spyClearRange: 9.0, // 人狼警察が牢屋へ向かうのは、この距離に警官がいない時だけ
  spyAbortRange: 6.5, // 解錠中にこの距離まで警官が来たら、あきらめて持ち場へ戻る
  spyHoldMin: 5.5, // 人狼警察が同じ狙いを持ち続ける最短秒数（往復の振動を防ぐ）
  // ---- Build 4: 救出直後の保護と、スパイ作業中の接近アラート ----
  rescueImmunity: 2.5, // 救出された泥棒が再確保されない秒数（トモアキさん指定）
  rescueBoost: 1.2, // 救出直後のちょい加速
  rescueBoostTime: 1.5, // 加速が続く秒数
  rescueTouchCd: 5, // Build 5: 救出された側が次に仲間を助けられるのは逃走から5秒後（トモアキさん指定）
  fleeHold: 1.4, // Build 5: 一度逃げ始めたらこの秒数は逃げ続ける（境目での振動を止める）
  fleeRelease: 3.0, // Build 5: 逃げ続ける間は警官をこの距離まで警戒する（4.5 + 3.0 = 7.5m）
  spyAlertRange: 14, // 相手陣営がこの距離に入ったら「⚠ 接近！」を出す（発覚距離7.5より手前）
  // ---- Build 4: 参加人数 ----
  playerOptions: [4, 5, 6, 7, 8, 9, 10], // 設定で選べる参加人数（最大10名）
  minPlayers: 4,
  maxPlayers: 10,
  players: 8, // 既定（警察3・泥棒5）
});

/**
 * 参加人数から警察・泥棒の内訳を決める（Build 4）。
 * 警察は必ず1人以上、泥棒は必ず2人以上になるようにしてある。
 *   10人 → 警察4・泥棒6
 */
export function splitTeams(total = 8) {
  const table = {
    4: [1, 3],
    5: [2, 3],
    6: [2, 4],
    7: [3, 4],
    8: [3, 5],
    9: [4, 5],
    10: [4, 6],
  };
  const n = Math.min(10, Math.max(4, Math.round(Number(total) || 8)));
  const [cops, thieves] = table[n] || table[8];
  return { cops, thieves, total: cops + thieves };
}

/**
 * 参加人数に合わせたお宝の数（Build 4）。泥棒はこの数を全部運べば勝ち。
 *   4人 → 3個 / 6人 → 4個 / 8〜10人 → 5個
 */
export function treasureCountFor(total = 8) {
  const n = Math.min(10, Math.max(4, Math.round(Number(total) || 8)));
  if (n <= 5) return 3;
  if (n <= 7) return 4;
  return 5;
}

// ---- 街のデータ ----------------------------------------------------------
const B = { minX: -75, maxX: 75, minZ: -75, maxZ: 75 };

// 道路（描画とミニマップ、木の自動配置の除外判定に使う）
const ROADS = [
  { x: 0, z: 0, w: 150, d: 11 },
  { x: 0, z: -45, w: 150, d: 10 },
  { x: 0, z: 45, w: 150, d: 10 },
  { x: 0, z: 0, w: 11, d: 150 },
  { x: -45, z: 0, w: 10, d: 150 },
  { x: 45, z: 0, w: 10, d: 150 },
];

// 建物・乗り物などの障害物（x,z=中心 / w,d=幅・奥行き / h=高さ）
const OBSTACLES = [
  // 銀行（北西）
  { x: -62, z: -62, w: 20, d: 14, h: 10.5, color: 0xe9e3d3, kind: 'bank', sign: 'BANK' },
  { x: -62, z: -47.5, w: 8, d: 1.2, h: 2.2, color: 0xcbbf9e, kind: 'wall' },
  // 宝石店（北東）
  { x: 62, z: -62, w: 18, d: 14, h: 9, color: 0xf3c9d4, kind: 'jewelry', sign: 'JEWELRY' },
  // 美術館（東）
  { x: 62, z: -16, w: 18, d: 14, h: 11, color: 0xdfe8f5, kind: 'museum', sign: 'MUSEUM' },
  // 駅（北中央）と駅前
  { x: -22, z: -30, w: 24, d: 14, h: 9, color: 0xc9d8e8, kind: 'station', sign: 'STATION' },
  { x: -22, z: -6.5, w: 5, d: 4, h: 3.6, color: 0xf5cf6a, kind: 'kiosk', sign: 'SHOP' },
  // 倉庫（北中央〜東）
  { x: 18, z: -62, w: 18, d: 12, h: 7.5, color: 0xc3ccd8, kind: 'warehouse', sign: 'DEPOT' },
  { x: 36, z: -62, w: 12, d: 10, h: 6.5, color: 0xe7b9a8, kind: 'house' },
  // 住宅街（西）
  { x: -66, z: -30, w: 12, d: 12, h: 8.5, color: 0x9fd8b6, kind: 'apartment' },
  { x: -66, z: -12, w: 12, d: 10, h: 8.5, color: 0xa9c8ea, kind: 'apartment' },
  { x: -66, z: 20, w: 12, d: 12, h: 6.5, color: 0xf0b183, kind: 'cafe', sign: 'CAFE' },
  { x: -66, z: 36, w: 12, d: 10, h: 6, color: 0xf5d78a, kind: 'shop', sign: 'BAKERY' },
  // 中央〜東の住宅・オフィス
  { x: 18, z: -30, w: 12, d: 12, h: 7.5, color: 0xe0a0a8, kind: 'house' },
  { x: 36, z: -16, w: 12, d: 10, h: 6.5, color: 0xb7a7d6, kind: 'house' },
  { x: 36, z: 20, w: 14, d: 14, h: 10, color: 0x8fb2d9, kind: 'office', sign: 'OFFICE' },
  // 公園のあずまや（中央南西＝公園内）
  { x: -22, z: 34, w: 6, d: 6, h: 4.2, color: 0xd9a86a, kind: 'pavilion' },
  // 商店街（南東）
  { x: 62, z: 16, w: 14, d: 12, h: 6.5, color: 0xf3b7c8, kind: 'shop', sign: 'SHOP' },
  { x: 62, z: 34, w: 14, d: 10, h: 6, color: 0xa8dcc0, kind: 'shop', sign: 'MARKET' },
  { x: 62, z: 62, w: 16, d: 12, h: 7, color: 0xcfc3ea, kind: 'shop', sign: 'ARCADE' },
  { x: 36, z: 62, w: 14, d: 10, h: 6.5, color: 0xf2cf8e, kind: 'shop', sign: 'DINER' },
  { x: -30, z: 62, w: 12, d: 10, h: 6, color: 0xbfe0c8, kind: 'shop', sign: 'CAFE' },
  // 警察署＋牢屋の建物（南西）。牢屋は警察署の中庭（Build 3）
  { x: -62, z: 72.8, w: 22, d: 4.0, h: 7.6, color: 0xeef3fb, kind: 'police', sign: 'POLICE' },
  // 駐車場の車（隠れられる物陰）
  { x: -30, z: -58, w: 3.4, d: 1.8, h: 1.5, color: 0xe0574f, kind: 'car' },
  { x: -30, z: -62, w: 3.4, d: 1.8, h: 1.5, color: 0x4f8ee0, kind: 'car' },
  { x: -30, z: -66, w: 3.4, d: 1.8, h: 1.5, color: 0xe8c34a, kind: 'car' },
  { x: -14, z: -58, w: 3.4, d: 1.8, h: 1.5, color: 0x5fc27e, kind: 'car' },
  { x: -14, z: -62, w: 3.4, d: 1.8, h: 1.5, color: 0xf0f2f7, kind: 'car' },
  { x: -14, z: -66, w: 3.4, d: 1.8, h: 1.5, color: 0x2a3242, kind: 'car' },
  { x: 3, z: 40, w: 3.4, d: 1.8, h: 1.5, color: 0xe0574f, kind: 'car' },
  { x: -52, z: 4, w: 1.8, d: 3.4, h: 1.5, color: 0x4f8ee0, kind: 'car' },
];

// 牢屋（警察署の中庭）
const JAIL = { x: -62, z: 62, w: 20, d: 16 };const JAIL_DOOR = { x: -62, z: 53.6 };

const JAIL_WALLS = [
  { x: -72.4, z: 62, w: 0.8, d: 16.8, h: 1.7 },
  { x: -51.6, z: 62, w: 0.8, d: 16.8, h: 1.7 },
  { x: -62, z: 70.4, w: 21.6, d: 0.8, h: 1.7 },
  { x: -68.5, z: 53.6, w: 7.5, d: 0.8, h: 1.7 },
  { x: -55.5, z: 53.6, w: 7.5, d: 0.8, h: 1.7 },
];

// 脱出ゲート（南）
const GATE = { x: 0, z: 71, w: 14, d: 6 };

export const JAIL_SLOTS = [
  { x: -68, z: 58 },
  { x: -62, z: 58 },
  { x: -56, z: 58 },
  { x: -68, z: 65 },
  { x: -62, z: 65 },
  { x: -56, z: 65 },
  // Build 4: 10人（泥棒6＋拘束中スパイ）でも足りるように2つ追加
  { x: -71, z: 61.5 },
  { x: -53, z: 61.5 },
];

// お宝の候補スポット（この中から 5 箇所をランダムに選ぶ）
const TREASURE_SPOTS = [
  { x: -62, z: -53, name: '銀行前' },
  { x: -56, z: -72, name: '銀行裏口' },
  { x: 62, z: -53, name: '宝石店前' },
  { x: 52, z: -52, name: '宝石店西' },
  { x: -22, z: -14, name: '駅前広場' },
  { x: 62, z: -30, name: '美術館前' },
  { x: -62, z: -20, name: '住宅街の路地' },
  { x: 22, z: 62, name: '商店街裏' },
  { x: -32, z: 22, name: '公園' },
  { x: 10, z: -52, name: '倉庫前' },
];

// 茂み（隠れられる場所）
const BUSHES = [
  { x: -30, z: 10, r: 2.6 },
  { x: -14, z: 28, r: 2.4 },
  { x: -34, z: 34, r: 2.4 },
  { x: -8, z: 16, r: 2.2 },
  { x: -70, z: -44, r: 2.4 },
  { x: -58, z: -20, r: 2.2 },
  { x: 8, z: 52, r: 2.4 },
  { x: 52, z: 50, r: 2.4 },
  { x: 72, z: 20, r: 2.2 },
  { x: 30, z: -52, r: 2.4 },
  { x: -38, z: -16, r: 2.2 },
  { x: -72, z: 52, r: 2.2 },
  { x: -12, z: 66, r: 2.2 },
  { x: 12, z: 66, r: 2.2 },
];

// 公園の池（描画のみ）
const PONDS = [{ x: -22, z: 16, r: 4.2 }];

function rectHas(rect, x, z, pad = 0) {
  return (
    Math.abs(x - rect.x) <= rect.w / 2 + pad && Math.abs(z - rect.z) <= rect.d / 2 + pad
  );
}

function onRoad(x, z, pad = 0) {
  return ROADS.some((r) => rectHas(r, x, z, pad));
}

function seedTrees() {
  const rng = mulberry32(0x0d0e2026);
  const trees = [];
  let guard = 0;
  while (trees.length < 54 && guard++ < 5000) {
    const x = B.minX + 4 + rng() * (B.maxX - B.minX - 8);
    const z = B.minZ + 4 + rng() * (B.maxZ - B.minZ - 8);
    if (onRoad(x, z, 2.5)) continue;
    if (OBSTACLES.some((o) => rectHas(o, x, z, 3.4))) continue;
    if (JAIL_WALLS.some((w) => rectHas(w, x, z, 3.0))) continue;
    if (Math.abs(x - GATE.x) < GATE.w / 2 + 3 && Math.abs(z - GATE.z) < GATE.d / 2 + 3) continue;
    if (TREASURE_SPOTS.some((t) => Math.hypot(t.x - x, t.z - z) < 4)) continue;
    if (BUSHES.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + 2.2)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 4.6)) continue;
    trees.push({ x: +x.toFixed(2), z: +z.toFixed(2), s: 0.85 + rng() * 0.5 });
  }
  return trees;
}

export const MAP = Object.freeze({
  bounds: B,
  roads: ROADS,
  obstacles: OBSTACLES,
  jail: JAIL,
  jailDoor: JAIL_DOOR,
  jailWalls: JAIL_WALLS,
  gate: GATE,
  spawn: {
    cop: { x: -58, z: 44, r: 4.5 },
    thief: { x: -22, z: -46, r: 5.5 },
  },
  treasureSpots: TREASURE_SPOTS,
  bushes: BUSHES,
  ponds: PONDS,
  trees: seedTrees(),
  landmarks: [
    { id: 'bank', label: 'BANK', x: -62, z: -62 },
    { id: 'jewelry', label: 'JEWELRY', x: 62, z: -62 },
    { id: 'museum', label: 'MUSEUM', x: 62, z: -16 },
    { id: 'station', label: 'STATION', x: -22, z: -30 },
    { id: 'park', label: 'PARK', x: -22, z: 22 },
    { id: 'depot', label: 'DEPOT', x: 18, z: -62 },
    { id: 'shops', label: 'SHOPS', x: 62, z: 34 },
    { id: 'jail', label: 'POLICE', x: -62, z: 62 },
    { id: 'gate', label: 'EXIT', x: 0, z: 71 },
  ],
});

export const COP_NAMES = ['ポリスA', 'ポリスB', 'ポリスC', 'ポリスD', 'ポリスE', 'ポリスF'];
export const THIEF_NAMES = [
  'ドロボウA',
  'ドロボウB',
  'ドロボウC',
  'ドロボウD',
  'ドロボウE',
  'ドロボウF',
  'ドロボウG',
  'ドロボウH',
];
/** Build 4: 頭上タグ用の文字。名前の末尾と同じ字を出すので、名前とタグがずれない */
export const TAG_LETTERS = 'ABCDEFGHIJ'.split('');

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function isInZone(p, zone) {
  return Math.abs(p.x - zone.x) <= zone.w / 2 && Math.abs(p.z - zone.z) <= zone.d / 2;
}

// ---- 経路探索（グリッドA*） ------------------------------------------------
// 広い街では壁に引っかかって棒立ちになるので、2m グリッドの A* で回り込む。
export class Nav {
  constructor(bounds, colliders, cell = 2, inflate = 0.85) {
    this.bounds = bounds;
    this.cell = cell;
    this.inflate = inflate;
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.colliders = colliders;
    for (let cz = 0; cz < this.rows; cz++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const p = this.cellCenter(cx, cz);
        this.blocked[cz * this.cols + cx] = this.solidAt(p.x, p.z, inflate) ? 1 : 0;
      }
    }
    this._g = new Float32Array(this.cols * this.rows);
    this._f = new Float32Array(this.cols * this.rows);
    this._from = new Int32Array(this.cols * this.rows);
    this._seen = new Uint32Array(this.cols * this.rows);
    this._closed = new Uint32Array(this.cols * this.rows);
    this._stamp = 0;
  }

  solidAt(x, z, pad = this.inflate) {
    for (const o of this.colliders) {
      if (rectHas(o, x, z, pad)) return true;
    }
    return false;
  }

  cellCenter(cx, cz) {
    return {
      x: this.bounds.minX + (cx + 0.5) * this.cell,
      z: this.bounds.minZ + (cz + 0.5) * this.cell,
    };
  }

  cellOf(x, z) {
    const cx = clamp(Math.floor((x - this.bounds.minX) / this.cell), 0, this.cols - 1);
    const cz = clamp(Math.floor((z - this.bounds.minZ) / this.cell), 0, this.rows - 1);
    return { cx, cz };
  }

  isFree(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) return false;
    return this.blocked[cz * this.cols + cx] === 0;
  }

  /** 一番近い通行可能セル（壁にめり込んだ時用） */
  nearestFree(cx, cz, maxRing = 6) {
    if (this.isFree(cx, cz)) return { cx, cz };
    for (let r = 1; r <= maxRing; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          if (this.isFree(cx + dx, cz + dz)) return { cx: cx + dx, cz: cz + dz };
        }
      }
    }
    return null;
  }

  /** 2点を結ぶ直線が障害物をまたがないか（セル単位でサンプリング） */
  lineFree(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (this.solidAt(x, z, this.inflate * 0.85)) return false;
    }
    return true;
  }

  findPath(ax, az, bx, bz) {
    const sc = this.cellOf(ax, az);
    const gc = this.cellOf(bx, bz);
    const start = this.nearestFree(sc.cx, sc.cz, 8);
    const goal = this.nearestFree(gc.cx, gc.cz, 8);
    if (!start || !goal) return null;
    const cols = this.cols;
    const startIdx = start.cz * cols + start.cx;
    const goalIdx = goal.cz * cols + goal.cx;
    if (startIdx === goalIdx) return [{ x: bx, z: bz }];

    const stamp = ++this._stamp;
    const g = this._g;
    const f = this._f;
    const from = this._from;
    const seen = this._seen;
    const closed = this._closed;

    const open = [startIdx];
    g[startIdx] = 0;
    f[startIdx] = 0;
    seen[startIdx] = stamp;
    from[startIdx] = -1;

    const h = (idx) => {
      const dx = Math.abs((idx % cols) - goal.cx);
      const dz = Math.abs(Math.floor(idx / cols) - goal.cz);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    const push = (idx) => {
      open.push(idx);
      let i = open.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (f[open[p]] <= f[open[i]]) break;
        [open[p], open[i]] = [open[i], open[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = open[0];
      const last = open.pop();
      if (open.length) {
        open[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < open.length && f[open[l]] < f[open[m]]) m = l;
          if (r < open.length && f[open[r]] < f[open[m]]) m = r;
          if (m === i) break;
          [open[m], open[i]] = [open[i], open[m]];
          i = m;
        }
      }
      return top;
    };

    let guard = 0;
    while (open.length && guard++ < 40000) {
      const cur = pop();
      if (cur === goalIdx) break;
      if (closed[cur] === stamp) continue;
      closed[cur] = stamp;
      const cx = cur % cols;
      const cz = Math.floor(cur / cols);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.isFree(nx, nz)) continue;
          // 角をすり抜けない
          if (dx && dz && (!this.isFree(cx + dx, cz) || !this.isFree(cx, cz + dz))) continue;
          const idx = nz * cols + nx;
          if (closed[idx] === stamp) continue;
          const step = dx && dz ? Math.SQRT2 : 1;
          const tentative = g[cur] + step;
          if (seen[idx] !== stamp || tentative < g[idx]) {
            seen[idx] = stamp;
            g[idx] = tentative;
            f[idx] = tentative + h(idx);
            from[idx] = cur;
            push(idx);
          }
        }
      }
    }

    if (seen[goalIdx] !== stamp) return null;
    // 経路を復元
    const cells = [];
    let cur = goalIdx;
    let guard2 = 0;
    while (cur !== -1 && guard2++ < 5000) {
      cells.push(cur);
      if (cur === startIdx) break;
      cur = from[cur];
    }
    if (cells[cells.length - 1] !== startIdx) return null;
    cells.reverse();
    const pts = cells.map((idx) => this.cellCenter(idx % cols, Math.floor(idx / cols)));
    // 見通しの良い区間は間引いて自然な動きにする
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      for (; j > i + 1; j--) {
        if (this.lineFree(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) break;
      }
      out.push(pts[j]);
      i = j;
    }
    if (!out.length) out.push(pts[pts.length - 1]);
    out[out.length - 1] = { x: bx, z: bz };
    return out;
  }
}

/**
 * 役職割り当て。
 * spyMode: 'both' | 'cops' | 'thieves' | 'none'
 *   cops    = 警察陣営に「内通者」(見た目は警官 / 目標は泥棒の勝ち)
 *   thieves = 泥棒陣営に「潜入捜査官」(見た目は泥棒 / 目標は警察の勝ち)
 * playerRole: 'auto' | 'cop' | 'thief'
 * playerSpy:  'random' | 'always' | 'never'
 */
export function assignRoles(opts = {}) {
  const {
    cops = 3,
    thieves = 5,
    spyMode = 'both',
    playerRole = 'auto',
    playerSpy = 'random',
    seed = 7,
  } = opts;
  const rng = mulberry32(seed);
  const copSpyCount = (spyMode === 'both' || spyMode === 'cops') && cops >= 2 ? 1 : 0;
  const thiefSpyCount = (spyMode === 'both' || spyMode === 'thieves') && thieves >= 2 ? 1 : 0;

  const copRoles = Array.from({ length: cops }, (_, i) =>
    i < copSpyCount ? ROLE.COP_SPY : ROLE.COP,
  );
  const thiefRoles = Array.from({ length: thieves }, (_, i) =>
    i < thiefSpyCount ? ROLE.THIEF_SPY : ROLE.THIEF,
  );
  shuffle(copRoles, rng);
  shuffle(thiefRoles, rng);

  const team = playerRole === 'auto' ? (rng() < 0.5 ? 'cop' : 'thief') : playerRole;
  const pool = team === 'cop' ? copRoles : thiefRoles;
  const spyIdx = pool.findIndex((r) => isSpyRole(r));
  const normalIdx = pool.findIndex((r) => !isSpyRole(r));
  const wantSpy = playerSpy === 'always' ? true : playerSpy === 'never' ? false : rng() < 0.35;
  const idx = wantSpy && spyIdx >= 0 ? spyIdx : normalIdx >= 0 ? normalIdx : 0;
  const playerResolved = pool.splice(idx, 1)[0];

  const roster = [{ role: playerResolved, isPlayer: true }];
  for (const role of copRoles) roster.push({ role, isPlayer: false });
  for (const role of thiefRoles) roster.push({ role, isPlayer: false });

  return roster.map((r, i) => ({
    id: i,
    role: r.role,
    team: teamOf(r.role),
    isPlayer: !!r.isPlayer,
    isSpy: isSpyRole(r.role),
    looks: looksLike(r.role),
  }));
}

export class Game {
  constructor(opts = {}) {
    this.cfg = { ...CFG, ...(opts.cfg || {}) };
    this.stage = opts.stage ?? DEFAULT_STAGE;
    if (!isStagePlayable(this.stage)) {
      throw new Error(`DOROKEI: 遊べないステージです (${this.stage})`);
    }
    this.seed = opts.seed ?? 20261121;
    this.spyMode = opts.spyMode ?? 'both';
    // Build 4: 参加人数（4〜10人）。人数から警察・泥棒の内訳を自動で決める。
    const explicitTeams = opts.cops != null || opts.thieves != null;
    this.split = explicitTeams
      ? {
          cops: opts.cops ?? 3,
          thieves: opts.thieves ?? 5,
          total: (opts.cops ?? 3) + (opts.thieves ?? 5),
        }
      : splitTeams(opts.players ?? this.cfg.players ?? 8);
    this.players = this.split.total;
    // Build 4: 人数に合わせてお宝の必要数を自動調整（4人=3個 / 6人=4個 / 8〜10人=5個）
    const treasureGoal = opts.treasureCount ?? treasureCountFor(this.players);
    this.cfg = {
      ...this.cfg,
      treasureCount: Math.min(this.cfg.treasureSpots, treasureGoal),
      treasureRequired: treasureGoal,
    };
    this.rng = mulberry32(this.seed);
    this.autoplay = !!opts.autoplay;
    this.phase = 'playing';
    this.winner = null;
    this.reason = '';
    this.t = 0;
    this.time = this.cfg.duration;
    this.events = [];
    this.pings = [];
    this.effects = []; // 捜索の波紋などの見た目用エフェクト
    this.stats = {
      arrests: 0,
      rescues: 0,
      unlocks: 0,
      secured: 0,
      whistles: 0,
      exposures: 0,
      returns: 0,
      hides: 0,
      searches: 0,
      defections: 0,
      touchRescues: 0,
    };
    this.input = { x: 0, z: 0, action: false };

    const roster = assignRoles({
      cops: this.split.cops,
      thieves: this.split.thieves,
      spyMode: opts.spyMode ?? 'both',
      playerRole: opts.playerRole ?? 'auto',
      playerSpy: opts.playerSpy ?? 'random',
      seed: this.seed,
    });

    this.colliders = [...MAP.obstacles, ...MAP.jailWalls];

    let copIdx = 0;
    let thiefIdx = 0;
    let tagSeq = 0; // 頭上タグの字（A/B/…）は10人全体で重ならないように通し番号で振る
    // Build 4: 人数が増えても開始位置が重ならないよう、人数に応じて輪を広げる
    const nCopLooks = roster.filter((r) => r.looks === 'cop').length;
    const nThiefLooks = roster.filter((r) => r.looks === 'thief').length;
    this.agents = roster.map((r) => {
      const base = r.looks === 'cop' ? MAP.spawn.cop : MAP.spawn.thief;
      const k = r.looks === 'cop' ? copIdx++ : thiefIdx++;
      const ring = Math.max(5, r.looks === 'cop' ? nCopLooks : nThiefLooks);
      const ang = (k / ring) * Math.PI * 2 + 0.4;
      const rad = base.r * (0.5 + 0.5 * (((k % 3) + 1) / 3));
      const a = {
        id: r.id,
        name: `${r.looks === 'cop' ? 'ポリス' : 'ドロボウ'}${TAG_LETTERS[tagSeq++ % TAG_LETTERS.length]}`,
        tag: TAG_LETTERS[(tagSeq - 1) % TAG_LETTERS.length], // 頭上タグの字（寝返っても変わらない）
        role: r.role,
        team: r.team,
        isPlayer: r.isPlayer,
        isSpy: r.isSpy,
        looks: r.looks,
        x: base.x + Math.cos(ang) * rad,
        z: base.z + Math.sin(ang) * rad,
        dir: 0,
        state: 'free',
        carrying: null,
        hidden: false,
        hideLeft: 0, // この隠れの残り秒数（最大 cfg.hideMax）
        hideCd: 0, // 解除後のクールタイム
        searchCd: 0, // 警察の捜索クールタイム
        arrestCd: 0,
        immune: 0,
        actionT: 0,
        unlockCd: 0,
        whistleCd: 0,
        exposed: false,
        betrayUsed: false, // 強制転向は1試合1回まで
        detainLeft: 0, // 「拘束」残り秒数
        detainedFrom: null, // 発覚前の陣営
        moving: false,
        jailSlot: -1,
        path: null,
        pathTarget: null,
        pathAge: 0,
        stuckT: 0, // 進めていない時間（壁・角での引っかかり検知）
        detour: null, // 引っかかった時に一時的に向かう回り込み地点
        escapeT: 0, // 救出直後の逃走ブースト
        jailedAt: 0, // 牢屋に入った時刻（Build 4: 先に捕まった順の救出のため）
        touchCd: 0, // タッチ救出の連鎖防止（Build 5: 救出された側は5秒）
        ai: {
          wp: Math.floor(this.rng() * 8),
          retarget: 0,
          hideFor: 0,
          hideCd: 0,
          fleeT: 0, // Build 5: 逃げ続ける残り秒数（警官との境目での振動防止）
          returnCd: 0, // お宝を戻したあとのクールタイム（潜入捜査官）
          spyGoal: 'roam', // 人狼警察の狙い（unlock / cover / roam）
          spyHold: 0, // その狙いを持ち続ける残り秒数
          spyCover: null, // 警官から離れた持ち場
        },
      };
      // 開始位置が建物にめり込んでいたら押し出す
      const solved = this.collide(a.x, a.z, this.cfg.radius);
      a.x = solved.x;
      a.z = solved.z;
      return a;
    });

    this.nav = new Nav(MAP.bounds, this.colliders, 2, 0.85);

    // お宝は候補10箇所から5箇所をランダムに選んで配置
    const spotOrder = shuffle(
      MAP.treasureSpots.map((s, i) => i),
      this.rng,
    );
    this.treasureSpots = MAP.treasureSpots;
    this.treasures = spotOrder
      .slice(0, this.cfg.treasureCount)
      .map((spotIdx, i) => {
        const p = MAP.treasureSpots[spotIdx];
        return {
          id: i,
          spot: spotIdx,
          x: p.x,
          z: p.z,
          home: { x: p.x, z: p.z },
          state: 'vault',
          carrier: null,
        };
      });
  }

  get player() {
    return this.agents.find((a) => a.isPlayer) || null;
  }

  get securedCount() {
    return this.treasures.filter((t) => t.state === 'secured').length;
  }

  setPlayerMove(x, z) {
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    this.input.x = x || 0;
    this.input.z = z || 0;
  }

  /** ボタンを押した瞬間の即時アクション（隠れる・捜索） */
  setAction(down) {
    const wasDown = this.input.action;
    this.input.action = !!down;
    if (wasDown || !down) return;
    const p = this.player;
    if (!p || p.state !== 'free') return;
    if (p.looks === 'thief') {
      if (p.hidden) this.unhide(p);
      else this.hide(p);
    } else if (p.looks === 'cop' && !p.isSpy) {
      this.search(p);
    }
  }

  speedOf(a) {
    if (a.carrying != null) return this.cfg.speed.carry;
    return this.cfg.speed[a.looks] || 6;
  }

  bushAt(a, extra = this.cfg.hideRange) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < MAP.bushes.length; i++) {
      const b = MAP.bushes[i];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d <= b.r + extra && d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** 中心距離で一番近い茂み（捜索の可否判定用） */
  nearestBush(a, range = Infinity) {
    let index = -1;
    let distTo = Infinity;
    for (let i = 0; i < MAP.bushes.length; i++) {
      const b = MAP.bushes[i];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d <= range && d < distTo) {
        distTo = d;
        index = i;
      }
    }
    return { index, dist: distTo };
  }

  nearest(from, pred, max = Infinity) {
    let best = null;
    let bd = max;
    for (const a of this.agents) {
      if (a === from || !pred(a)) continue;
      const d = dist(from, a);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return { agent: best, dist: bd };
  }

  jailedTeammates(agent) {
    return this.agents.filter((a) => a.team === agent.team && a.state === 'jailed');
  }

  /** 隠れている相手は近くに来ないと見えない */
  canSee(observer, target) {
    if (target.hidden) return dist(observer, target) <= this.cfg.hideReveal;
    return true;
  }

  /** スパイの現場を目撃した相手陣営（見つかると発覚する） */
  witnessOf(agent) {
    const found = this.nearest(
      agent,
      (o) =>
        o !== agent &&
        o.state === 'free' &&
        o.team !== agent.team &&
        !o.hidden &&
        dist(agent, o) <= this.cfg.exposeRange,
      this.cfg.exposeRange,
    );
    return found.agent || null;
  }

  /**
   * Build 4: スパイ作業中の「⚠ 接近！」アラート。
   * 相手陣営（自分を発覚させられる側）が cfg.spyAlertRange（14m）以内に入ったら知らせる。
   * 発覚する距離（7.5m）より手前で気づけるので、駆け引きできる。
   */
  spyAlert(agent) {
    if (!agent || !agent.isSpy || agent.state !== 'free') return null;
    const found = this.nearest(
      agent,
      (o) => o !== agent && o.state === 'free' && !o.hidden && o.team !== agent.team,
      this.cfg.spyAlertRange + 0.01,
    );
    if (!found.agent) return null;
    return {
      dist: found.dist,
      agent: found.agent,
      danger: found.dist <= this.cfg.exposeRange + 2.5,
      working: agent.actionT > 0,
    };
  }

  /**
   * 捕まえられるか。
   *  - 警官の見た目 → 泥棒の見た目を確保できる。正体発覚した内通者（警官の見た目）も確保できる。
   *  - 泥棒の見た目 → 正体発覚した潜入捜査官（泥棒の見た目）だけを牢屋へ送れる。
   *  - スパイ自身は捕まえる側には回れない（正体を隠すため）。
   */
  canArrest(actor, target) {
    if (this.phase !== 'playing') return false;
    if (!actor || !target || actor === target) return false;
    if (target.state !== 'free') return false;
    if (target.immune > 0) return false;
    if (target.hidden && dist(actor, target) > this.cfg.hideReveal) return false;
    // スパイは正体を隠しているので、自分からは捕まえられない（捕まえるのは本来の陣営の役目）
    if (actor.isSpy) return false;
    if (actor.looks === 'cop') {
      // Build 4: 潜入捜査官（泥棒の見た目・本当は警察）は警察の通常逮捕対象から外す。
      // 見た目が泥棒でも、警察にはつかまらない（ゲートのお宝戻しを見られて初めて正体発覚）。
      if (target.looks === 'thief' && target.role !== ROLE.THIEF_SPY) return true;
      if (target.role === ROLE.COP_SPY && target.exposed) return true;
      return false;
    }
    if (target.role === ROLE.THIEF_SPY && target.exposed) return true;
    return false;
  }

  freeJailSlot() {
    const used = new Set(
      this.agents
        .filter((a) => a.state === 'jailed' || a.state === 'detained')
        .map((a) => a.jailSlot),
    );
    for (let i = 0; i < JAIL_SLOTS.length; i++) if (!used.has(i)) return i;
    return 0;
  }

  arrest(cop, thief) {
    if (!this.canArrest(cop, thief)) return false;
    if (cop.arrestCd > 0) return false;
    if (thief.carrying != null) {
      const t = this.treasures[thief.carrying];
      thief.carrying = null;
      if (t) this.hideBackTreasure(t);
    }
    thief.hidden = false;
    const slot = this.freeJailSlot();
    thief.state = 'jailed';
    thief.jailSlot = slot;
    thief.jailedAt = this.t; // 先に捕まった順の判定用（Build 4）
    thief.actionT = 0;
    thief.path = null;
    thief.x = JAIL_SLOTS[slot].x;
    thief.z = JAIL_SLOTS[slot].z;
    cop.arrestCd = this.cfg.arrestCooldown;
    this.stats.arrests++;
    this.pushEvent({
      type: 'arrest',
      by: cop.id,
      target: thief.id,
      label: `${thief.name}を確保!`,
    });
    return true;
  }

  /**
   * 牢屋から助ける相手の優先順位（Build 4）。
   *   1. 直接タッチした相手
   *   2. 人間プレイヤー（YOU）
   *   3. 先に捕まった順（古い jailedAt）
   */
  pickJailTarget(jailed, direct = null) {
    if (!jailed.length) return null;
    if (direct && jailed.includes(direct)) return direct;
    const player = jailed.find((a) => a.isPlayer);
    if (player) return player;
    let best = jailed[0];
    for (const a of jailed) {
      const at = a.jailedAt ?? 0;
      const bestAt = best.jailedAt ?? 0;
      if (at < bestAt || (at === bestAt && a.id < best.id)) best = a;
    }
    return best;
  }

  freeOne(cause, causeAgent, targetAgent = null) {
    const jailed = this.agents.filter((a) => a.team === 'thief' && a.state === 'jailed');
    if (!jailed.length) return null;
    const target = this.pickJailTarget(jailed, targetAgent);
    if (!target) return null;
    target.state = 'free';
    target.jailSlot = -1;
    target.jailedAt = 0;
    // Build 4: 救出された直後は2.5秒間つかまらず、少しだけ足が速い（逃げ切れるように）
    target.immune = this.cfg.rescueImmunity;
    target.escapeT = this.cfg.rescueBoostTime;
    target.actionT = 0;
    target.hidden = false;
    target.path = null;
    // Build 5: 牢屋に入る前の経路・回り込み・引っかかり・隠れ予定を持ち越さない
    // （持ち越すと、出た直後に古い目標へ歩いたり、その場で震えたりする）
    target.pathTarget = null;
    target.pathAge = 0;
    target.detour = null;
    target.stuckT = 0;
    target.ai.hideFor = 0;
    target.ai.fleeT = 0;
    // Build 5: 助けられた側の泥棒は、自分の逃走から5秒たつまで次の仲間を助けられない
    // （タッチ救出も牢屋前の長押し救出も同じクールタイムで止める）
    target.touchCd = Math.max(target.touchCd || 0, this.cfg.rescueTouchCd);
    target.x = MAP.jailDoor.x + (this.rng() - 0.5) * 2;
    target.z = MAP.jailDoor.z - 1.8;
    if (cause === 'touch') {
      this.stats.rescues++;
      this.pushEvent({
        type: 'rescue',
        by: causeAgent?.id ?? null,
        target: target.id,
        label: `🆘 ${target.name}をタッチ救出!（${causeAgent?.name ?? '仲間'}と逃走）`,
      });
    } else if (cause === 'unlock') {
      this.stats.unlocks++;
      this.pushEvent({
        type: 'unlock',
        by: causeAgent?.id ?? null,
        target: target.id,
        label: `${target.name}が解錠で脱獄!`,
      });
    } else {
      this.stats.rescues++;
      this.pushEvent({
        type: 'rescue',
        by: causeAgent?.id ?? null,
        target: target.id,
        label: `${target.name}を救出!`,
      });
    }
    return target;
  }

  /**
   * スパイの正体発覚（Build 3）。
   * 即逮捕ではなく警察署の牢屋へ移送し、cfg.detainTime 秒の拘束（俯瞰カメラ）に入る。
   * 拘束が終わると見た目どおりの陣営へ強制転向する（1試合1回のみ）。
   */
  expose(agent, witness) {
    if (!agent || agent.exposed || !agent.isSpy) return false;
    if (agent.betrayUsed) return false;
    agent.exposed = true;
    this.stats.exposures++;
    this.detain(agent, witness);
    this.pushEvent({
      type: 'expose',
      by: agent.id,
      witness: witness?.id ?? null,
      label: `⚠️ 正体発覚! ${agent.name} → 牢屋で${this.cfg.detainTime}秒拘束`,
    });
    return true;
  }

  /** 発覚したスパイを警察署の牢屋へ移送して拘束する（移動・行動とも停止） */
  detain(agent, witness) {
    if (agent.carrying != null) {
      const t = this.treasures[agent.carrying];
      agent.carrying = null;
      if (t) this.hideBackTreasure(t);
    }
    agent.hidden = false;
    agent.hideLeft = 0;
    agent.actionT = 0;
    agent.path = null;
    agent.moving = false;
    agent.state = 'detained';
    agent.detainLeft = this.cfg.detainTime;
    agent.detainedFrom = agent.team;
    const slot = this.freeJailSlot();
    agent.jailSlot = slot;
    agent.x = JAIL_SLOTS[slot].x;
    agent.z = JAIL_SLOTS[slot].z;
    agent.dir = Math.PI;
    return agent;
  }

  /** 拘束が明けたスパイを見た目どおりの陣営へ強制転向（寝返り）させる */
  betray(agent) {
    if (!agent || agent.state !== 'detained') return false;
    const next = betrayRoleOf(agent.role);
    const from = agent.team;
    agent.role = next;
    agent.team = teamOf(next);
    agent.isSpy = false;
    agent.exposed = false;
    agent.betrayUsed = true;
    agent.state = 'free';
    agent.jailSlot = -1;
    agent.detainLeft = 0;
    agent.immune = this.cfg.freeImmunity;
    agent.actionT = 0;
    agent.whistleCd = 0;
    agent.unlockCd = 0;
    agent.path = null;
    // Build 5: 拘束前の経路・回り込み・引っかかりを持ち越さない
    agent.pathTarget = null;
    agent.pathAge = 0;
    agent.detour = null;
    agent.stuckT = 0;
    agent.ai.hideFor = 0;
    agent.ai.fleeT = 0;
    agent.x = MAP.jailDoor.x + (this.rng() - 0.5) * 2;
    agent.z = MAP.jailDoor.z - 1.8;
    this.stats.defections++;
    const toLabel = agent.team === 'cop' ? '警察' : '泥棒';
    this.pushEvent({
      type: 'betray',
      by: agent.id,
      from,
      to: agent.team,
      label: `🎭 ${agent.name}が${toLabel}へ寝返った!`,
    });
    return true;
  }

  hide(agent) {
    if (this.phase !== 'playing') return false;
    if (agent.state !== 'free' || agent.looks !== 'thief') return false;
    if (agent.carrying != null) return false;
    if (agent.hidden) return false;
    if (agent.hideCd > 0) return false; // 解除後のクールタイム中
    const b = this.bushAt(agent);
    if (b < 0) return false;
    agent.hidden = true;
    agent.hideLeft = this.cfg.hideMax;
    agent.actionT = 0;
    agent.path = null;
    this.stats.hides++;
    this.pushEvent({ type: 'hide', by: agent.id, label: `${agent.name}が物陰に隠れた` });
    return true;
  }

  /**
   * 隠れ解除。reason 'timeout' のときだけ「隠れ続けられなかった」演出を出す。
   * 解除後は必ずクールタイム（cfg.hideCooldown）が入る。
   */
  unhide(agent, reason = 'manual') {
    if (!agent.hidden) return false;
    agent.hidden = false;
    agent.hideLeft = 0;
    agent.hideCd = this.cfg.hideCooldown;
    agent.ai.hideCd = Math.max(agent.ai.hideCd, 1.5);
    if (reason === 'timeout') {
      this.pushEvent({
        type: 'unhide',
        by: agent.id,
        reason,
        label: `${agent.name}が隠れ続けられず姿を現した`,
      });
    }
    return true;
  }

  // ---- 警察の「捜索」 -----------------------------------------------------
  /** 茂みの近くにいて、まだ捜索できる状態か */
  canSearch(agent) {
    if (this.phase !== 'playing') return false;
    if (!agent || agent.state !== 'free') return false;
    if (agent.looks !== 'cop') return false;
    if (agent.isSpy) return false; // スパイは捕まえる側に回らない
    if (agent.searchCd > 0) return false;
    return this.nearestBush(agent, this.cfg.searchRange).index >= 0;
  }

  /**
   * 足元から波紋を広げ、cfg.searchRadius 以内に隠れている泥棒を炙り出して確保する。
   * 隠れていない泥棒には効かない（近づいて捕まえる）。
   */
  search(agent) {
    if (!this.canSearch(agent)) return { ok: false, revealed: 0, arrested: null };
    agent.searchCd = this.cfg.searchCooldown;
    this.stats.searches++;
    this.effects.push({
      type: 'search',
      x: agent.x,
      z: agent.z,
      age: 0,
      ttl: 0.75,
      radius: this.cfg.searchRadius,
    });

    const found = [];
    for (const o of this.agents) {
      if (o === agent || !o.hidden || o.looks !== 'thief') continue;
      if (dist(agent, o) > this.cfg.searchRadius) continue;
      found.push(o);
    }

    let arrested = null;
    for (const o of found) {
      o.hidden = false;
      o.hideLeft = 0;
      o.hideCd = this.cfg.hideCooldown;
      if (agent.arrestCd <= 0 && this.canArrest(agent, o) && this.arrest(agent, o)) {
        arrested = o;
      }
    }

    this.pushEvent({
      type: 'search',
      by: agent.id,
      count: found.length,
      label: found.length
        ? `🔍 捜索で${found.length}人を発見${arrested ? '・確保!' : ''}`
        : '🔍 捜索（反応なし）',
    });
    return { ok: true, revealed: found.length, arrested: arrested ? arrested.id : null };
  }

  updateEffects(dt) {
    for (const e of this.effects) e.age += dt;
    this.effects = this.effects.filter((e) => e.age < e.ttl);
  }

  pickup(agent, treasure) {
    if (treasure.state !== 'vault') return false;
    if (agent.role === ROLE.THIEF_SPY) return false; // 潜入捜査官は運ばない
    treasure.state = 'carried';
    treasure.carrier = agent.id;
    agent.carrying = treasure.id;
    agent.hidden = false;
    this.pushEvent({ type: 'pickup', by: agent.id, label: `${agent.name}がお宝を奪取` });
    return true;
  }

  deliver(agent) {
    const t = this.treasures[agent.carrying];
    if (!t) return false;
    t.state = 'secured';
    t.carrier = null;
    agent.carrying = null;
    this.stats.secured = this.securedCount;
    this.pushEvent({
      type: 'deliver',
      by: agent.id,
      label: `お宝を搬出! (${this.securedCount}/${this.cfg.treasureRequired})`,
    });
    return true;
  }

  /** お宝を街のどこか（候補スポット）へランダムに隠し戻す */
  hideBackTreasure(t) {
    if (!t) return null;
    const occupied = new Set(
      this.treasures.filter((o) => o !== t && o.state === 'vault').map((o) => o.spot),
    );
    const free = this.treasuresSpotsFree(occupied, t.spot);
    const pick = free.length
      ? free[Math.floor(this.rng() * free.length)]
      : Math.floor(this.rng() * this.treasureSpots.length);
    const p = this.treasureSpots[pick];
    t.spot = pick;
    t.x = p.x;
    t.z = p.z;
    t.state = 'vault';
    t.carrier = null;
    const carrier = this.agents.find((a) => a.carrying === t.id);
    if (carrier) carrier.carrying = null;
    this.stats.secured = this.securedCount;
    this.pushEvent({ type: 'hideback', by: null, label: `お宝が「${p.name}」に隠し戻された` });
    return p;
  }

  treasuresSpotsFree(occupied, exclude) {
    const out = [];
    for (let i = 0; i < this.treasureSpots.length; i++) {
      if (i === exclude) continue;
      if (occupied.has(i)) continue;
      out.push(i);
    }
    return out;
  }

  /** 泥棒側スパイ: 脱出ゲートへ運ばれたお宝を隠し戻す */
  returnTreasure(agent) {
    if (this.phase !== 'playing' || agent.role !== ROLE.THIEF_SPY) return false;
    const secured = this.treasures.filter((t) => t.state === 'secured');
    if (!secured.length) return false;
    const t = secured[Math.floor(this.rng() * secured.length)];
    this.hideBackTreasure(t);
    this.stats.returns++;
    this.stats.secured = this.securedCount;
    agent.ai.returnCd = this.cfg.returnCooldown;
    this.pushEvent({ type: 'return', by: agent.id, label: `お宝が戻された! (${this.securedCount}/${this.cfg.treasureRequired})` });
    return true;
  }

  /**
   * Build 4: 旧アクションは廃止。潜入捜査官の仕事は「ゲートに運ばれたお宝を戻す」だけ。
   * （呼び出し側の互換のために残してあるが、何も起きない）
   */
  whistle() {
    return false;
  }

  pushEvent(e) {
    e.t = this.time;
    this.events.push(e);
    if (this.events.length > 30) this.events.shift();
  }

  updatePings(dt) {
    for (const p of this.pings) p.ttl -= dt;
    this.pings = this.pings.filter((p) => p.ttl > 0);
  }

  counts() {
    const copTeam = this.agents.filter((a) => a.team === 'cop');
    const thiefTeam = this.agents.filter((a) => a.team === 'thief');
    return {
      cops: copTeam.length,
      copFree: copTeam.filter((a) => a.state === 'free').length,
      thieves: thiefTeam.length,
      thiefFree: thiefTeam.filter((a) => a.state === 'free').length,
      jailed: thiefTeam.filter((a) => a.state === 'jailed').length,
      detained: this.agents.filter((a) => a.state === 'detained').length,
      secured: this.securedCount,
      required: this.cfg.treasureRequired,
      treasuresLeft: this.treasures.filter((t) => t.state === 'vault').length,
      carried: this.treasures.filter((t) => t.state === 'carried').length,
      hidden: this.agents.filter((a) => a.hidden).length,
      spiesCop: copTeam.filter((a) => a.isSpy).length,
      spiesThief: thiefTeam.filter((a) => a.isSpy).length,
      exposed: this.agents.filter((a) => a.exposed).length,
    };
  }

  step(dt) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    if (this.phase !== 'playing') {
      this.updatePings(dt);
      this.updateEffects(dt);
      return;
    }
    this.t += dt;
    this.time = Math.max(0, this.time - dt);
    for (const a of this.agents) this.tickAgent(a, dt);
    // Build 4: キャラ同士が同じ位置に重なって「1人に見える」のを防ぐ
    this.separateAgents();
    this.updatePings(dt);
    this.updateEffects(dt);
    this.checkWin();
  }

  stepSeconds(sec, dt = 1 / 60) {
    const n = Math.ceil(sec / dt);
    for (let i = 0; i < n && this.phase === 'playing'; i++) this.step(dt);
  }

  tickAgent(a, dt) {
    if (a.state === 'jailed') {
      a.actionT = 0;
      a.moving = false;
      a.hidden = false;
      return;
    }
    // スパイ発覚後の拘束：移動も行動もできず、時間が来たら相手陣営へ寝返る
    if (a.state === 'detained') {
      a.actionT = 0;
      a.moving = false;
      a.hidden = false;
      a.detainLeft = Math.max(0, a.detainLeft - dt);
      if (a.detainLeft <= 0) this.betray(a);
      return;
    }
    a.immune = Math.max(0, a.immune - dt);
    a.arrestCd = Math.max(0, a.arrestCd - dt);
    a.whistleCd = Math.max(0, a.whistleCd - dt);
    a.unlockCd = Math.max(0, a.unlockCd - dt);
    a.hideCd = Math.max(0, a.hideCd - dt);
    a.searchCd = Math.max(0, a.searchCd - dt);
    a.touchCd = Math.max(0, a.touchCd - dt);
    a.escapeT = Math.max(0, a.escapeT - dt);
    if (a.detour) a.detour.t -= dt;
    a.ai.hideCd = Math.max(0, a.ai.hideCd - dt);
    a.ai.returnCd = Math.max(0, (a.ai.returnCd || 0) - dt);
    a.pathAge += dt;

    // 隠れ続けられるのは最大 cfg.hideMax 秒
    if (a.hidden) {
      a.hideLeft = Math.max(0, a.hideLeft - dt);
      if (a.hideLeft <= 0) this.unhide(a, 'timeout');
    }

    const playerCtl = a.isPlayer && !this.autoplay;
    let mx = 0;
    let mz = 0;
    let act = false;
    if (playerCtl) {
      mx = this.input.x;
      mz = this.input.z;
      act = this.input.action;
    } else {
      const d = this.think(a, dt);
      mx = d.mx;
      mz = d.mz;
      act = d.act;
    }

    // 隠れている間は動かない（動くと隠れ解除）
    if (a.hidden) {
      if (Math.hypot(mx, mz) > 0.15) this.unhide(a);
      else {
        mx = 0;
        mz = 0;
      }
    }

    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }

    const nearDoor = dist(a, MAP.jailDoor) < this.cfg.actionRange;
    let speed = this.speedOf(a);
    const copLook = a.looks === 'cop';
    if (copLook && act && !nearDoor) speed *= this.cfg.copDash;
    if (a.hidden) speed = 0;
    // タッチ救出の直後は少しだけ足が速い（2人とも逃げ切れるように）
    if (a.escapeT > 0) speed *= this.cfg.rescueBoost;

    // Build 4: 壁に引っかからず、角では壁沿いに滑る
    this.moveWithSlide(a, mx, mz, speed, dt);
    if (mx || mz) a.dir = Math.atan2(mx, mz);

    // お宝を拾う（泥棒の見た目・潜入捜査官は拾わない・お宝持ちは拾わない）
    if (
      a.carrying == null &&
      a.looks === 'thief' &&
      a.role !== ROLE.THIEF_SPY &&
      !a.hidden
    ) {
      const t = this.treasures.find(
        (tr) => tr.state === 'vault' && Math.hypot(tr.x - a.x, tr.z - a.z) < this.cfg.pickupRange,
      );
      if (t) this.pickup(a, t);
    }

    // 搬出
    if (a.carrying != null && isInZone(a, MAP.gate)) this.deliver(a);

    // Build 4: まだ捕まっていない泥棒は、牢屋の仲間にタッチすると2人とも逃げられる
    if (a.touchCd <= 0 && a.role === ROLE.THIEF && a.state === 'free' && !a.hidden) {
      const mate = this.nearest(
        a,
        (o) => o.state === 'jailed' && o.team === 'thief',
        this.cfg.touchRescueRange,
      );
      if (mate.agent && this.nav.lineFree(a.x, a.z, mate.agent.x, mate.agent.z)) {
        this.touchRescue(a, mate.agent);
      }
    }

    // 捕獲（警官の見た目は自動で確保／発覚した潜入捜査官のみ。潜入捜査官は警察につかまらない）
    if (a.arrestCd <= 0) {
      const tgt = this.nearest(a, (o) => this.canArrest(a, o), this.cfg.arrestRange);
      if (tgt.agent) this.arrest(a, tgt.agent);
    }

    // 牢屋前のゲージ（解錠 / 救出）
    const teamJailed = this.jailedTeammates(a).length;
    const nearGate = dist(a, MAP.gate) < this.cfg.returnRange;
    let acting = false;
    if (nearDoor && act && teamJailed > 0) {
      if (a.role === ROLE.COP_SPY && a.unlockCd <= 0) {
        acting = true;
        a.actionT += dt;
        const witness = this.witnessOf(a);
        if (witness) {
          if (a.actionT > this.cfg.exposeAfter) this.expose(a, witness);
          return; // 拘束されたのでこのフレームの行動はここまで
        }
        if (a.actionT >= this.cfg.actionTime) {
          a.actionT = 0;
          a.unlockCd = this.cfg.unlockCooldown;
          this.freeOne('unlock', a);
        }
      } else if (a.role === ROLE.THIEF && a.touchCd <= 0) {
        acting = true;
        a.actionT += dt;
        if (a.actionT >= this.cfg.actionTime) {
          a.actionT = 0;
          this.freeOne('rescue', a);
        }
      }
    }
    // 脱出ゲート前のゲージ（潜入捜査官がお宝を戻す）
    if (
      !acting &&
      nearGate &&
      act &&
      a.role === ROLE.THIEF_SPY &&
      this.securedCount > 0 &&
      a.ai.returnCd <= 0
    ) {
      acting = true;
      a.actionT += dt;
      const witness = this.witnessOf(a);
      if (witness) {
        if (a.actionT > this.cfg.exposeAfter) this.expose(a, witness);
        return; // 拘束されたのでこのフレームの行動はここまで
      }
      if (a.actionT >= this.cfg.actionTime) {
        a.actionT = 0;
        this.returnTreasure(a);
      }
    }
    if (!acting) a.actionT = Math.max(0, a.actionT - dt * 2);
  }

  collide(x, z, r) {
    for (const o of this.colliders) {
      const minX = o.x - o.w / 2;
      const maxX = o.x + o.w / 2;
      const minZ = o.z - o.d / 2;
      const maxZ = o.z + o.d / 2;
      if (x + r > minX && x - r < maxX && z + r > minZ && z - r < maxZ) {
        const dx1 = maxX + r - x;
        const dx2 = x - (minX - r);
        const dz1 = maxZ + r - z;
        const dz2 = z - (minZ - r);
        const m = Math.min(dx1, dx2, dz1, dz2);
        if (m === dx1) x = maxX + r;
        else if (m === dx2) x = minX - r;
        else if (m === dz1) z = maxZ + r;
        else z = minZ - r;
      }
    }
    return { x, z };
  }

  /**
   * Build 4: 壁沿いに滑る移動。
   * 斜めに wall/建物角へ突っ込んだ時、片軸だけでも進める向きへ回すことで
   * 「角で引っかかってガクガクする」のを防ぐ。進めない時間も記録する。
   */
  moveWithSlide(a, mx, mz, speed, dt) {
    const fromX = a.x;
    const fromZ = a.z;
    const want = Math.hypot(mx, mz) * speed * dt;
    if (!(want > 1e-6)) {
      a.moving = false;
      a.stuckT = Math.max(0, a.stuckT - dt * 2);
      return;
    }
    const dx = mx * speed * dt;
    const dz = mz * speed * dt;
    const clampX = (v) => clamp(v, MAP.bounds.minX + 1, MAP.bounds.maxX - 1);
    const clampZ = (v) => clamp(v, MAP.bounds.minZ + 1, MAP.bounds.maxZ - 1);
    const score = (p) => (p.x - fromX) * mx + (p.z - fromZ) * mz;

    const full = this.collide(fromX + dx, fromZ + dz, this.cfg.radius);
    let pick = { x: clampX(full.x), z: clampZ(full.z) };
    let best = score(pick);

    if (best < want - 1e-4) {
      // 片軸だけの移動も試し、行きたい向きに一番進めるものを選ぶ
      if (Math.abs(dx) > 1e-6) {
        const onlyX = this.collide(fromX + dx, fromZ, this.cfg.radius);
        const cand = { x: clampX(onlyX.x), z: fromZ };
        const s = score(cand);
        if (s > best + 1e-4) {
          best = s;
          pick = cand;
        }
      }
      if (Math.abs(dz) > 1e-6) {
        const onlyZ = this.collide(fromX, fromZ + dz, this.cfg.radius);
        const cand = { x: fromX, z: clampZ(onlyZ.z) };
        const s = score(cand);
        if (s > best + 1e-4) {
          best = s;
          pick = cand;
        }
      }
    }

    // 同じ場所に留まらないよう、極端に小さい前進は捨てる（振動の原因）
    const moved = Math.hypot(pick.x - fromX, pick.z - fromZ);
    if (moved < want * 0.2) {
      // 正面から壁に固定された時は、壁沿いに横へずれる（角から抜ける）
      for (const s of [1, -1]) {
        const cand = this.collide(
          fromX + -mz * s * want,
          fromZ + mx * s * want,
          this.cfg.radius,
        );
        const cx = clampX(cand.x);
        const cz = clampZ(cand.z);
        const d = Math.hypot(cx - fromX, cz - fromZ);
        if (d > moved * 1.3 && d > 1e-5) {
          pick = { x: cx, z: cz };
          break;
        }
      }
    }

    a.x = pick.x;
    a.z = pick.z;
    const progress = want > 0 ? best / want : 1;
    if (progress < 0.25) a.stuckT += dt;
    else a.stuckT = Math.max(0, a.stuckT - dt * 3);
    a.moving = Math.hypot(a.x - fromX, a.z - fromZ) > 0.002;
  }

  /** 目標が建物の中なら、一番近い通行可能地点へ寄せる（壁の中へ歩き続けるのを防ぐ） */
  freeTarget(t) {
    if (!t || !this.nav) return t;
    if (!this.nav.solidAt(t.x, t.z, this.cfg.radius + 0.15)) return t;
    const cell = this.nav.cellOf(t.x, t.z);
    const free = this.nav.nearestFree(cell.cx, cell.cz, 8);
    if (!free) return t;
    return this.nav.cellCenter(free.cx, free.cz);
  }

  /** 引っかかった時に、壁を回り込むための一時的な目標点 */
  detourPoint(a, target) {
    if (!target || !this.nav) return null;
    const ang = Math.atan2(target.z - a.z, target.x - a.x);
    const minX = MAP.bounds.minX + 2;
    const maxX = MAP.bounds.maxX - 2;
    const minZ = MAP.bounds.minZ + 2;
    const maxZ = MAP.bounds.maxZ - 2;
    const cands = [];
    for (const off of [Math.PI / 2, -Math.PI / 2, (Math.PI * 3) / 4, (-Math.PI * 3) / 4, Math.PI]) {
      for (const r of [1.6, 3.0, 4.6]) {
        const x = clamp(a.x + Math.cos(ang + off) * r, minX, maxX);
        const z = clamp(a.z + Math.sin(ang + off) * r, minZ, maxZ);
        if (this.nav.solidAt(x, z, this.cfg.radius + 0.3)) continue;
        cands.push({ x, z });
      }
    }
    // 見通しの良い点を優先。なければ「立てる点」でもいいので使う（正面固定からの脱出を優先）
    for (const c of cands) if (this.nav.lineFree(a.x, a.z, c.x, c.z)) return c;
    return cands[0] || null;
  }

  /**
   * Build 4: キャラ同士が重なって「1人に見える」のを防ぐ。
   * プレイヤーは操作感を変えないよう押されにくくしてある。
   */
  separateAgents() {
    const free = this.agents.filter((a) => a.state === 'free' && !a.hidden);
    const min = 1.0;
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const a = free[i];
        const b = free[j];
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        let d = Math.hypot(dx, dz);
        if (d >= min) continue;
        const gap = d;
        if (d < 1e-4) {
          dx = 0.2 + ((i + j) % 3) * 0.1;
          dz = 0.1;
          d = Math.hypot(dx, dz);
        }
        const ux = dx / d;
        const uz = dz / d;
        const push = (min - gap) * 0.5;
        const wa = a.isPlayer ? 0.3 : 1;
        const wb = b.isPlayer ? 0.3 : 1;
        // 正面衝突のまま固まらないよう、ペアごとに一定方向へ横流れさせる
        const side = (i * 3 + j * 5) % 2 === 0 ? 1 : -1;
        const along = 0.55;
        const ax = (-ux + -uz * side * along) * push * wa;
        const az = (-uz + ux * side * along) * push * wa;
        const bx = (ux + -uz * side * along) * push * wb;
        const bz = (uz + ux * side * along) * push * wb;
        const pa = this.collide(a.x + ax, a.z + az, this.cfg.radius);
        a.x = clamp(pa.x, MAP.bounds.minX + 1, MAP.bounds.maxX - 1);
        a.z = clamp(pa.z, MAP.bounds.minZ + 1, MAP.bounds.maxZ - 1);
        const pb = this.collide(b.x + bx, b.z + bz, this.cfg.radius);
        b.x = clamp(pb.x, MAP.bounds.minX + 1, MAP.bounds.maxX - 1);
        b.z = clamp(pb.z, MAP.bounds.minZ + 1, MAP.bounds.maxZ - 1);
        a.moving = b.moving = true;
      }
    }
  }

  /** タッチ救出に向かうのは、牢屋に一番近い泥棒1人だけ（大勢で押し合って固まらないため） */
  nearestRescuer(a) {
    const door = MAP.jailDoor;
    let me = Infinity;
    let other = Infinity;
    for (const o of this.agents) {
      if (o.state !== 'free' || o.role !== ROLE.THIEF) continue;
      const d = Math.hypot(o.x - door.x, o.z - door.z);
      if (o === a) me = d;
      else other = Math.min(other, d);
    }
    return me < other + 0.01;
  }

  /** すぐそばの牢屋の仲間（タッチ救出できる相手） */
  nearJailedMate(agent, range = this.cfg.touchRescueRange) {
    if (!agent || agent.state !== 'free') return null;
    const found = this.nearest(
      agent,
      (o) => o.state === 'jailed' && o.team === 'thief',
      range,
    );
    return found.agent || null;
  }

  /** Build 4: タッチ救出。牢屋にタッチした泥棒と、捕まっていた仲間の2人が逃げる */
  touchRescue(rescuer, target) {
    if (this.phase !== 'playing') return false;
    if (!rescuer || !target || target.state !== 'jailed') return false;
    if (rescuer.role !== ROLE.THIEF || rescuer.state !== 'free' || rescuer.hidden) return false;
    if (rescuer.touchCd > 0) return false;
    if (!this.nav.lineFree(rescuer.x, rescuer.z, target.x, target.z)) return false;
    const freed = this.freeOne('touch', rescuer, target);
    if (!freed) return false;
    rescuer.touchCd = this.cfg.touchRescueCd;
    rescuer.immune = Math.max(rescuer.immune, this.cfg.freeImmunity);
    rescuer.escapeT = 1.2;
    this.stats.touchRescues++;
    return true;
  }

  /** 人狼警察が警官から離れて身を隠す持ち場（警官から遠く、牢屋からも少し離れた場所） */
  coverPoint(a) {
    const cops = this.agents.filter((o) => o.looks === 'cop' && o.state === 'free' && !o.isSpy);
    let best = null;
    let bestScore = -Infinity;
    for (const p of this.patrol) {
      let nearestCop = 99;
      for (const c of cops) nearestCop = Math.min(nearestCop, Math.hypot(c.x - p.x, c.z - p.z));
      const fromJail = Math.hypot(p.x - MAP.jailDoor.x, p.z - MAP.jailDoor.z);
      // 牢屋から 12〜28m くらいの位置を好む（遠すぎると解錠に戻るのが遅くなる）
      const jailFit = 1 - Math.min(1, Math.abs(fromJail - 14) / 18);
      const score = nearestCop + jailFit * 20 + this.rng() * 3;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  // ---- 経路の追従 ---------------------------------------------------------
  moveToward(a, target, dt) {
    if (!target) return { mx: 0, mz: 0 };

    // Build 4: 引っかかったら、いったん壁を回り込む点へ向かう
    if (a.detour) {
      const dd = Math.hypot(a.detour.x - a.x, a.detour.z - a.z);
      if (dd < 0.6 || a.detour.t <= 0) {
        a.detour = null;
        a.stuckT = 0;
        a.path = null;
      } else {
        const k = dd || 1;
        return { mx: (a.detour.x - a.x) / k, mz: (a.detour.z - a.z) / k };
      }
    } else if (a.stuckT > this.cfg.stuckAfter) {
      const p = this.detourPoint(a, target);
      a.stuckT = 0;
      if (p) {
        a.detour = { x: p.x, z: p.z, t: this.cfg.detourTime };
        a.path = null;
        const k = Math.hypot(p.x - a.x, p.z - a.z) || 1;
        return { mx: (p.x - a.x) / k, mz: (p.z - a.z) / k };
      }
    }

    // 目標が建物・柵の中なら、一番近い外側の点へ読み替える
    const goal = this.freeTarget(target);
    const dToTarget = Math.hypot(goal.x - a.x, goal.z - a.z);
    if (dToTarget < 0.4) {
      a.path = null;
      return { mx: 0, mz: 0 };
    }
    const targetMoved =
      !a.pathTarget || Math.hypot(a.pathTarget.x - goal.x, a.pathTarget.z - goal.z) > 2.6;
    const stale = !a.path || a.pathAge > 1.4;
    const straight = this.nav.lineFree(a.x, a.z, goal.x, goal.z);
    if (straight) {
      a.path = null;
      a.pathTarget = { x: goal.x, z: goal.z };
      const d = Math.hypot(goal.x - a.x, goal.z - a.z) || 1;
      return { mx: (goal.x - a.x) / d, mz: (goal.z - a.z) / d };
    }
    if (stale || targetMoved) {
      const path = this.nav.findPath(a.x, a.z, goal.x, goal.z);
      a.path = path && path.length ? path : null;
      a.pathTarget = { x: goal.x, z: goal.z };
      a.pathAge = 0;
    }
    if (!a.path || !a.path.length) {
      const d = Math.hypot(goal.x - a.x, goal.z - a.z) || 1;
      return { mx: (goal.x - a.x) / d, mz: (goal.z - a.z) / d };
    }
    while (a.path.length > 1 && Math.hypot(a.path[0].x - a.x, a.path[0].z - a.z) < 0.9) {
      a.path.shift();
    }
    const wp = a.path[0];
    const d = Math.hypot(wp.x - a.x, wp.z - a.z) || 1;
    return { mx: (wp.x - a.x) / d, mz: (wp.z - a.z) / d };
  }

  // ---- CPU AI -----------------------------------------------------------
  think(a, dt) {
    a.ai.retarget -= dt;
    const hostile = (o) =>
      o.state === 'free' && this.canArrest(a, o) && this.canSee(a, o);
    let target = null;
    let act = false;
    let hidNow = false; // Build 5: このフレームで隠れたら、その場で動かず隠れる

    if (a.role === ROLE.COP) {
      const seen = this.nearest(a, hostile, this.cfg.copVision);
      const ping = this.pings.find((p) => p.ttl > 0);
      if (seen.agent) {
        target = { x: seen.agent.x, z: seen.agent.z };
        if (seen.dist < 7) act = true; // 追跡ダッシュ
      } else if (ping && ping.target != null) {
        target = { x: ping.x, z: ping.z };
      } else {
        target = this.patrolPoint(a);
        // 茂みのそばを通ったら捜索して、隠れている泥棒を炙り出す
        if (a.searchCd <= 0 && this.nearestBush(a, this.cfg.searchRange - 0.8).index >= 0) {
          if (this.rng() < dt * 1.4) this.search(a);
        }
      }
    } else if (a.role === ROLE.COP_SPY) {
      // 内通者: 誰も見ていない隙に牢屋を解錠する。
      // Build 4: 警官が近づくたびに「牢屋↔持ち場」を往復してガクついていたので、
      // 狙いは数秒単位で決め直し、警官が近い間は静かに持ち場で待つようにした。
      const jailed = this.agents.filter((o) => o.team === 'thief' && o.state === 'jailed');
      const copNear = this.nearest(
        a,
        (o) => o.role === ROLE.COP && o.state === 'free',
        this.cfg.spyClearRange,
      );
      a.ai.spyHold = Math.max(0, (a.ai.spyHold || 0) - dt);
      if (a.ai.spyHold <= 0) {
        const canUnlock = jailed.length > 0 && a.unlockCd <= 0;
        if (canUnlock && !copNear.agent) {
          a.ai.spyGoal = 'unlock';
          a.ai.spyHold = 7 + this.rng() * 3;
        } else {
          a.ai.spyGoal = 'cover';
          a.ai.spyHold = this.cfg.spyHoldMin + this.rng() * 3;
          a.ai.spyCover = this.coverPoint(a);
        }
      }
      if (a.ai.spyGoal === 'unlock' && copNear.agent && copNear.dist < this.cfg.spyAbortRange) {
        a.ai.spyGoal = 'cover';
        a.ai.spyHold = this.cfg.spyHoldMin + this.rng() * 2;
        a.ai.spyCover = this.coverPoint(a);
      }
      if (a.ai.spyGoal === 'unlock' && jailed.length) {
        target = MAP.jailDoor;
        if (dist(a, MAP.jailDoor) < this.cfg.actionRange - 0.4 && !copNear.agent) act = true;
      } else {
        // 怪しまれないよう、警官から一番遠い持ち場へ歩いていく（ダッシュはしない）
        target = a.ai.spyCover || this.patrolPoint(a);
      }
    } else if (a.role === ROLE.THIEF) {
      // 隠れている間は警察が離れるまで待つ
      if (a.hidden) {
        a.ai.hideFor -= dt;
        // Build 5: 隠れて待つのは警官が近い時だけ（遠くの警官に怯えて
        // 茂みにこもり続けると、泥棒が全然お宝を運べなくなる）
        const near = this.nearest(
          a,
          (o) => o.looks === 'cop' && o.state === 'free' && dist(a, o) < this.cfg.hideKeepRange,
          this.cfg.hideKeepRange,
        );
        if (near.agent && a.ai.hideFor > 0) return { mx: 0, mz: 0, act: false };
        this.unhide(a);
      }
      // Build 5: 一度逃げ始めたら少し遠くまで警戒して逃げ続ける。
      // 境目（4.5m）で「逃げる↔お宝へ向かう」が1フレームごとに入れ替わると、
      // 救出された泥棒がその場で左右に震えて固まる（トモアキさん報告のバグ）。
      a.ai.fleeT = Math.max(0, (a.ai.fleeT || 0) - dt);
      const fleeing = a.ai.fleeT > 0;
      const fleeRange = this.cfg.thiefDodge + (fleeing ? this.cfg.fleeRelease : 0);
      const copNear = this.nearest(
        a,
        (o) => o.looks === 'cop' && o.state === 'free' && !o.exposed && this.canSee(o, a),
        fleeRange,
      );
      const jailedList = this.agents.filter((o) => o.team === 'thief' && o.state === 'jailed');
      const jailed = jailedList.length;
      // 牢屋の前に警官が張っていないか（タッチ救出に向かうかの判断）
      const jailGuarded = this.agents.some(
        (o) =>
          o.looks === 'cop' &&
          o.state === 'free' &&
          !o.exposed &&
          Math.hypot(o.x - MAP.jailDoor.x, o.z - MAP.jailDoor.z) < 13,
      );
      if (a.carrying != null) {
        target = MAP.gate;
        act = false;
      } else if (!a.hidden && a.ai.hideCd <= 0 && copNear.agent && (fleeing || copNear.dist < this.cfg.bushDodge)) {
        // 追われたら茂みへ飛び込む。Build 5: 一度逃げ始めたら fleeHold 秒は
        // 距離に関係なく逃げ続ける（距離の境目だけで判断すると振動する）
        if (copNear.dist < this.cfg.bushDodge) a.ai.fleeT = this.cfg.fleeHold;
        const b = this.bushAt(a, 9);
        if (b >= 0) {
          const bush = MAP.bushes[b];
          target = bush;
          if (Math.hypot(bush.x - a.x, bush.z - a.z) < bush.r && this.hide(a)) {
            a.ai.hideFor = Math.min(this.cfg.hideMax - 1.2, 2.2 + this.rng() * 1.6);
            hidNow = true;
          }
        } else {
          target = this.fleePoint(a, copNear.agent);
        }
      } else if (jailed >= 1 && !copNear.agent && !jailGuarded && a.touchCd <= 0 && this.nearestRescuer(a)) {
        // Build 4: 牢屋の中まで入って、捕まった仲間にタッチで救出する
        // 助ける相手は「プレイヤー優先 → 先に捕まった順」
        const mate = this.pickJailTarget(jailedList);
        if (mate) {
          target = { x: mate.x, z: mate.z };
        } else {
          target = MAP.jailDoor;
        }
      } else if (jailed >= 2 && !copNear.agent) {
        target = MAP.jailDoor;
        if (dist(a, MAP.jailDoor) < this.cfg.actionRange - 0.4) act = true;
      } else {
        const available = this.treasures.filter((t) => t.state === 'vault');
        if (available.length) {
          let best = available[0];
          let bd = Infinity;
          for (const t of available) {
            const d = Math.hypot(t.x - a.x, t.z - a.z) + (copNear.agent ? this.copPenalty(t, copNear.agent) : 0);
            if (d < bd) {
              bd = d;
              best = t;
            }
          }
          target = best;
        } else if (jailed > 0 && !copNear.agent) {
          target = MAP.jailDoor;
          if (dist(a, MAP.jailDoor) < this.cfg.actionRange - 0.4) act = true;
        } else {
          target = this.patrolPoint(a);
        }
      }
    } else if (a.role === ROLE.THIEF_SPY) {
      // 潜入捜査官: 運ばれたお宝をゲートから戻すのが仕事（Build 4）
      // Build 5: 戻しのクールタイムが5秒になり、AI が毎回戻すと泥棒が絶対に勝てなくなった
      // （6試合連続で警察勝利・搬出2個→5秒化の検証結果）。だから AI は
      // 「あと1個で泥棒の勝ち」の土壇場だけ戻しに行き、それ以外は泥棒に紛れて動く。
      // プレイヤーが操作する時の5秒ルールはそのまま。
      const thieves = this.agents.filter((o) => o !== a && o.role === ROLE.THIEF && o.state === 'free');
      const copNear = this.nearest(a, (o) => o.looks === 'cop' && o.state === 'free', 6);
      const lastStretch = this.securedCount >= this.cfg.treasureRequired - 1;
      if (this.securedCount > 0 && lastStretch) {
        target = MAP.gate;
        // 泥棒に見られていない時だけ作業する（見られたら15秒拘束→寝返り）
        const watched = this.nearest(
          a,
          (o) => o.state === 'free' && !o.hidden && o.team !== a.team,
          this.cfg.exposeRange + 1.5,
        ).agent;
        if (!watched && a.ai.returnCd <= 0 && dist(a, MAP.gate) < this.cfg.returnRange - 0.5) {
          act = true;
        }
      } else if (thieves.length) {
        const leader = thieves.reduce((m, o) => (dist(a, o) < dist(a, m) ? o : m), thieves[0]);
        target = { x: leader.x, z: leader.z };
      } else {
        target = this.patrolPoint(a);
      }
      if (copNear.agent) {
        // 警官から逃げるフリ（泥棒らしく見せる）
        const b = this.bushAt(a, 8);
        if (b >= 0 && a.ai.hideCd <= 0) {
          const bush = MAP.bushes[b];
          target = bush;
          if (Math.hypot(bush.x - a.x, bush.z - a.z) < bush.r && this.hide(a)) {
            a.ai.hideFor = Math.min(this.cfg.hideMax - 1.2, 2 + this.rng() * 1.4);
            hidNow = true;
          }
        } else {
          target = { x: a.x + (a.x - copNear.agent.x) * 2, z: a.z + (a.z - copNear.agent.z) * 2 };
        }
      }
    }

    // Build 5: 隠れたそのフレームに動くと即 unhide されて「茂みでガクガク」するので、
    // 隠れた瞬間は足を止める（相手の前で隠れる演出も自然になる）
    if (hidNow) return { mx: 0, mz: 0, act: false };
    let mv = this.moveToward(a, target, dt);
    let dx = mv.mx;
    let dz = mv.mz;
    // 同士との重なりを避ける
    for (const o of this.agents) {
      if (o === a || o.state !== 'free') continue;
      const od = dist(a, o);
      if (od > 0 && od < 1.1) {
        dx += ((a.x - o.x) / od) * 0.45;
        dz += ((a.z - o.z) / od) * 0.45;
      }
    }
    const l = Math.hypot(dx, dz);
    if (l > 1) {
      dx /= l;
      dz /= l;
    }
    return { mx: dx, mz: dz, act };
  }

  /** お宝の周りに警官がいる場合は遠回りする */
  copPenalty(t, cop) {
    const d = Math.hypot(t.x - cop.x, t.z - cop.z);
    return d < 14 ? 26 - d : 0;
  }

  fleePoint(a, threat) {
    let ax = a.x - threat.x;
    let az = a.z - threat.z;
    const al = Math.hypot(ax, az) || 1;
    ax /= al;
    az /= al;
    return { x: a.x + ax * 8, z: a.z + az * 8 };
  }

  patrolPoint(a) {
    const pts = this.patrol;
    if (dist(a, pts[a.ai.wp]) < 3.0 || a.ai.retarget <= 0) {
      a.ai.wp = (a.ai.wp + 1 + Math.floor(this.rng() * 3)) % pts.length;
      a.ai.retarget = 8 + this.rng() * 6;
    }
    return pts[a.ai.wp];
  }

  get patrol() {
    return [
      { x: -62, z: -53 }, // 銀行前
      { x: 62, z: -53 }, // 宝石店前
      { x: 62, z: -30 }, // 美術館前
      { x: -22, z: -14 }, // 駅前
      { x: -22, z: 22 }, // 公園
      { x: 62, z: 34 }, // 商店街
      { x: 0, z: 60 }, // ゲート前
      { x: -62, z: 46 }, // 警察署前
    ];
  }

  checkWin() {
    if (this.phase !== 'playing') return;
    if (this.securedCount >= this.cfg.treasureRequired) {
      this.finish('thieves', 'お宝をすべて搬出した');
    } else if (this.agents.filter((a) => a.team === 'thief').every((a) => a.state === 'jailed')) {
      this.finish('cops', '泥棒を全員確保した');
    } else if (this.time <= 0) {
      const left = this.securedCount;
      this.finish(
        'cops',
        left > 0 ? `時間切れ・お宝${left}/${this.cfg.treasureRequired}を守りきった` : '時間切れ・お宝をすべて守りきった',
      );
    }
  }

  finish(winner, reason) {
    this.phase = 'ended';
    this.winner = winner;
    this.reason = reason;
    this.pushEvent({
      type: 'end',
      winner,
      label: winner === 'cops' ? '警察陣営の勝利' : '泥棒陣営の勝利',
    });
  }
}

// DOROKEI ステージ台帳
// Build 2 では基本ステージ「City」だけが遊べる。ほかのステージは
// タイトル画面のステージ選択枠に「Coming Soon」として並べ、次のビルドで
// それぞれの建物・仕掛け（美術館の展示室、廃校の密室、地下鉄のワープなど）を
// 足していくための土台にしてある。
//
// ステージを増やすときは STAGES に1件足し、Game({ stage: '<id>' }) が
// そのレイアウトを読むようにする（Build 2 の時点では City のみ available）。

export const STAGES = Object.freeze([
  {
    id: 'city',
    name: 'City',
    nameJa: 'シティ',
    emoji: '🏙️',
    available: true,
    tagline: '基本の街',
    taglineEn: 'The classic city',
    desc: '150m×150mの広い街。銀行・宝石店・駅・公園・牢屋・脱出ゲート。',
    descEn: 'A wide 150m × 150m city: bank, jewelry, station, park, jail and the escape gate.',
  },
  {
    id: 'museum',
    name: '美術館',
    nameEn: 'Museum',
    emoji: '🏛️',
    available: false,
    desc: '展示室の迷路と、動く監視カメラ。',
    descEn: 'A maze of galleries with moving security cameras.',
  },
  {
    id: 'school',
    name: '廃校',
    nameEn: 'School',
    emoji: '🏫',
    available: false,
    desc: '教室・階段・5秒だけ開く密室。',
    descEn: 'Classrooms, stairwells and a room that opens for five seconds.',
  },
  {
    id: 'subway',
    name: '地下鉄',
    nameEn: 'Subway',
    emoji: '🚇',
    available: false,
    desc: 'ホームと線路を走る電車に注意。',
    descEn: 'Platforms, tunnels and trains that actually run.',
  },
  {
    id: 'harbor',
    name: '港',
    nameEn: 'Harbor',
    emoji: '⚓',
    available: false,
    desc: 'コンテナの迷路と、船でショートカット。',
    descEn: 'Container mazes and a boat shortcut across the water.',
  },
]);

export const DEFAULT_STAGE = 'city';

export function stageById(id) {
  return STAGES.find((s) => s.id === id) || null;
}

export function isStagePlayable(id) {
  const s = stageById(id);
  return !!(s && s.available);
}

export function playableStages() {
  return STAGES.filter((s) => s.available);
}

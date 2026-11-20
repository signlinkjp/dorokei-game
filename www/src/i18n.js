// DOROKEI 言語まわり（日本語・英語＋12言語の土台）
// ja / en は全文、ko / zh-Hans / zh-Hant は主要UIを翻訳し、
// 残りは英語へフォールバックする。キーは追加したら ja と en の両方を必ず書く。

export const LANGS = Object.freeze([
  { id: 'ja', label: '日本語' },
  { id: 'en', label: 'English' },
  { id: 'ko', label: '한국어' },
  { id: 'zh-Hans', label: '简体中文' },
  { id: 'zh-Hant', label: '繁體中文' },
  { id: 'es', label: 'Español' },
  { id: 'pt-BR', label: 'Português' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
  { id: 'it', label: 'Italiano' },
  { id: 'ru', label: 'Русский' },
  { id: 'th', label: 'ไทย' },
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'id', label: 'Bahasa Indonesia' },
]);

export const DEFAULT_LANG = 'ja';

// 各キー: { ja, en, ko?, zhHans?, zhHant? }
export const STRINGS = {
  'title.sub': { ja: 'ドロケー × 人狼', en: 'Cops & Robbers × Hidden Spies' },
  'title.catch': {
    ja: '警官から逃げて、お宝を5つ盗み出せ。<br />でも ── 仲間の中に、スパイがいる。',
    en: 'Steal all 5 treasures and escape the cops.<br />But one of your own crew may be a spy.',
  },
  'rule.cop': {
    ja: '泥棒を全員確保、または時間切れでお宝を1つでも守れば勝ち。',
    en: 'Jail every thief, or keep at least one treasure safe when time runs out.',
  },
  'rule.thief': {
    ja: 'お宝5つを全部ゲートへ運べば勝ち。運搬中は足が遅くなる。',
    en: 'Deliver all 5 treasures. You are slower while carrying.',
  },
  'rule.hide': {
    ja: '茂みで最大5秒隠れられる（出たあと3秒は隠れ直せない）。',
    en: 'Hide up to 5 seconds in a bush (3 second cooldown after).',
  },
  'rule.search': {
    ja: '警察は茂みの近くで「🔍 捜索」、隠れている泥棒を炙り出す。',
    en: 'Cops near a bush can Search to flush out hidden thieves.',
  },
  'rule.spy': {
    ja: '内通者は解錠、密告者はお宝を奪い返す。見られると正体発覚。',
    en: 'Moles unlock the jail; informers take loot back. Get seen and you are exposed.',
  },
  'time.3': { ja: '3分', en: '3 min', ko: '3분', 'zh-Hans': '3分钟', 'zh-Hant': '3分鐘' },
  'time.5': { ja: '5分', en: '5 min', ko: '5분', 'zh-Hans': '5分钟', 'zh-Hant': '5分鐘' },
  'time.7': { ja: '7分', en: '7 min', ko: '7분', 'zh-Hans': '7分钟', 'zh-Hant': '7分鐘' },
  'stage.label': { ja: 'ステージ', en: 'Stage' },
  'stage.comingSoon': { ja: '準備中', en: 'Coming Soon' },
  'stage.comingSoonNote': {
    ja: '次のビルドで追加予定。ステージごとの建物と仕掛けを用意しています。',
    en: 'Coming in a later build, each with its own buildings and tricks.',
  },
  'role.label': { ja: 'あなたの役', en: 'Your role' },
  'role.auto': { ja: 'おまかせ', en: 'Auto' },
  'role.cop': { ja: '警察', en: 'Cop' },
  'role.thief': { ja: '泥棒', en: 'Thief' },
  'role.copSpy': { ja: '内通者', en: 'Mole', ko: '내통자', 'zh-Hans': '内应', 'zh-Hant': '內應' },
  'role.thiefSpy': { ja: '密告者', en: 'Informer', ko: '밀고자', 'zh-Hans': '告密者', 'zh-Hant': '告密者' },
  'hide.wait': { ja: '隠れ待ち', en: 'Wait' },
  'role.cop.desc': { ja: '泥棒を全員牢屋に入れろ', en: 'Jail every thief' },
  'role.copSpy.desc': {
    ja: '警官のフリで牢屋を解錠せよ',
    en: 'Pose as a cop and unlock the jail',
  },
  'role.thief.desc': {
    ja: 'お宝を5つ脱出ゲートへ運べ',
    en: 'Carry all 5 treasures to the escape gate',
  },
  'role.thiefSpy.desc': {
    ja: '泥棒に紛れて密告・お宝を奪い返せ',
    en: 'Blend in, tip off the cops, take treasures back',
  },
  'spy.label': { ja: 'スパイ設定', en: 'Spies' },
  'spy.both': { ja: '両方', en: 'Both' },
  'spy.cops': { ja: '警察のみ', en: 'Cops only' },
  'spy.thieves': { ja: '泥棒のみ', en: 'Thieves only' },
  'spy.none': { ja: 'なし', en: 'None' },
  'selfspy.label': { ja: '自分がスパイ', en: 'You are a spy' },
  'selfspy.random': { ja: 'ランダム', en: 'Random' },
  'selfspy.always': { ja: '必ず', en: 'Always' },
  'selfspy.never': { ja: 'なし', en: 'Never' },
  'btn.start': { ja: 'ゲームスタート', en: 'Start game' },
  'btn.howto': { ja: 'あそびかた', en: 'How to play' },
  'btn.settings': { ja: '設定', en: 'Settings' },
  'btn.privacy': { ja: 'プライバシーポリシー', en: 'Privacy policy' },
  'btn.close': { ja: 'とじる', en: 'Close' },
  'hud.time': { ja: 'のこり', en: 'Time' },
  'hud.cop': { ja: '警察', en: 'Cops' },
  'hud.thief': { ja: '泥棒', en: 'Thieves' },
  'hud.jail': { ja: '牢屋', en: 'Jail' },
  'hud.loot': { ja: 'お宝', en: 'Loot' },
  'hud.map': { ja: '俯瞰', en: 'Map' },
  'hud.follow': { ja: '通常', en: '3D' },
  'hint.controls': {
    ja: 'ドラッグで移動 ／ 右下ボタンでアクション ／ 長押しで解錠・救出・もどす',
    en: 'Drag to move / right button to act / hold to unlock, rescue or return loot',
  },
  'hide.label': { ja: '隠れ', en: 'Hidden' },
  'hide.cooldown': { ja: '隠れ直しまで', en: 'Hide again in' },
  'hide.ready': { ja: '茂みでかくれる', en: 'Hide in the bush' },
  'hide.timeout': { ja: '隠れ続けられず姿を現した', en: 'Had to come out of hiding' },
  'search.ready': { ja: '🔍 捜索', en: '🔍 Search' },
  'search.name': { ja: '捜索', en: 'Search' },
  'search.none': { ja: '捜索（反応なし）', en: 'Searched — nothing here' },
  'stat.arrests': { ja: '確保', en: 'Arrests' },
  'stat.secured': { ja: 'お宝搬出', en: 'Delivered' },
  'stat.rescue': { ja: '救出・解錠', en: 'Rescues' },
  'stat.returns': { ja: '奪い返し', en: 'Taken back' },
  'stat.exposed': { ja: '正体発覚', en: 'Exposed' },
  'stat.hides': { ja: '隠れた', en: 'Hides' },
  'stat.searches': { ja: '捜索', en: 'Searches' },
  'result.again': { ja: 'もう一回', en: 'Play again' },
  'result.home': { ja: 'タイトルへ', en: 'Title' },
  'settings.title': { ja: '設定', en: 'Settings' },
  'settings.time': { ja: '制限時間', en: 'Time limit' },
  'settings.sound': { ja: 'サウンド', en: 'Sound' },
  'settings.soundOn': { ja: 'ON', en: 'ON' },
  'settings.soundOff': { ja: 'OFF', en: 'OFF' },
  'settings.lang': { ja: '言語', en: 'Language' },
  'settings.preview': {
    ja: '設定はこの端末に保存されます。',
    en: 'Settings are saved on this device.',
  },
  'howto.title': { ja: 'あそびかた', en: 'How to play' },
  'howto.move': { ja: '移動', en: 'Move' },
  'howto.moveDesc': {
    ja: '画面左のスティックをドラッグ（PCは矢印キー・WASD）。',
    en: 'Drag the stick on the left (arrow keys or WASD on desktop).',
  },
  'howto.action': { ja: 'アクション', en: 'Action' },
  'howto.actionDesc': {
    ja: '右下の丸ボタン。警察は押している間ダッシュ、泥棒は茂みで「かくれる」。長押しは解錠・救出・お宝もどし。',
    en: 'The round button at bottom right. Cops dash while held; thieves hide in a bush. Hold to unlock, rescue or return loot.',
  },
  'howto.hide': { ja: '隠れる', en: 'Hide' },
  'howto.hideDesc': {
    ja: '茂みの中で1回 最大5秒まで隠れられる（残りゲージ表示）。出たあと3秒は隠れ直せない。お宝を持っていると隠れられない。',
    en: 'Hide in a bush for up to 5 seconds per turn (gauge shows the rest). After coming out you must wait 3 seconds to hide again. You cannot hide while carrying loot.',
  },
  'howto.search': { ja: '捜索', en: 'Search' },
  'howto.searchDesc': {
    ja: '警察は茂みの近く（5.5m以内）でボタンが「🔍 捜索」に光る。押すと足元から波紋が広がり、4.5m以内の隠れている泥棒を炙り出して確保する。',
    en: 'Near a bush (within 5.5m) a cop\'s button lights up as "🔍 Search". A ripple spreads from the cop and flushes out any hidden thief within 4.5m.',
  },
  'howto.goalCop': { ja: '警察の勝ち', en: 'Cops win' },
  'howto.goalCopDesc': {
    ja: '泥棒を全員確保する、または時間切れでお宝を1つでも守りきる。',
    en: 'Jail every thief, or keep at least one treasure safe when time runs out.',
  },
  'howto.goalThief': { ja: '泥棒の勝ち', en: 'Thieves win' },
  'howto.goalThiefDesc': {
    ja: 'お宝5つをすべて脱出ゲートへ運ぶ。運搬中は足が遅くなり、捕まるとお宝は街のどこかへ隠し戻される。',
    en: 'Deliver all 5 treasures. You are slower while carrying, and if caught the loot is hidden somewhere else in the city.',
  },
  'howto.spy': { ja: 'スパイ', en: 'Spies' },
  'howto.spyDesc': {
    ja: '内通者は牢屋を解錠、密告者は運ばれたお宝を奪い返す。現場を相手陣営に見られると正体発覚。',
    en: 'The mole unlocks the jail; the informer steals delivered loot back. If the other side sees you at it, you are exposed.',
  },
  'howto.time': { ja: '制限時間', en: 'Time limit' },
  'howto.timeDesc': {
    ja: '設定で3分／5分／7分から選べる。',
    en: 'Choose 3, 5 or 7 minutes in Settings.',
  },
  'privacy.title': { ja: 'プライバシーポリシー', en: 'Privacy policy' },
  'privacy.updated': { ja: '最終更新: 2026年11月21日', en: 'Last updated: 21 November 2026' },
  'privacy.p1': {
    ja: 'DOROKEI（ドロケー×人狼）は、トモアキ（Sign Link）が提供するオフラインで遊べるゲームです。',
    en: 'DOROKEI is an offline game provided by Tomoaki (Sign Link).',
  },
  'privacy.p2': {
    ja: '本アプリは、氏名・メールアドレス・電話番号・位置情報・連絡先・写真などの個人情報を一切収集しません。アカウント登録もありません。',
    en: 'The app collects no personal information: no name, email address, phone number, location, contacts or photos. There is no account to create.',
  },
  'privacy.p3': {
    ja: '広告・解析（アクセス解析）・第三者への送信は行いません。ゲームの進行はすべて端末内で処理されます。',
    en: 'There are no ads, no analytics and no data sent to third parties. All gameplay runs on the device.',
  },
  'privacy.p4': {
    ja: '設定（音量・言語・制限時間など）だけを端末内に保存します。アプリを削除すると消えます。',
    en: 'Only your settings (sound, language, time limit) are stored on the device, and they disappear when the app is deleted.',
  },
  'privacy.p5': {
    ja: 'お問い合わせ: ゲーム用メール t.maks.ts@gmail.com',
    en: 'Contact: t.maks.ts@gmail.com',
  },
  'privacy.p6': {
    ja: 'ポリシーを変更する場合は、この画面とストアの表記を更新します。',
    en: 'If this policy changes, this screen and the store listing will be updated.',
  },
};

// ko / zh は主要な見出しだけ翻訳し、他は英語へフォールバック
const KO = {
  'title.sub': '술래잡기 × 숨은 스파이',
  'title.catch': '경찰을 피해 보물 5개를 훔쳐 탈출하라.<br />하지만 ── 동료 중에 스파이가 있다.',
  'stage.label': '스테이지',
  'stage.comingSoon': '준비 중',
  'role.label': '내 역할',
  'role.auto': '맡김',
  'role.cop': '경찰',
  'role.thief': '도둑',
  'spy.label': '스파이 설정',
  'spy.both': '둘 다',
  'spy.cops': '경찰만',
  'spy.thieves': '도둑만',
  'spy.none': '없음',
  'selfspy.label': '내가 스파이',
  'selfspy.random': '랜덤',
  'selfspy.always': '반드시',
  'selfspy.never': '없음',
  'btn.start': '게임 시작',
  'btn.howto': '놀이 방법',
  'btn.settings': '설정',
  'btn.privacy': '개인정보 처리방침',
  'btn.close': '닫기',
  'hud.time': '남은 시간',
  'hud.cop': '경찰',
  'hud.thief': '도둑',
  'hud.jail': '감옥',
  'hud.loot': '보물',
  'hud.map': '전체 보기',
  'hud.follow': '3D',
  'hide.label': '숨기',
  'search.ready': '🔍 수색',
  'settings.title': '설정',
  'settings.time': '제한 시간',
  'settings.sound': '사운드',
  'settings.lang': '언어',
  'howto.title': '놀이 방법',
  'privacy.title': '개인정보 처리방침',
};

const ZH_HANS = {
  'title.sub': '抓小偷 × 隐藏间谍',
  'title.catch': '躲开警察，偷走全部5件宝物并逃出。<br />不过 ── 同伴之中有间谍。',
  'stage.label': '关卡',
  'stage.comingSoon': '敬请期待',
  'role.label': '你的角色',
  'role.auto': '随机',
  'role.cop': '警察',
  'role.thief': '小偷',
  'spy.label': '间谍设置',
  'spy.both': '双方',
  'spy.cops': '仅警察',
  'spy.thieves': '仅小偷',
  'spy.none': '没有',
  'selfspy.label': '自己是间谍',
  'selfspy.random': '随机',
  'selfspy.always': '必定',
  'selfspy.never': '不',
  'btn.start': '开始游戏',
  'btn.howto': '玩法',
  'btn.settings': '设置',
  'btn.privacy': '隐私政策',
  'btn.close': '关闭',
  'hud.time': '剩余',
  'hud.cop': '警察',
  'hud.thief': '小偷',
  'hud.jail': '牢房',
  'hud.loot': '宝物',
  'hud.map': '全景',
  'hud.follow': '3D',
  'hide.label': '躲藏',
  'search.ready': '🔍 搜查',
  'settings.title': '设置',
  'settings.time': '时间限制',
  'settings.sound': '声音',
  'settings.lang': '语言',
  'howto.title': '玩法',
  'privacy.title': '隐私政策',
};

const ZH_HANT = {
  'title.sub': '抓小偷 × 隱藏間諜',
  'title.catch': '躲開警察，偷走全部5件寶物並逃出。<br />不過 ── 同伴之中有間諜。',
  'stage.label': '關卡',
  'stage.comingSoon': '敬請期待',
  'role.label': '你的角色',
  'role.auto': '隨機',
  'role.cop': '警察',
  'role.thief': '小偷',
  'spy.label': '間諜設定',
  'spy.both': '雙方',
  'spy.cops': '僅警察',
  'spy.thieves': '僅小偷',
  'spy.none': '沒有',
  'selfspy.label': '自己是間諜',
  'selfspy.random': '隨機',
  'selfspy.always': '必定',
  'selfspy.never': '不',
  'btn.start': '開始遊戲',
  'btn.howto': '玩法',
  'btn.settings': '設定',
  'btn.privacy': '隱私政策',
  'btn.close': '關閉',
  'hud.time': '剩餘',
  'hud.cop': '警察',
  'hud.thief': '小偷',
  'hud.jail': '牢房',
  'hud.loot': '寶物',
  'hud.map': '全景',
  'hud.follow': '3D',
  'hide.label': '躲藏',
  'search.ready': '🔍 搜查',
  'settings.title': '設定',
  'settings.time': '時間限制',
  'settings.sound': '聲音',
  'settings.lang': '語言',
  'howto.title': '玩法',
  'privacy.title': '隱私政策',
};

const PARTIAL = { ko: KO, 'zh-Hans': ZH_HANS, 'zh-Hant': ZH_HANT };

export function isLang(id) {
  return LANGS.some((l) => l.id === id);
}

function dict(lang) {
  if (lang === 'ja' || !lang) return null;
  return PARTIAL[lang] || null;
}

/** 言語→英語→日本語の順にフォールバックして文字列を返す */
export function t(key, lang = DEFAULT_LANG) {
  const s = STRINGS[key];
  const direct = s && lang ? s[lang] : undefined;
  if (direct != null) return direct;
  const own = PARTIAL[lang]?.[key];
  if (own != null) return own;
  const en = s?.en;
  if (en != null) return en;
  return s?.ja ?? key;
}

/** DOM の data-i18n / data-i18n-html / data-i18n-ph を一括で差し替える */
export function applyI18n(root, lang = DEFAULT_LANG) {
  if (!root?.querySelectorAll) return;
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.getAttribute('data-i18n'), lang);
  }
  for (const el of root.querySelectorAll('[data-i18n-html]')) {
    // 翻訳文は自前の定数だけ（外部入力は入れない）
    el.innerHTML = t(el.getAttribute('data-i18n-html'), lang);
  }
  for (const el of root.querySelectorAll('[data-i18n-ph]')) {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'), lang));
  }
  const html = root.documentElement || root;
  html.setAttribute?.(
    'lang',
    lang === 'zh-Hans' || lang === 'zh-Hant' ? lang.toLowerCase() : lang,
  );
}

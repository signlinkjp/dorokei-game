# DOROKEI — ドロケー × 人狼（広い街・新ルール・iOS）

警官と泥棒の鬼ごっこ（ドロケー）に、人狼の「スパイ」を混ぜた 3D アクション。
HTML/CSS/JS + Three.js（CDN 不使用・`www/vendor/three.module.js` に同梱）だけで動き、
Capacitor の iOS シェル（`ios/`）でそのままアプリになります。ビルド工程はありません。

- プレイヤー1人 + CPU 8人（警察3 対 泥棒5、各陣営にスパイ0〜1）
- **150m × 150m** の広い街（銀行・宝石店・美術館・公園・駅・商店街・駐車場・路地・警察署）
- 右上に **ミニマップ（レーダー）**、左下バーチャルスティック、右下の文脈アクションボタン
- お宝は **10箇所の候補から5個** をランダム配置（捕まった時・奪い返された時は別の場所へ隠し戻し）

## 起動

```bash
cd /workspace/work/dorokei-game
PATH=/workspace/tools-node/node-v20.18.0-linux-x64/bin:$PATH npm test   # ルールのユニットテスト
PATH=/workspace/tools-node/node-v20.18.0-linux-x64/bin:$PATH npm run serve   # http://127.0.0.1:8899/
```

`www/` をそのまま Capacitor の `webDir` に指定しています（相対パス・ES Modules のみ、外部通信なし）。

### デモ用URLパラメータ（スクリーンショット／動作確認用）

| パラメータ | 例 | 意味 |
|---|---|---|
| `demo=1` | `?demo=1` | 全員CPUのオートプレイで開始（HUD表示） |
| `warp=42` | | 開始時に42秒ぶん早送り（賑やかな場面を作る） |
| `seed=7` | | 乱数シード（役割・お宝の配置・AIの動きが再現） |
| `team=cop\|thief` | | プレイヤーの希望陣営 |
| `spy=both\|cops\|thieves\|none` | | スパイ設定 |
| `view=top` | | 自分中心の俯瞰で開始 |
| `view=map` | | 街全体を見渡すカメラで開始（スクリーンショット用） |
| `hud=0` | | HUDを隠す |

## ルール（最新仕様）

| 役 | 見た目 | 本当の陣営 | できること |
|---|---|---|---|
| 警察 COP | 青い制服・帽子・パトランプ | 警察 | 泥棒に触れると確保（クールダウン4秒）。牢屋へ収容。アクション長押しでダッシュ |
| 内通者 COP SPY | 警官のフリ | **泥棒** | 牢屋の前で1.5秒長押し＝解錠して脱獄させる。警官に7.5m以内で見られると正体発覚 |
| 泥棒 THIEF | 黒マスク・バッグ | 泥棒 | お宝を回収→脱出ゲートへ。牢屋の前で1.5秒長押し＝仲間を救出。茂みに隠れる |
| 密告者 THIEF SPY | 泥棒のフリ | **警察** | ボタンで近く（11m以内）の泥棒を警察へ密告ピン。ゲート前で1.5秒長押し＝運ばれたお宝を隠し戻す。泥棒に見られると発覚 |

**勝利条件**

- **警察陣営**：泥棒を全員牢屋に入れる／時間切れ（300秒）でお宝を**1つでも守りきる**（＝泥棒が5個すべて運べていない）
- **泥棒陣営**：お宝**5個すべて**を脱出ゲートへ運ぶ

**新ルールの細部**

- **お宝運搬中の速度低下**：通常 6.8 m/s → 運搬中 **5.4 m/s**（警官 6.4 m/s・ダッシュ時 ×1.3）
- **お宝を持ったまま捕まった場合**：泥棒は牢屋へ、お宝は街の候補スポットへ**ランダムに隠し戻される**
- **隠れる**：茂みの中でアクション → 半透明になり、3.2m まで近づかれないと見つからない（動くと解除／お宝持ちは不可）
- **警察側スパイの解錠**：牢屋前で1.5秒。**他の警察に7.5m以内で見られると正体発覚**
- **泥棒側スパイの奪い返し**：ゲート前で1.5秒。**他の泥棒に7.5m以内で見られると正体発覚**
- **正体発覚後**：元の陣営（内通者なら警察、密告者なら泥棒）からも捕まえて牢屋へ送れる。牢屋に入れば本当の味方が救出できる
- **スパイ自身は捕まえる側に回れない**（正体を隠しているため）

タイトルで「あなたの役（おまかせ／警察／泥棒）」「スパイ設定（両方／警察のみ／泥棒のみ／なし）」
「自分がスパイ（ランダム／必ず／なし）」を選べます。

## 操作

| 操作 | スマホ | PC |
|---|---|---|
| 移動 | 左下スティックをドラッグ | WASD / 矢印キー |
| アクション | 右下ボタン（長押しで解錠・救出・奪い返し／泥棒は茂みで隠れる） | Space |
| 視点切替 | 左上「俯瞰／通常」 | V |

## ファイル構成

```
www/
  index.html            タイトル / HUD / ミニマップ / リザルト
  styles.css            明るいポップなUI（縦横どちらでも崩れない）
  vendor/three.module.js  Three.js r160（同梱・オフライン動作）
  src/core.js           コアロジック（描画非依存：役割・捕獲・牢屋・救出・解錠・隠れる・密告・奪い返し・勝敗・AI・グリッドA*）
  src/render.js         Three.js の街・キャラ・牢屋・お宝・ゲート・カメラ
  src/minimap.js        右上のレーダー（街の形＋お宝＋近くの相手＋自分の向き）
  src/main.js           UI配線・入力・ゲームループ・デモモード
test/core.test.js       ユニットテスト（node:test / 26本）
tools/serve.mjs         依存なし静的サーバー
tools/shot.mjs          ヘッドレスChromiumでスクリーンショット撮影
tools/interaction-test.mjs  ブラウザ操作（移動・視点・ミニマップ・リザルト）の自動確認
tools/portrait.mjs      iPhone縦持ち(390×844)のレイアウト確認
tools/make-icons.mjs    アプリアイコン(1024)とスプラッシュ(2732)の生成
ios/                    Capacitor iOS プロジェクト（Xcode）
docs/ios-testflight-build1.yml  TestFlight ワークフローの下書き（Safariで .github/workflows/ へ貼る）
```

## テスト結果

`npm test` → **26 / 26 pass**

- 役割割り当て（既定3対5＋各陣営スパイ1、スパイ設定4種、プレイヤー希望とスパイ希望）
- 街の広さ（150m×150m）・ランドマーク8つ以上・お宝10候補から5箇所・配置の重複なし・建物や道路の上に置かれない
- お宝の回収・搬出・5個すべてで泥棒の勝ち／時間切れで1つでも守れば警察の勝ち（4/5の表示も確認）
- 運搬中の速度低下（6.8 → 5.4 m/s を実測）
- お宝持ちの捕獲 → 牢屋＋お宝が別の候補スポットへ隠し戻される
- 隠れる／4m離れた警官には見つからない／近づけば見つかる／動くと解除／お宝持ちと警官は隠れられない
- 内通者の解錠と発覚（見られている時だけ発覚）／未発覚は確保されない／発覚後は牢屋へ
- 密告者の奪い返し（ゲート前1.5秒）と正体発覚・泥棒による確保／密告者はお宝を運べない
- 密告ピンの生成・期限・クールダウン
- グリッドA*（開始位置→ゲート・各お宝・牢屋の内外を実際に歩いて到達）
- CPU 8人の通し対戦（120秒で破綻なし・NaNなし・建物に入らない／6シードで決着し、両陣営の勝ちが発生）
- 同じシードなら同じ結果（再現性）

## スクリーンショット

- `downloads/dorokei-title.png` … タイトル画面（パトカーの赤×青＋お宝のゴールド、明るいポップな新デザイン）
- `downloads/dorokei-play.png` … プレイ画面（150m×150mの街全体・HUD・右上のレーダー）

再撮影：`node tools/shot.mjs`。縦持ちは `node tools/portrait.mjs`。
ヘッドレス Chromium は `/workspace/work/dcd-b17/browsers` を使い、システムに無い libatk/libatspi は
`.browser-libs/`（Debian の .deb を展開）から供給しています。

## iOS（Capacitor）

| 項目 | 値 |
|---|---|
| Bundle ID | `jp.signlink.Dorokei` |
| アプリ名 | `DOROKEI` |
| バージョン | `1.0.0`（Build `1`） |
| 対応 | iOS 15.0 以上 / iPhone・iPad / 縦横対応 / ステータスバー非表示 |
| 暗号化 | `ITSAppUsesNonExemptEncryption = false`（輸出コンプライアンスの質問をスキップ） |

```bash
npx cap sync ios     # www → ios/App/App/public を更新（要 Node 22）
npx cap open ios     # Xcode で開く（Macのみ）
```

アプリアイコンとスプラッシュは `node tools/make-icons.mjs` で再生成できます
（青空×夜の街＋お宝の宝箱＋パトランプ）。

### TestFlight までの手順（トモアキさん側の操作）

1. **Apple Developer**：Identifiers に `jp.signlink.Dorokei` を登録（App Store Connect の「+」→新規 App でも可）
2. **App Store Connect**：マイApp →「+」→ 新規App
   - プラットフォーム iOS／名前 `DOROKEI`／主要言語 日本語／Bundle ID `jp.signlink.Dorokei`／SKU は任意（例 `dorokei-ios-1`）
   - カテゴリは「ゲーム > アクション」あたり、年齢 rating は 4+（暴力表現はブロック調の鬼ごっこ程度）
3. **GitHub Secrets**（`signlinkjp/dorokei-game` → Settings → Secrets and variables → Actions）
   - `APPLE_TEAM_ID` … 既存と同じ `TGBNH8WJV6`
   - `APPSTORE_CONNECT_KEY_ID` / `APPSTORE_CONNECT_ISSUER_ID` / `APPSTORE_CONNECT_PRIVATE_KEY`
     （既存の `ASC_API_KEY_ID` / `ASC_API_ISSUER_ID` / `ASC_API_KEY_P8` と同じ値でOK。ワークフローは両方の名前を読みます）
4. **ワークフローの有効化**：`docs/ios-testflight-build1.yml` の中身を Safari でコピーし、
   `.github/workflows/ios-testflight-build1.yml` としてコミット（＝この時点でビルドのみ1回走ります）
5. **Actions →「DOROKEI iOS TestFlight Build 1」→ Run workflow**
   - `confirm_bundle_id` = `jp.signlink.Dorokei`
   - まず `upload_to_testflight = false` で署名済み IPA と検証結果を確認
   - 問題なければ `true` でもう一度実行 → TestFlight に Build 1 が届きます

## 設計メモ / 次の一手

- 広い街でAIが壁に引っかからないよう、2mグリッドのA*＋見通しによる経路の間引きを `core.js` に実装。
- コアは描画非依存なので、そのまま通信対戦（状態同期）やバランス調整の自動検証に回せます。
- 今後の候補：視界・足音などの情報戦、牢屋の格子越しの会話、スパイの告発（投票）、ステージのバリエーション。

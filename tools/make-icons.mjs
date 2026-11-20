// アプリアイコンとスプラッシュ画像を生成する（ヘッドレスChromiumのCanvasを撮影）
// 使い方: node tools/make-icons.mjs
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BROWSERS = process.env.PLAYWRIGHT_BROWSERS_PATH || '/workspace/work/dcd-b17/browsers';
const LIB_DIR = path.resolve(
  fileURLToPath(new URL('../.browser-libs/usr/lib/x86_64-linux-gnu', import.meta.url)),
);
process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS;
process.env.LD_LIBRARY_PATH = [LIB_DIR, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const require = createRequire('/workspace/work/dcd-b17/');
const { chromium } = require('playwright');

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const ICON_DIR = path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
const SPLASH_DIR = path.join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset');
const DOC_DIR = path.join(ROOT, 'assets');

const ICON_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:transparent}
canvas{display:block}
</style></head><body><canvas id="c" width="1024" height="1024"></canvas>
<script>
const c = document.getElementById('c');
const g = c.getContext('2d');
const S = 1024;

// 背景: 空の青 → 深い夜の青
const bg = g.createLinearGradient(0, 0, 0, S);
bg.addColorStop(0, '#8fd2ff');
bg.addColorStop(0.34, '#3f86e6');
bg.addColorStop(1, '#10306c');
g.fillStyle = bg;
g.fillRect(0, 0, S, S);

const glow = g.createRadialGradient(S * 0.32, S * 0.2, 10, S * 0.32, S * 0.2, S * 0.8);
glow.addColorStop(0, 'rgba(255,255,255,0.45)');
glow.addColorStop(0.6, 'rgba(255,255,255,0.06)');
glow.addColorStop(1, 'rgba(255,255,255,0)');
g.fillStyle = glow;
g.fillRect(0, 0, S, S);

// 夜の街（下部）
const blocks = [[30,742,140,220],[186,802,120,160],[320,760,150,200],[486,820,120,140],[620,748,160,212],[796,806,120,156],[930,760,90,200]];
for (const [x, y, w, h] of blocks) {
  g.fillStyle = 'rgba(7,24,56,0.42)';
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,240,190,0.5)';
  for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) {
    if ((i + j) % 2 === 0) g.fillRect(x + 18 + i * 46, y + 24 + j * 44, 20, 20);
  }
}

// パトランプ
function lamp(x, color, blur) {
  g.save();
  g.shadowColor = color;
  g.shadowBlur = blur;
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(x, 118, 190, 62, 30);
  g.fill();
  g.restore();
}
lamp(S / 2 - 206, '#e8443f', 52);
lamp(S / 2 + 16, '#4cc2ff', 52);
g.fillStyle = 'rgba(8,18,38,0.9)';
g.beginPath();
g.roundRect(S / 2 - 232, 176, 464, 30, 15);
g.fill();

// お宝の宝箱
g.save();
g.translate(S / 2, 640);

// 接地の影
g.fillStyle = 'rgba(4,16,40,0.35)';
g.beginPath();
g.ellipse(0, 322, 250, 40, 0, 0, Math.PI * 2);
g.fill();

// 本体
const body = g.createLinearGradient(-240, 0, 240, 320);
body.addColorStop(0, '#ffe98a');
body.addColorStop(0.42, '#ffc22c');
body.addColorStop(1, '#d9870a');
g.fillStyle = body;
g.beginPath();
g.roundRect(-238, -16, 476, 330, 34);
g.fill();
g.strokeStyle = 'rgba(120,72,0,0.45)';
g.lineWidth = 8;
g.stroke();

// フタ
const lid = g.createLinearGradient(0, -290, 0, 40);
lid.addColorStop(0, '#fff0a8');
lid.addColorStop(0.6, '#ffcb3d');
lid.addColorStop(1, '#ef9f10');
g.fillStyle = lid;
g.beginPath();
g.moveTo(-238, -10);
g.lineTo(-238, -60);
g.quadraticCurveTo(0, -300, 238, -60);
g.lineTo(238, -10);
g.closePath();
g.fill();
g.strokeStyle = 'rgba(120,72,0,0.45)';
g.lineWidth = 8;
g.stroke();

// 宝箱のシルエットにクリップしてから帯と金具を乗せる
g.save();
g.beginPath();
g.roundRect(-238, -16, 476, 330, 34);
g.moveTo(-238, -10);
g.lineTo(-238, -60);
g.quadraticCurveTo(0, -300, 238, -60);
g.lineTo(238, -10);
g.closePath();
g.clip();

// 帯（縦）
g.fillStyle = '#8a5c00';
g.fillRect(-46, -330, 92, 660);
g.fillStyle = 'rgba(255,255,255,0.25)';
g.fillRect(-46, -330, 20, 660);

// 鍵穴の金具
g.fillStyle = 'rgba(120,72,0,0.9)';
g.beginPath();
g.roundRect(-72, 96, 144, 150, 26);
g.fill();
g.fillStyle = '#ffe27a';
g.beginPath();
g.arc(0, 146, 34, 0, Math.PI * 2);
g.fill();
g.beginPath();
g.moveTo(-18, 158);
g.lineTo(18, 158);
g.lineTo(12, 226);
g.lineTo(-12, 226);
g.closePath();
g.fill();
g.restore(); // clip
g.restore(); // translate

// きらめき
function spark(x, y, r, a) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const rad = i % 2 === 0 ? r : r * 0.32;
    g.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
  }
  g.closePath();
  g.fill();
  g.restore();
}
spark(214, 330, 44, 0.2);
spark(812, 372, 34, -0.3);
spark(866, 292, 20, 0.5);
spark(178, 470, 22, 0.1);
spark(300, 900, 16, 0.4);
</script></body></html>`;

const SPLASH_HTML = (w, h, iconData) => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0}
canvas{display:block}
</style></head><body><canvas id="c" width="${w}" height="${h}"></canvas>
<script>
const c = document.getElementById('c');
const g = c.getContext('2d');
const W = ${w}, H = ${h};
const bg = g.createLinearGradient(0, 0, 0, H);
bg.addColorStop(0, '#a8dcff');
bg.addColorStop(0.55, '#d6efff');
bg.addColorStop(1, '#ffe6b4');
g.fillStyle = bg;
g.fillRect(0, 0, W, H);
const icon = new Image();
icon.onload = () => {
  const s = Math.min(W, H) * 0.34;
  g.save();
  g.shadowColor = 'rgba(20,60,120,0.35)';
  g.shadowBlur = 60;
  g.shadowOffsetY = 24;
  g.beginPath();
  g.roundRect((W - s) / 2, (H - s) / 2 - s * 0.18, s, s, s * 0.22);
  g.fillStyle = '#1b4a9c';
  g.fill();
  g.restore();
  g.save();
  g.beginPath();
  g.roundRect((W - s) / 2, (H - s) / 2 - s * 0.18, s, s, s * 0.22);
  g.clip();
  g.drawImage(icon, (W - s) / 2, (H - s) / 2 - s * 0.18, s, s);
  g.restore();
  g.fillStyle = '#1b4a9c';
  g.textAlign = 'center';
  g.font = 'bold ' + Math.round(s * 0.22) + 'px "Liberation Sans", sans-serif';
  g.fillText('DOROKEI', W / 2, (H + s) / 2 + s * 0.06);
  g.fillStyle = '#45536b';
  g.font = 'bold ' + Math.round(s * 0.082) + 'px "WenQuanYi Zen Hei", sans-serif';
  g.fillText('ドロケー × 人狼', W / 2, (H + s) / 2 + s * 0.22);
  window.__ready = true;
};
icon.src = "${iconData}";
</script></body></html>`;

const browser = await chromium.launch({
  executablePath: path.join(
    BROWSERS,
    'chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell',
  ),
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function renderIcon() {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(ICON_HTML, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  const buf = await page.screenshot({ type: 'png', omitBackground: true });
  await page.close();
  return buf;
}

const icon = await renderIcon();
for (const dir of [ICON_DIR, DOC_DIR]) {
  await mkdir(dir, { recursive: true });
}
const { writeFile } = await import('node:fs/promises');
await writeFile(path.join(ICON_DIR, 'AppIcon-512@2x.png'), icon);
await writeFile(path.join(DOC_DIR, 'appicon-1024.png'), icon);
console.log('icon written');

// スプラッシュ（2732x2732 を3種。Capacitor の既定名に合わせる）
const iconB64 = icon.toString('base64');
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  const page = await browser.newPage({ viewport: { width: 2732, height: 2732 }, deviceScaleFactor: 1 });
  await page.setContent(SPLASH_HTML(2732, 2732, `data:image/png;base64,${iconB64}`), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });
  await page.waitForTimeout(200);
  const buf = await page.screenshot({ type: 'png' });
  await writeFile(path.join(SPLASH_DIR, name), buf);
  await page.close();
  console.log('splash written:', name);
}

await browser.close();

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
const BROWSERS = '/workspace/work/dcd-b17/browsers';
const LIB_DIR = path.resolve(fileURLToPath(new URL('../.browser-libs/usr/lib/x86_64-linux-gnu', import.meta.url)));
process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS;
process.env.LD_LIBRARY_PATH = [LIB_DIR, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const require = createRequire('/workspace/work/dcd-b17/');
const { chromium } = require('playwright');
const port = 8916;
const server = await startServer(port);
const browser = await chromium.launch({
  executablePath: path.join(BROWSERS, 'chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell'),
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.waitForTimeout(2200);
await page.screenshot({ path: '/workspace/downloads/portrait-title.png' });
const lay = await page.evaluate(() => {
  const inner = document.querySelector('.title-inner').getBoundingClientRect();
  const start = document.getElementById('startBtn').getBoundingClientRect();
  return { inner: inner.toJSON(), start: start.toJSON(), scrollH: document.documentElement.scrollHeight, vh: innerHeight };
});
console.log('title layout', JSON.stringify(lay));
await page.goto(`http://127.0.0.1:${port}/?demo=1&warp=42&seed=7`, { waitUntil: 'load' });
await page.waitForTimeout(2400);
await page.screenshot({ path: '/workspace/downloads/portrait-play.png' });
const lay2 = await page.evaluate(() => ({
  hud: document.querySelector('.hud-top').getBoundingClientRect().toJSON(),
  radar: document.querySelector('.radar').getBoundingClientRect().toJSON(),
  banner: document.querySelector('.role-banner').getBoundingClientRect().toJSON(),
  action: document.getElementById('actionBtn').getBoundingClientRect().toJSON(),
  stick: document.getElementById('stick').getBoundingClientRect().toJSON(),
  feed: document.querySelector('.event-feed').getBoundingClientRect().toJSON(),
}));
console.log('play layout', JSON.stringify(lay2));
await browser.close();
server.close();

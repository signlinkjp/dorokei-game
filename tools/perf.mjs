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
const port = 8917;
const server = await startServer(port);
const browser = await chromium.launch({
  executablePath: path.join(BROWSERS, 'chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell'),
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:${port}/?demo=1&warp=20&seed=7`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const w = window.__dorokei.world;
  const r = w.renderer.info;
  let meshes = 0, instanced = 0;
  w.scene.traverse((o) => { if (o.isInstancedMesh) instanced++; else if (o.isMesh) meshes++; });
  return {
    calls: r.render.calls,
    triangles: r.render.triangles,
    geometries: r.memory.geometries,
    textures: r.memory.textures,
    meshes, instanced,
    programs: r.programs?.length,
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
server.close();

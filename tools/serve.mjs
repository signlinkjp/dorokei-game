// 依存なしの静的サーバー（www/ を配信）
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../www/', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
};

export function startServer(port = 8899) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let file = decodeURIComponent(url.pathname);
      if (file === '/' || file === '') file = '/index.html';
      const full = path.join(ROOT, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
      if (!full.startsWith(ROOT)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      const data = await readFile(full);
      res.writeHead(200, {
        'content-type': TYPES[path.extname(full)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && process.argv[1].endsWith('serve.mjs')) {
  const port = Number(process.env.PORT || 8899);
  startServer(port).then(() => console.log(`DOROKEI: http://127.0.0.1:${port}/`));
}

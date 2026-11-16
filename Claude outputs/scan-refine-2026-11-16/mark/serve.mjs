// Serves the marking page and keeps the marks in marks.json next to it.
// node serve.mjs [port]   (default 8091)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const port = +(process.argv[2] || 8091);
const marksFile = path.join(dir, 'marks.json');
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.js': 'text/javascript' };

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/marks' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(fs.existsSync(marksFile) ? fs.readFileSync(marksFile) : '{}');
    }
    if (url.pathname === '/marks' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          fs.writeFileSync(marksFile, JSON.stringify(JSON.parse(body), null, 1));
          res.writeHead(204).end();
        } catch {
          res.writeHead(400).end('bad json');
        }
      });
      return;
    }
    const file = path.normalize(path.join(dir, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`marking page on http://localhost:${port}`));

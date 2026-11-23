// 페이지는 localhost:4200, 이미지는 127.0.0.1:4201 에서 준다. 토스뱅크처럼 이미지가 다른 origin 이고
// CORS 와 Timing-Allow-Origin 을 연다.   node scripts/serve.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
function serve(port, dir, extra = {}) {
  createServer(async (req, res) => {
    let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (p.endsWith('/')) p += 'index.html';
    try {
      const body = await readFile(join(dir, p));
      res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream', 'cache-control': 'max-age=86400', ...extra });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  }).listen(port, () => console.log(`http://localhost:${port}/`));
}
serve(4200, root);
serve(4201, join(root, 'images'), { 'access-control-allow-origin': '*', 'timing-allow-origin': '*' });

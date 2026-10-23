// Loads each variant in a fresh headless Chrome profile and records every font
// request through CDP. Bytes are encodedDataLength: what crossed the network,
// headers included, after content-encoding. Not file size on disk.
//
//   node scripts/measure.mjs [runs]
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const BASE = ['a-pinned-ttf', 'b-full-woff2', 'c-subset-woff2', 'd-google-variable'];
// The -4w folders are the same variants with a page that uses four weights.
const VARIANTS = [...BASE, ...BASE.map((v) => `${v}-4w`)];
const PAGES = ['', 'long.html'];
// `node scripts/measure.mjs 5 controls` measures the -4w control pages instead.
const CONTROLS = process.argv[3] === 'controls';
const CONTROL_PAGES = ['index-3w.html', 'long-3w.html', 'index-note.html', 'long-note.html'];
const RUNS = Number(process.argv[2] ?? 5);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2' };

function serve() {
  const server = createServer((req, res) => {
    let path = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    try {
      if (statSync(path).isDirectory()) path = join(path, 'index.html');
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(readFileSync(path));
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, () => ok(server)));
}

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'fonts-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((ok, fail) => {
    chrome.stderr.on('data', (d) => {
      const m = String(d).match(/ws:\/\/\S+/);
      if (m) ok(m[0]);
    });
    chrome.on('exit', () => fail(new Error('chrome exited')));
  });
  return { chrome, profile, wsUrl };
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else listeners.forEach((fn) => fn(msg));
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((ok) => {
      pending.set(++id, ok);
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  return new Promise((ok) => (ws.onopen = () => ok({ ws, send, on: (fn) => listeners.push(fn) })));
}

async function measureOnce(url) {
  const { chrome, profile, wsUrl } = await launch();
  const cdp = await connect(wsUrl);
  const { result: { targetId } } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const reqs = new Map();
  let loaded;
  const done = new Promise((ok) => (loaded = ok));
  cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    const p = m.params;
    if (m.method === 'Network.responseReceived') {
      reqs.set(p.requestId, {
        url: p.response.url, type: p.type, status: p.response.status,
        encoding: p.response.headers['content-encoding'] ?? p.response.headers['Content-Encoding'] ?? '',
        protocol: p.response.protocol,
      });
    }
    if (m.method === 'Network.loadingFinished' && reqs.has(p.requestId)) {
      reqs.get(p.requestId).bytes = p.encodedDataLength;
    }
    if (m.method === 'Page.loadEventFired') loaded();
  });
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
  await cdp.send('Page.navigate', { url }, sessionId);
  await done;
  await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => 1)', awaitPromise: true }, sessionId);
  // loadingFinished for the last font can trail fonts.ready by a tick.
  await new Promise((r) => setTimeout(r, 500));
  cdp.ws.close();
  chrome.kill();
  await new Promise((r) => chrome.once('exit', r));
  rmSync(profile, { recursive: true, force: true });
  return [...reqs.values()];
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const server = await serve();
const base = `http://localhost:${server.address().port}`;
const report = {};
for (const v of CONTROLS ? VARIANTS.filter((x) => x.endsWith('-4w')) : VARIANTS) {
  for (const page of CONTROLS ? CONTROL_PAGES : PAGES) {
    const key = `${v}/${page || 'index.html'}`;
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await measureOnce(`${base}/${v}/${page}`));
    const fonts = runs.map((r) => r.filter((x) => x.type === 'Font'));
    const css = runs.map((r) => r.filter((x) => x.type === 'Stylesheet'));
    const totals = fonts.map((f) => f.reduce((s, x) => s + x.bytes, 0));
    report[key] = {
      runs: RUNS,
      fontFiles: median(fonts.map((f) => f.length)),
      fontBytes: median(totals),
      fontBytesRange: [Math.min(...totals), Math.max(...totals)],
      cssBytes: median(css.map((f) => f.reduce((s, x) => s + x.bytes, 0))),
      // Every run's file list, so a change in what the server hands out is visible.
      perRun: fonts.map((f) => f.map(({ url, bytes }) => `${url.split('/').pop()} ${bytes}`).sort()),
      lastRun: fonts.at(-1).map(({ url, status, encoding, protocol, bytes }) => ({
        file: url.split('/').pop(), status, encoding, protocol, bytes,
      })),
    };
    console.log(key, report[key].fontFiles, 'files', report[key].fontBytes, 'B', report[key].fontBytesRange);
  }
}
server.close();
const out = join(ROOT, 'results', `${new Date().toISOString().slice(0, 10)}${CONTROLS ? '-controls' : ''}.json`);
writeFileSync(out, JSON.stringify({ chrome: CHROME, measuredAt: new Date().toISOString(), report }, null, 2));
console.log('wrote', relative(process.cwd(), out));

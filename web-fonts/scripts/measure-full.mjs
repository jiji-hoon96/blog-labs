// Measures the full-* folders: bytes and time, locally or against a deployed copy.
//
//   node scripts/measure-full.mjs [runs] [base] [throttle]
//
//   base      omitted: a local server like measure.mjs. Otherwise e.g. https://x.netlify.app
//   throttle  'none' (default) or 'fast4g' (see THROTTLE)
//
// Every run is a fresh headless Chrome profile with the cache disabled.
// Bytes are encodedDataLength: what crossed the network, headers included.
// Times are milliseconds from the document request:
//   fontsDone  the last font response finished
//   fcp, lcp   from the page's own performance entries
// Each font response also keeps cache-status and age, so an edge miss can be told
// apart from an edge hit. Before the measured runs, every page is loaded once
// unmeasured to warm the edge.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FOLDERS = ['full-a-ttf', 'full-b-woff2', 'full-c-subset', 'full-d-google', 'full-d-range'];
const RUNS = Number(process.argv[2] ?? 5);
const BASE = process.argv[3] && process.argv[3] !== 'local' ? process.argv[3].replace(/\/$/, '') : null;
const THROTTLE_NAME = process.argv[4] ?? 'none';
// Kbit/s and ms. DevTools' Fast 4G preset as applied, not its nominal 60 ms / 9 Mbps:
// front_end/core/sdk/NetworkManager.ts multiplies latency by 2.75 and throughput by 0.9.
const THROTTLE = {
  none: null,
  fast4g: { latency: 165, downloadKbps: 8100, uploadKbps: 1350 },
}[THROTTLE_NAME];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

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

const PAINT = `new Promise((ok) => {
  let lcp = 0;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) lcp = e.startTime; })
    .observe({ type: 'largest-contentful-paint', buffered: true });
  document.fonts.ready.then(() => setTimeout(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
    ok(JSON.stringify({ fcp, lcp, origin: performance.timeOrigin }));
  }, 300));
})`;

async function measureOnce(url) {
  const { chrome, profile, wsUrl } = await launch();
  const cdp = await connect(wsUrl);
  const { result: { targetId } } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const reqs = new Map();
  let docStart;
  let loaded;
  const done = new Promise((ok) => (loaded = ok));
  cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    const p = m.params;
    if (m.method === 'Network.requestWillBeSent') {
      if (p.type === 'Document' && docStart === undefined) docStart = p.timestamp;
      reqs.set(p.requestId, { start: p.timestamp });
    }
    if (m.method === 'Network.responseReceived' && reqs.has(p.requestId)) {
      const h = Object.fromEntries(Object.entries(p.response.headers).map(([k, v]) => [k.toLowerCase(), v]));
      Object.assign(reqs.get(p.requestId), {
        url: p.response.url, type: p.type, status: p.response.status, protocol: p.response.protocol,
        encoding: h['content-encoding'] ?? '', contentType: h['content-type'] ?? '',
        cacheStatus: h['cache-status'] ?? '', age: h.age ?? '',
      });
    }
    if (m.method === 'Network.loadingFinished' && reqs.has(p.requestId)) {
      Object.assign(reqs.get(p.requestId), { bytes: p.encodedDataLength, end: p.timestamp });
    }
    if (m.method === 'Page.loadEventFired') loaded();
  });
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
  if (THROTTLE) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: THROTTLE.latency,
      downloadThroughput: (THROTTLE.downloadKbps * 1000) / 8, uploadThroughput: (THROTTLE.uploadKbps * 1000) / 8,
    }, sessionId);
  }
  await cdp.send('Page.navigate', { url }, sessionId);
  await done;
  const { result: { result: { value } } } = await cdp.send('Runtime.evaluate', { expression: PAINT, awaitPromise: true }, sessionId);
  await new Promise((r) => setTimeout(r, 500));
  cdp.ws.close();
  chrome.kill();
  await new Promise((r) => chrome.once('exit', r));
  rmSync(profile, { recursive: true, force: true });
  const all = [...reqs.values()].filter((r) => r.url);
  const fonts = all.filter((r) => r.type === 'Font');
  const ms = (t) => Math.round((t - docStart) * 1000);
  const paint = JSON.parse(value);
  return {
    fonts, css: all.filter((r) => r.type === 'Stylesheet'),
    fontsDone: fonts.length ? Math.max(...fonts.map((f) => ms(f.end))) : 0,
    fcp: paint.fcp && Math.round(paint.fcp), lcp: Math.round(paint.lcp),
  };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const server = BASE ? null : await serve();
const base = BASE ?? `http://localhost:${server.address().port}`;
const report = {};
for (const f of FOLDERS) {
  const url = `${base}/${f}/`;
  // Warm the edge, not recorded. One load is not enough: the edge has several
  // nodes, so a single warm-up still leaves misses.
  if (BASE) for (let i = 0; i < Number(process.env.WARM ?? 3); i++) await measureOnce(url);
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await measureOnce(url));
  const totals = runs.map((r) => r.fonts.reduce((s, x) => s + x.bytes, 0));
  report[f] = {
    runs: RUNS,
    fontFiles: median(runs.map((r) => r.fonts.length)),
    fontBytes: median(totals),
    fontBytesRange: [Math.min(...totals), Math.max(...totals)],
    cssBytes: median(runs.map((r) => r.css.reduce((s, x) => s + x.bytes, 0))),
    fontsDone: median(runs.map((r) => r.fontsDone)),
    fontsDoneRuns: runs.map((r) => r.fontsDone),
    // Only the runs where every font came from the edge cache.
    fontsDoneAllHit: median(runs.filter((r) => r.fonts.every((x) => !/fwd=(miss|stale)/.test(x.cacheStatus))).map((r) => r.fontsDone)) ?? null,
    fcp: median(runs.map((r) => r.fcp)),
    lcp: median(runs.map((r) => r.lcp)),
    byFamily: Object.fromEntries(['nskr', 'inter', 'serif', 'mono'].map((fam) => {
      const last = runs.at(-1).fonts.filter((x) => x.url.split('/').pop().startsWith(fam));
      return [fam, { files: last.length, bytes: last.reduce((s, x) => s + x.bytes, 0) }];
    })),
    // Per run: how many font responses the edge served without going to origin.
    edgeHits: runs.map((r) => `${r.fonts.filter((x) => !/fwd=miss/.test(x.cacheStatus) && !/fwd=stale/.test(x.cacheStatus)).length}/${r.fonts.length}`),
    perRun: runs.map((r) => r.fonts.map(({ url, bytes }) => `${url.split('/').pop()} ${bytes}`).sort()),
    lastRun: runs.at(-1).fonts.map(({ url, status, encoding, contentType, protocol, cacheStatus, age, bytes }) => ({
      file: url.split('/').pop(), status, encoding, contentType, protocol, cacheStatus, age, bytes,
    })),
    lastRunCss: runs.at(-1).css.map(({ url, encoding, protocol, bytes }) => ({ file: url.split('/').pop(), encoding, protocol, bytes })),
  };
  const r = report[f];
  console.log(f, r.fontFiles, 'files', r.fontBytes, 'B', r.fontBytesRange, 'css', r.cssBytes, 'B',
    'fontsDone', r.fontsDone, r.fontsDoneRuns.join(','), 'fcp', r.fcp, 'lcp', r.lcp, 'edge', r.edgeHits.join(','), 'allHit', r.fontsDoneAllHit);
}
server?.close();
const tag = `${BASE ? 'deployed' : 'local'}-${THROTTLE_NAME}`;
const out = join(ROOT, 'results', `${new Date().toISOString().slice(0, 10)}-full-${tag}.json`);
writeFileSync(out, JSON.stringify({ chrome: CHROME, base, throttle: THROTTLE, measuredAt: new Date().toISOString(), report }, null, 2));
console.log('wrote', relative(process.cwd(), out));

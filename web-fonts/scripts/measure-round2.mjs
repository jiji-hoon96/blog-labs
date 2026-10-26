// Second round against the deployed copy: what measure-full.mjs did not record.
//
//   node scripts/measure-round2.mjs [runs] [base] [throttle] [pages...]
//
//   pages     paths under base, default PAGES below
//
// Same setup as measure-full.mjs: a fresh headless Chrome profile per run, cache
// disabled, the edge warmed WARM times (default 3) per page before measuring.
// On top of bytes and fontsDone it keeps, per run:
//   cls        sum of layout-shift entries without recent input, read 1.5 s after
//              document.fonts.ready
//   origins    per host: when its first request started and the DNS, TCP and TLS
//              time the browser spent connecting to it (ms, 0 when reused)
//   fontPhases for the last font to finish: queued, waiting for the first byte,
//              and downloading (ms)
//   unusedPreloads  Chrome's "preloaded but not used" console warnings
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PAGES = [
  'full-d-google/', 'full-d-live/', 'full-d-live-preconnect/',
  'full-d-google/optional.html', 'next-font/', 'next-font-nopreload/', 'next-font-noadjust/',
];
const RUNS = Number(process.argv[2] ?? 9);
const BASE = (process.argv[3] ?? 'https://hooninedev-web-fonts.netlify.app').replace(/\/$/, '');
const THROTTLE_NAME = process.argv[4] ?? 'fast4g';
const pages = process.argv.length > 5 ? process.argv.slice(5) : PAGES;
// DevTools' Fast 4G preset as applied (see measure-full.mjs).
const THROTTLE = { none: null, fast4g: { latency: 165, downloadKbps: 8100, uploadKbps: 1350 } }[THROTTLE_NAME];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'fonts-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=1280,900', 'about:blank',
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

// Installed before any page script so early shifts are not missed.
const OBSERVE = `window.__cls = 0; window.__shifts = [];
new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) {
  window.__cls += e.value; window.__shifts.push([Math.round(e.startTime), +e.value.toFixed(4)]);
} }).observe({ type: 'layout-shift', buffered: true });`;

const PAINT = `new Promise((ok) => {
  let lcp = 0;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) lcp = e.startTime; })
    .observe({ type: 'largest-contentful-paint', buffered: true });
  document.fonts.ready.then(() => setTimeout(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
    ok(JSON.stringify({ fcp, lcp, cls: window.__cls, shifts: window.__shifts,
      faces: [...document.fonts].reduce((a, f) => (a[f.status] = (a[f.status] ?? 0) + 1, a), {}) }));
  }, 1500));
})`;

async function measureOnce(url) {
  const { chrome, profile, wsUrl } = await launch();
  const cdp = await connect(wsUrl);
  const { result: { targetId } } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const reqs = new Map();
  const warnings = [];
  let docStart;
  let loaded;
  const done = new Promise((ok) => (loaded = ok));
  cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    const p = m.params;
    if (m.method === 'Network.requestWillBeSent') {
      if (p.type === 'Document' && docStart === undefined) docStart = p.timestamp;
      reqs.set(p.requestId, { start: p.timestamp, url: p.request.url });
    }
    if (m.method === 'Network.responseReceived' && reqs.has(p.requestId)) {
      const h = Object.fromEntries(Object.entries(p.response.headers).map(([k, v]) => [k.toLowerCase(), v]));
      Object.assign(reqs.get(p.requestId), {
        url: p.response.url, type: p.type, status: p.response.status, protocol: p.response.protocol,
        contentType: h['content-type'] ?? '', cacheStatus: h['cache-status'] ?? '', timing: p.response.timing,
      });
    }
    if (m.method === 'Network.loadingFinished' && reqs.has(p.requestId)) {
      Object.assign(reqs.get(p.requestId), { bytes: p.encodedDataLength, end: p.timestamp });
    }
    if (m.method === 'Log.entryAdded' && /preload/i.test(p.entry.text)) warnings.push(p.entry.text);
    if (m.method === 'Page.loadEventFired') loaded();
  });
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Log.enable', {}, sessionId);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVE }, sessionId);
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
  // Chrome reports an unused preload a few seconds after load.
  await new Promise((r) => setTimeout(r, 3500));
  cdp.ws.close();
  chrome.kill();
  await new Promise((r) => chrome.once('exit', r));
  rmSync(profile, { recursive: true, force: true });

  const all = [...reqs.values()].filter((r) => r.type);
  const fonts = all.filter((r) => r.type === 'Font' && r.end);
  const ms = (t) => Math.round((t - docStart) * 1000);
  const origins = {};
  for (const r of all) {
    const host = new URL(r.url).host;
    const t = r.timing;
    const span = (a, b) => (t && t[a] >= 0 && t[b] >= 0 ? Math.round(t[b] - t[a]) : 0);
    const o = (origins[host] ??= { firstStart: ms(r.start), dns: 0, connect: 0, tls: 0, requests: 0 });
    o.requests++;
    o.dns = Math.max(o.dns, span('dnsStart', 'dnsEnd'));
    o.connect = Math.max(o.connect, span('connectStart', 'connectEnd'));
    o.tls = Math.max(o.tls, span('sslStart', 'sslEnd'));
  }
  const last = fonts.reduce((a, b) => (!a || b.end > a.end ? b : a), null);
  const lt = last?.timing;
  const paint = JSON.parse(value);
  return {
    fonts: fonts.map(({ url, bytes, contentType, cacheStatus }) => ({ file: url.split('/').pop().slice(0, 40), host: new URL(url).host, bytes, contentType, cacheStatus })),
    fontBytes: fonts.reduce((s, f) => s + f.bytes, 0),
    cssBytes: all.filter((r) => r.type === 'Stylesheet').reduce((s, r) => s + (r.bytes ?? 0), 0),
    fontsDone: fonts.length ? Math.max(...fonts.map((f) => ms(f.end))) : 0,
    fontPhases: lt && {
      requested: ms(last.start),
      queued: Math.round(lt.sendStart),
      waiting: Math.round(lt.receiveHeadersEnd - lt.sendStart),
      downloading: Math.round((last.end - lt.requestTime) * 1000 - lt.receiveHeadersEnd),
    },
    origins,
    // Responses from our own host that the edge could not serve from its cache.
    edgeMissAll: all.filter((r) => /fwd=(miss|stale)/.test(r.cacheStatus)).map((r) => r.type).reduce((a, k) => (a[k] = (a[k] ?? 0) + 1, a), {}),
    fcp: paint.fcp && Math.round(paint.fcp), lcp: Math.round(paint.lcp),
    cls: +paint.cls.toFixed(4), shifts: paint.shifts, faces: paint.faces,
    unusedPreloads: warnings.map((w) => w.match(/\/([^/ ]+\.woff2)/)?.[1] ?? w.slice(0, 80)),
  };
}

const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};

const report = {};
for (const page of pages) {
  const url = `${BASE}/${page}`;
  for (let i = 0; i < Number(process.env.WARM ?? 3); i++) await measureOnce(url);
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await measureOnce(url));
  report[page] = {
    runs: RUNS,
    fontFiles: median(runs.map((r) => r.fonts.length)),
    fontBytes: median(runs.map((r) => r.fontBytes)),
    cssBytes: median(runs.map((r) => r.cssBytes)),
    fontsDone: median(runs.map((r) => r.fontsDone)),
    fontsDoneRuns: runs.map((r) => r.fontsDone),
    fcp: median(runs.map((r) => r.fcp)),
    fcpRuns: runs.map((r) => r.fcp),
    lcp: median(runs.map((r) => r.lcp)),
    cls: median(runs.map((r) => r.cls)),
    clsRuns: runs.map((r) => r.cls),
    lastFonts: runs.at(-1).fonts.map((f) => `${f.host} ${f.file} ${f.bytes}`).sort(),
    runsDetail: runs.map(({ fonts, ...r }) => ({ ...r, fontHosts: [...new Set(fonts.map((f) => f.host))], fontTypes: [...new Set(fonts.map((f) => f.contentType))], edgeMiss: fonts.filter((f) => /fwd=(miss|stale)/.test(f.cacheStatus)).length })),
  };
  const r = report[page];
  console.log(page, r.fontFiles, 'files', r.fontBytes, 'B css', r.cssBytes, 'done', r.fontsDone, `[${r.fontsDoneRuns}]`,
    'fcp', r.fcp, 'lcp', r.lcp, 'cls', r.cls, `[${r.clsRuns}]`, 'unused', runs.at(-1).unusedPreloads.length);
}
const out = join(ROOT, 'results', `${new Date().toISOString().slice(0, 10)}-round2-${THROTTLE_NAME}.json`);
writeFileSync(out, JSON.stringify({ chrome: CHROME, base: BASE, throttle: THROTTLE, measuredAt: new Date().toISOString(), report }, null, 2));
console.log('wrote', relative(process.cwd(), out));

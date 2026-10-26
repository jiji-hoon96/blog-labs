// Does a Google font cached on one site get reused on another?
//
//   node scripts/serve.mjs 4173 &   # the second site
//   node scripts/cache-partition.mjs
//
// One Chrome profile, cache on, no throttling. The same full-d-live page, which
// links fonts.googleapis.com live, is opened four times in a row:
//   1. on the deployed site            first visit
//   2. on the deployed site again      same site
//   3. on localhost                    another site, same font URLs
//   4. on localhost again              same site
// and the whole sequence runs twice: with Chrome's default cache, and with
// --disable-features=SplitCacheByNetworkIsolationKey, which turns partitioning off.
// For every visit it counts the Google responses (CSS and fonts) and how many came
// from the browser cache instead of the network.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VISITS = [
  ['deployed', 'https://hooninedev-web-fonts.netlify.app/full-d-live/'],
  ['deployed again', 'https://hooninedev-web-fonts.netlify.app/full-d-live/'],
  ['localhost', 'http://localhost:4173/full-d-live/'],
  ['localhost again', 'http://localhost:4173/full-d-live/'],
];

async function launch(extra) {
  const profile = mkdtempSync(join(tmpdir(), 'fonts-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', ...extra, 'about:blank',
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

async function visit(cdp, url) {
  // A new tab per visit, so nothing is shared through the page's memory cache.
  const { result: { targetId } } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const reqs = new Map();
  let loaded;
  const done = new Promise((ok) => (loaded = ok));
  cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    const p = m.params;
    if (m.method === 'Network.responseReceived' && /fonts\.(googleapis|gstatic)\.com/.test(p.response.url)) {
      reqs.set(p.requestId, { host: new URL(p.response.url).host, cached: p.response.fromDiskCache || p.response.fromMemoryCache || false });
    }
    if (m.method === 'Network.requestServedFromCache' && reqs.has(p.requestId)) reqs.get(p.requestId).cached = true;
    if (m.method === 'Network.loadingFinished' && reqs.has(p.requestId)) reqs.get(p.requestId).bytes = p.encodedDataLength;
    if (m.method === 'Page.loadEventFired') loaded();
  });
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Page.navigate', { url }, sessionId);
  await done;
  await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => 1)', awaitPromise: true }, sessionId);
  await new Promise((r) => setTimeout(r, 1000));
  await cdp.send('Target.closeTarget', { targetId });
  const all = [...reqs.values()];
  const by = (host) => all.filter((r) => r.host === host);
  const sum = (rs) => ({ responses: rs.length, fromCache: rs.filter((r) => r.cached).length, networkBytes: rs.filter((r) => !r.cached).reduce((s, r) => s + (r.bytes ?? 0), 0) });
  return { css: sum(by('fonts.googleapis.com')), fonts: sum(by('fonts.gstatic.com')) };
}

const report = {};
for (const [mode, extra] of [['default', []], ['partitioning off', ['--disable-features=SplitCacheByNetworkIsolationKey']]]) {
  const { chrome, profile, wsUrl } = await launch(extra);
  const cdp = await connect(wsUrl);
  const { result: { product } } = await cdp.send('Browser.getVersion');
  report[mode] = { chrome: product, visits: {} };
  for (const [name, url] of VISITS) {
    report[mode].visits[name] = await visit(cdp, url);
    const v = report[mode].visits[name];
    console.log(mode, '|', name, '| css', `${v.css.fromCache}/${v.css.responses} cached`, '| fonts', `${v.fonts.fromCache}/${v.fonts.responses} cached`, v.fonts.networkBytes, 'B over the network');
  }
  cdp.ws.close();
  chrome.kill();
  await new Promise((r) => chrome.once('exit', r));
  rmSync(profile, { recursive: true, force: true });
}
const out = join(ROOT, 'results', `${new Date().toISOString().slice(0, 10)}-cache-partition.json`);
writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), report }, null, 2));
console.log('wrote', relative(process.cwd(), out));

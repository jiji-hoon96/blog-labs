// Same page, several fresh runs under Fast 4G, each with a DevTools Network screenshot
// and the cache-status of every request, so a run where every font came from the CDN
// cache can be put next to one where a font went to the origin.
//   RUNS=8 node shot-cache.mjs <url> <outDir>
// Writes <outDir>/run-N.png and <outDir>/runs.json.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, outDir] = process.argv.slice(2);
const RUNS = Number(process.env.RUNS ?? 8);
const PORT = 9335;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FAST4G = { latency: 165, downloadKbps: 8100, uploadKbps: 1350 };
const here = new URL('.', import.meta.url).pathname;
const PRE = `(() => {
  const s = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  s('panel-selected-tab', 'network');
  s('cache-disabled', true);
  s('screencast-enabled', false);
  s('disable-locale-info-bar', true);
  s('network-log-show-overview', false);
  s('network-log-columns', {name:{visible:true},status:{visible:false},protocol:{visible:false},type:{visible:false},initiator:{visible:false},size:{visible:true},time:{visible:true},'response-header-cache-status':{visible:true,title:'Cache-Status'},waterfall:{visible:true}});
  location.reload();
  return 'set';
})()`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });

async function run(n) {
  const profile = mkdtempSync(join(tmpdir(), 'cacheshot-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--window-size=1600,1000', '--force-device-scale-factor=2', '--lang=en-US', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
  const browserWs = await new Promise((ok) => chrome.stderr.on('data', (d) => {
    const m = String(d).match(/ws:\/\/\S+/); if (m) ok(m[0]);
  }));
  const ws = new WebSocket(browserWs);
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else listeners.forEach((f) => f(m));
  };
  const send = (method, params = {}, sessionId) => new Promise((ok) => { pending.set(++id, ok); ws.send(JSON.stringify({ id, method, params, sessionId })); });
  await new Promise((ok) => (ws.onopen = ok));

  const { result: { targetId: pageId } } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
  const front = `http://127.0.0.1:${PORT}/devtools/inspector.html?ws=127.0.0.1:${PORT}/devtools/page/${pageId}`;
  const { result: { targetId: dtId } } = await send('Target.createTarget', { url: front, newWindow: true });
  const { result: { sessionId: dt } } = await send('Target.attachToTarget', { targetId: dtId, flatten: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: Number(process.env.H ?? 1000), deviceScaleFactor: 2, mobile: false }, dt);
  await sleep(3000);
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, dt)).result?.result?.value;
  await ev(PRE);
  await sleep(4000);

  const { result: { sessionId: pg } } = await send('Target.attachToTarget', { targetId: pageId, flatten: true });
  const reqs = new Map(); let docStart;
  listeners.push((m) => {
    if (m.sessionId !== pg) return; const p = m.params;
    if (m.method === 'Network.requestWillBeSent') { if (docStart === undefined && p.type === 'Document') docStart = p.timestamp; reqs.set(p.requestId, { url: p.request.url, start: p.timestamp }); }
    if (m.method === 'Network.responseReceived' && reqs.has(p.requestId)) {
      const h = Object.fromEntries(Object.entries(p.response.headers).map(([k, v]) => [k.toLowerCase(), v]));
      Object.assign(reqs.get(p.requestId), { type: p.type, cacheStatus: h['cache-status'] ?? '', ttfb: p.response.timing && (p.response.timing.receiveHeadersStart ?? p.response.timing.receiveHeadersEnd) - p.response.timing.sendEnd });
    }
    if (m.method === 'Network.loadingFinished' && reqs.has(p.requestId)) Object.assign(reqs.get(p.requestId), { end: p.timestamp, bytes: p.encodedDataLength });
  });
  await send('Network.enable', {}, pg);
  await send('Network.setCacheDisabled', { cacheDisabled: true }, pg);
  await send('Network.emulateNetworkConditions', { offline: false, latency: FAST4G.latency,
    downloadThroughput: (FAST4G.downloadKbps * 1000) / 8, uploadThroughput: (FAST4G.uploadKbps * 1000) / 8 }, pg);
  await send('Page.navigate', { url }, pg);
  await sleep(Number(process.env.WAIT ?? 9000));
  console.log('filter:', await ev(readFileSync(join(here, 'post.js'), 'utf8')));
  console.log('widen:', await ev(readFileSync(join(here, 'widen.js'), 'utf8')));
  await sleep(1500);
  await sleep(1500);
  const { result: { data } } = await send('Page.captureScreenshot', { format: 'png' }, dt);
  writeFileSync(join(outDir, `run-${n}.png`), Buffer.from(data, 'base64'));
  ws.close(); chrome.kill(); await new Promise((r) => chrome.once('exit', r));
  rmSync(profile, { recursive: true, force: true });

  const all = [...reqs.values()].filter((r) => r.end);
  const fonts = all.filter((r) => r.type === 'Font');
  const last = fonts.reduce((a, b) => (b.end > (a?.end ?? 0) ? b : a), null);
  const miss = (r) => /fwd=(miss|stale)/.test(r.cacheStatus);
  return {
    run: n,
    fontsDoneMs: last && Math.round((last.end - docStart) * 1000),
    lastFont: last && { name: last.url.split('/').pop(), cacheStatus: last.cacheStatus, ttfbMs: Math.round(last.ttfb) },
    fontMisses: fonts.filter(miss).map((r) => ({ name: r.url.split('/').pop(), ttfbMs: Math.round(r.ttfb), cacheStatus: r.cacheStatus })),
    otherMisses: all.filter((r) => r.type !== 'Font' && miss(r)).map((r) => r.type),
    fonts: fonts.length,
  };
}

const results = [];
for (let n = 1; n <= RUNS; n++) {
  const r = await run(n); results.push(r);
  console.log(JSON.stringify({ run: r.run, fontsDoneMs: r.fontsDoneMs, fonts: r.fonts, fontMisses: r.fontMisses.length, otherMisses: r.otherMisses, last: r.lastFont }));
}
writeFileSync(join(outDir, 'runs.json'), JSON.stringify({ url, measuredAt: new Date().toISOString(), throttle: FAST4G, results }, null, 1));

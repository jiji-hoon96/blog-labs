// Which installed or web font actually painted a Korean paragraph, and which
// connection each Google response came over.
//
//   node scripts/rendered-fonts.mjs [base]
//
// For each page: a fresh profile, Fast 4G, then CSS.getPlatformFontsForNode on
// the first Korean <p> twice. Once 300 ms after the first paint (before any font
// has arrived) and once after document.fonts.ready. For the live Google pages it
// also lists the connectionId of every fonts.googleapis.com and fonts.gstatic.com
// response, so a shared connection shows up as one id.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const BASE = (process.argv[2] ?? 'https://hooninedev-web-fonts.netlify.app').replace(/\/$/, '');
const PAGES = ['full-d-google/', 'full-d-google/optional.html', 'full-d-live/', 'full-d-live-preconnect/', 'next-font/'];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'fonts-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((ok, fail) => {
    chrome.stderr.on('data', (d) => { const m = String(d).match(/ws:\/\/\S+/); if (m) ok(m[0]); });
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
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else listeners.forEach((fn) => fn(msg));
  };
  const send = (method, params = {}, sessionId) => new Promise((ok) => { pending.set(++id, ok); ws.send(JSON.stringify({ id, method, params, sessionId })); });
  return new Promise((ok) => (ws.onopen = () => ok({ ws, send, on: (fn) => listeners.push(fn) })));
}

async function platformFonts(cdp, sessionId) {
  const { result: { root } } = await cdp.send('DOM.getDocument', { depth: -1 }, sessionId);
  // The second <p> is the 400 body text; the first is the 300 lead paragraph.
  const { result: { nodeIds } } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'main p' }, sessionId);
  const { result } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: nodeIds[1] }, sessionId);
  return result.fonts.map((f) => `${f.familyName}${f.isCustomFont ? ' (web)' : ''} ${f.glyphCount}`);
}

const report = {};
for (const page of PAGES) {
  const { chrome, profile, wsUrl } = await launch();
  const cdp = await connect(wsUrl);
  const { result: { targetId } } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const conns = [];
  let painted;
  const firstPaint = new Promise((ok) => (painted = ok));
  cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Network.responseReceived' && /fonts\.(googleapis|gstatic)\.com/.test(m.params.response.url)) {
      conns.push(`${new URL(m.params.response.url).host} ${m.params.response.connectionId} ${m.params.response.protocol}`);
    }
    if (m.method === 'Page.lifecycleEvent' && m.params.name === 'firstContentfulPaint') painted();
  });
  for (const d of ['Network', 'Page', 'DOM', 'CSS']) await cdp.send(`${d}.enable`, {}, sessionId);
  await cdp.send('Page.setLifecycleEventsEnabled', { enabled: true }, sessionId);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 165, downloadThroughput: 8100 * 125, uploadThroughput: 1350 * 125 }, sessionId);
  await cdp.send('Page.navigate', { url: `${BASE}/${page}` }, sessionId);
  await firstPaint;
  await new Promise((r) => setTimeout(r, 300));
  const before = await platformFonts(cdp, sessionId);
  await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 1000)))', awaitPromise: true }, sessionId);
  const after = await platformFonts(cdp, sessionId);
  report[page] = { before, after, connections: [...new Set(conns)] };
  console.log(page, '\n  before', before.join(', '), '\n  after ', after.join(', '), conns.length ? `\n  conns  ${[...new Set(conns.map((c) => c.split(' ').slice(0, 2).join(' ')))].join(' | ')}` : '');
  cdp.ws.close();
  chrome.kill();
  await new Promise((r) => chrome.once('exit', r));
  rmSync(profile, { recursive: true, force: true });
}
const out = join(ROOT, 'results', `${new Date().toISOString().slice(0, 10)}-rendered-fonts.json`);
writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), base: BASE, report }, null, 2));
console.log('wrote', relative(process.cwd(), out));

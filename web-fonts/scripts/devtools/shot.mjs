// Headless Chrome: open the DevTools frontend as a page inspecting another page,
// so the Network panel can be screenshotted without touching the real screen.
//   node shot.mjs <url> <out.png> [evalInDevtools.js]
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out, extra] = process.argv.slice(2);
const PORT = 9333;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(tmpdir(), 'devshot-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--window-size=1600,1000', '--force-device-scale-factor=2', '--lang=en-US', 'about:blank'],
{ stdio: ['ignore', 'ignore', 'pipe'] });
const browserWs = await new Promise((ok) => chrome.stderr.on('data', (d) => {
  const m = String(d).match(/ws:\/\/\S+/); if (m) ok(m[0]);
}));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ({ data }) => { const m = JSON.parse(data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}, sessionId) => new Promise((ok) => { pending.set(++id, ok); ws.send(JSON.stringify({ id, method, params, sessionId })); });
  return new Promise((ok) => (ws.onopen = () => ok({ ws, send })));
}

const cdp = await connect(browserWs);
const { result: { targetId: pageId } } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const front = `http://127.0.0.1:${PORT}/devtools/inspector.html?ws=127.0.0.1:${PORT}/devtools/page/${pageId}`;
const { result: { targetId: dtId } } = await cdp.send('Target.createTarget', { url: front });
const { result: { sessionId: dt } } = await cdp.send('Target.attachToTarget', { targetId: dtId, flatten: true });
await cdp.send('Emulation.setDeviceMetricsOverride', { width: Number(process.env.W ?? 1600), height: Number(process.env.H ?? 900), deviceScaleFactor: 2, mobile: false }, dt);
await sleep(3000);
const ev = async (expression) => (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, dt)).result?.result?.value;
if (extra) { console.log('pre:', await ev(readFileSync(extra, 'utf8'))); await sleep(3500); }
await sleep(1500);
const { result: { sessionId: pg } } = await cdp.send('Target.attachToTarget', { targetId: pageId, flatten: true });
await cdp.send('Page.navigate', { url }, pg);
await sleep(Number(process.env.WAIT ?? 8000));
if (process.env.POST) { const v = await ev(readFileSync(process.env.POST, 'utf8')); if (process.env.RECTS) writeFileSync(process.env.RECTS, v); else console.log('post:', v); }
await sleep(1000);
const { result: { data } } = await cdp.send('Page.captureScreenshot', { format: 'png' }, dt);
writeFileSync(out, Buffer.from(data, 'base64'));
cdp.ws.close(); chrome.kill(); await new Promise((r) => chrome.once('exit', r));
rmSync(profile, { recursive: true, force: true });
console.log('wrote', out);

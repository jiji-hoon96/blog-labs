// DevTools frontend (checkbox state from pre script) + our own CDP session on the page:
// bytes, duplicate URLs, initiator stacks, every <img> ever attached, CSS backgrounds, hidden banners.
//   DC=1|0 node probe.mjs <url> <out>
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
const [url, out] = process.argv.slice(2);
const DC = process.env.DC === '1';
const PORT = 9335, CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(tmpdir(), 'probe-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1600,1000', '--lang=en-US', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const bws = await new Promise((ok) => chrome.stderr.on('data', (d) => { const m = String(d).match(/ws:\/\/\S+/); if (m) ok(m[0]); }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(bws); let id = 0; const pend = new Map(); const reqs = new Map(); let pgSession;
ws.onmessage = ({ data }) => { const m = JSON.parse(data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.sessionId !== pgSession) return; const p = m.params; const r = p?.requestId && (reqs.get(p.requestId) || {});
  if (m.method === 'Network.requestWillBeSent') { Object.assign(r, { url: p.request.url, type: p.type, initiator: p.initiator }); reqs.set(p.requestId, r); }
  if (m.method === 'Network.responseReceived') { r.type = p.type; r.status = p.response.status; r.protocol = p.response.protocol; r.headers = p.response.headers; r.mime = p.response.mimeType; r.fromCache = p.response.fromDiskCache || p.response.fromMemoryCache; reqs.set(p.requestId, r); }
  if (m.method === 'Network.requestServedFromCache') { r.servedFromCache = true; reqs.set(p.requestId, r); }
  if (m.method === 'Network.loadingFinished') { r.bytes = p.encodedDataLength; reqs.set(p.requestId, r); } };
await new Promise((ok) => (ws.onopen = ok));
const send = (method, params = {}, sessionId) => new Promise((ok) => { pend.set(++id, ok); ws.send(JSON.stringify({ id, method, params, sessionId })); });
const { result: { targetId: pageId } } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
const front = `http://127.0.0.1:${PORT}/devtools/inspector.html?ws=127.0.0.1:${PORT}/devtools/page/${pageId}`;
const { result: { targetId: dtId } } = await send('Target.createTarget', { url: front });
const { result: { sessionId: dt } } = await send('Target.attachToTarget', { targetId: dtId, flatten: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 2, mobile: false }, dt);
await sleep(3000);
const evDt = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }, dt)).result?.result?.value;
await evDt(`(()=>{const s=(k,v)=>localStorage.setItem(k,JSON.stringify(v));s('panel-selected-tab','network');s('cache-disabled',${DC});s('screencast-enabled',false);s('disable-locale-info-bar',true);s('network-log-show-overview',false);s('network-log-large-rows',true);s('network-log-columns',{name:{visible:true},status:{visible:false},type:{visible:true},initiator:{visible:true},size:{visible:true},time:{visible:false},waterfall:{visible:false}});location.reload();})()`);
await sleep(5000);
const { result: { sessionId: pg } } = await send('Target.attachToTarget', { targetId: pageId, flatten: true }); pgSession = pg;
await send('Network.enable', {}, pg); await send('Page.enable', {}, pg); await send('Page.bringToFront', {}, pg); await send('Target.activateTarget', { targetId: pageId });
if (process.env.MOBILE === '1') { await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }, pg); await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, pg); await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }, pg); }
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__imgs=[];new PerformanceObserver(l=>{const e=l.getEntries().at(-1);window.__lcp={t:Math.round(e.startTime),url:e.url,size:e.size}}).observe({type:'largest-contentful-paint',buffered:true});new MutationObserver(ms=>{for(const m of ms){for(const n of m.addedNodes){if(n.nodeType!==1)continue;for(const i of [n,...n.querySelectorAll('img')])if(i.tagName==='IMG')__imgs.push({t:Math.round(performance.now()),op:'add',src:i.src})}for(const n of m.removedNodes){if(n.nodeType!==1)continue;for(const i of [n,...n.querySelectorAll('img')])if(i.tagName==='IMG')__imgs.push({t:Math.round(performance.now()),op:'remove',src:i.src})}if(m.type==='attributes'&&m.target.tagName==='IMG')__imgs.push({t:Math.round(performance.now()),op:'attr',src:m.target.src})}}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['src','srcset']});` }, pg);
await send('Page.navigate', { url }, pg);
await sleep(15000);
const pageInfo = (await send('Runtime.evaluate', { returnByValue: true, expression: `(()=>{
  const bg=[...document.querySelectorAll('*')].map(e=>getComputedStyle(e).backgroundImage).filter(b=>b&&b!=='none');
  const imgs=[...document.images].map(i=>{let a=i,hidden=null;while(a){const cs=getComputedStyle(a);if(cs.display==='none'){hidden=a.tagName+'.'+(a.className||'').toString().slice(0,60);break}a=a.parentElement}
    const r=i.getBoundingClientRect();return {src:i.currentSrc||i.src,srcset:i.srcset||null,picture:i.parentElement?.tagName==='PICTURE',loading:i.loading,nw:i.naturalWidth,nh:i.naturalHeight,w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top+scrollY),hiddenBy:hidden}});
  return {rt:performance.getEntriesByType('resource').filter(e=>e.initiatorType==='img'||/\.(png|svg|jpe?g|webp)/.test(e.name)).map(e=>({n:e.name,i:e.initiatorType,ts:e.transferSize,eb:e.encodedBodySize,db:e.decodedBodySize,dur:Math.round(e.duration)})),lcp:window.__lcp||null,vis:document.visibilityState,bg,imgs,mut:window.__imgs||[]};})()` }, pg)).result.result.value;
await send('Page.enable', {}, dt); await send('Page.bringToFront', {}, dt); await sleep(1500);
if (process.env.POST) console.log('post:', await evDt(readFileSync(process.env.POST, 'utf8')));
await sleep(1000);
const footer = await evDt(`(()=>{const all=[];const walk=n=>{for(const el of n.querySelectorAll('*')){all.push(el);if(el.shadowRoot)walk(el.shadowRoot)}};walk(document);const t=all.map(e=>e.textContent).filter(s=>/transferred/.test(s)&&s.length<200);return t.sort((a,b)=>a.length-b.length).slice(0,3)})()`);
const { result: { data } } = await send('Page.captureScreenshot', { format: 'png' }, dt);
writeFileSync(out + '.png', Buffer.from(data, 'base64'));
const list = [...reqs.values()].filter((r) => r.url && !r.url.startsWith('data:'));
writeFileSync(out + '.json', JSON.stringify({ url, at: new Date().toISOString(), disableCache: DC, footer, reqs: list, page: pageInfo }, null, 1));
const fin = list.filter((r) => r.bytes != null); const sum = fin.reduce((x, r) => x + r.bytes, 0);
const cnt = {}; for (const r of fin) cnt[r.url] = (cnt[r.url] || 0) + 1;
console.log(out, 'DC', DC, 'finished', fin.length, (sum / 1e6).toFixed(2) + 'MB', 'dupURLs', Object.values(cnt).filter((v) => v > 1).length, 'footer', JSON.stringify(footer));
ws.close(); chrome.kill(); await new Promise((r) => chrome.once('exit', r)); rmSync(profile, { recursive: true, force: true });

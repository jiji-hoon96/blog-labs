// node annotate.mjs <in.png> <spec.json> <out.png>
// spec: { width?, height, cut: [from, to] | null, marks: [{n, x, y, w, h, lx?, ly?}] }
// Coordinates are CSS px of the 1600px-wide screenshot (taken at DSF 2), before the cut.
// The cut removes the empty band between the last row and the bottom bar.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [img, specPath, out] = process.argv.slice(2).map((p) => resolve(p));
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const rough = readFileSync(new URL('./rough.js', import.meta.url), 'utf8');
const b64 = readFileSync(img).toString('base64');
const [cf, ct] = spec.cut ?? [spec.height, spec.height];
const H = spec.height - (ct - cf);
const W = spec.width ?? 1600;
const shift = (y) => (y >= ct ? y - (ct - cf) : y);
const marks = spec.marks.map((m) => ({ ...m, y: shift(m.y), ly: m.ly === undefined ? undefined : shift(m.ly) }));
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#fff}#w{position:relative;width:${W}px;height:${H}px;overflow:hidden}
.s{position:absolute;left:0;width:${W}px;background:url(data:image/png;base64,${b64}) no-repeat;background-size:${W}px ${spec.height}px}
svg{position:absolute;inset:0}</style></head><body><div id="w">
<div class="s" style="top:0;height:${cf}px;background-position:0 0"></div>
<div class="s" style="top:${cf}px;height:${spec.height - ct}px;background-position:0 -${ct}px;border-top:1px dashed #bbb"></div>
<svg id="s" width="${W}" height="${H}"></svg></div>
<script>${rough}</script><script>
const marks=${JSON.stringify(marks)};
const svg=document.getElementById('s'), rc=rough.svg(svg), red='#d63a2f';
for (const [i,m] of marks.entries()) {
  svg.appendChild(rc.rectangle(m.x,m.y,m.w,m.h,{stroke:red,strokeWidth:2.6,roughness:1.2,seed:7+i}));
  const cx=m.lx ?? (m.x+m.w+16), cy=m.ly ?? (m.y+Math.min(m.h,40)/2);
  svg.appendChild(rc.circle(cx,cy,28,{stroke:red,fill:red,fillStyle:'solid',roughness:0.8,seed:30+i}));
  const t=document.createElementNS('http://www.w3.org/2000/svg','text');
  t.setAttribute('x',cx);t.setAttribute('y',cy+6);t.setAttribute('text-anchor','middle');
  t.setAttribute('font-family','Helvetica, Arial, sans-serif');t.setAttribute('font-size','17');t.setAttribute('font-weight','700');t.setAttribute('fill','#fff');
  t.textContent=m.n;svg.appendChild(t);
}
</script></body></html>`;
const tmp = out.replace(/\.png$/, '.html');
writeFileSync(tmp, html);
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=2', '--virtual-time-budget=3000', `--window-size=${W},${H}`, `--screenshot=${out}`, `file://${tmp}`], { stdio: 'ignore' });
console.log('wrote', out, W + 'x' + H);

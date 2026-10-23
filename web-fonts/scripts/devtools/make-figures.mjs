// Shoots and annotates figures 3 to 7 of hooninedev.com/261019.
// Mark positions come from the DevTools DOM (post-rects.js), so a reshoot
// does not need hand-measured coordinates.
//
//   node make-figures.mjs <out-dir>
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const HERE = import.meta.dirname;
const OUT = resolve(process.argv[2] ?? join(HERE, 'out'));
mkdirSync(OUT, { recursive: true });
const BASE = 'https://hooninedev-web-fonts.netlify.app';
const W = 860;

function shoot(name, path, { filter = 'Font', sort = false, height = 900, wait = 9000 } = {}) {
  const post = join(OUT, `${name}.post.js`);
  writeFileSync(post, readFileSync(join(HERE, 'post-rects.js'), 'utf8')
    .replace('__FILTER__', filter).replace('__SORT__', String(sort)));
  const rects = join(OUT, `${name}.rects.json`);
  execFileSync('node', [join(HERE, 'shot.mjs'), `${BASE}/${path}/`, join(OUT, `${name}.png`), join(HERE, 'pre.js')], {
    env: { ...process.env, W: String(W), H: String(height), POST: post, RECTS: rects, WAIT: String(wait) }, stdio: 'inherit',
  });
  return { png: join(OUT, `${name}.png`), r: JSON.parse(readFileSync(rects, 'utf8')), height };
}

// marks: { n, kind: 'filter' | 'disable' | 'rows' | 'foot', match?, col?, foot?, side? }
function annotate({ png, r, height }, marks, out) {
  const rows = r.rows;
  const last = rows.at(-1).rect;
  const footTop = Math.min(...r.foot.map((f) => f.rect.y));
  const cut = [last.y + last.h + 8, footTop - 4];
  const col = (name) => r.heads[name];
  const spec = { width: W, height, cut, marks: [] };
  for (const m of marks) {
    let box;
    if (m.kind === 'filter') box = r.filterBtn;
    if (m.kind === 'disable') box = { x: r.disable.x - 24, y: r.disable.y - 4, w: r.disable.w + 30, h: r.disable.h + 8 };
    if (m.kind === 'foot') {
      const f = r.foot.find((x) => x.text.endsWith(m.foot)).rect;
      box = { x: f.x - 3, y: f.y + 2, w: f.w + 6, h: f.h - 4 };
    }
    if (m.kind === 'rows') {
      const hit = rows.filter((x) => new RegExp(m.match ?? '').test(x.name)).map((x) => x.rect);
      const c = col(m.col);
      const top = Math.min(...hit.map((h) => h.y)), bottom = Math.max(...hit.map((h) => h.y + h.h));
      // Name: only as wide as the file names. Size: the right-aligned values. Others: the left-aligned values.
      const x = m.col === 'Size' ? c.x + c.w - (m.valueWidth ?? 78) : c.x + 2;
      const w = m.col === 'Name' ? Math.min(c.w, m.nameWidth ?? 150) : (m.valueWidth ?? (m.col === 'Size' ? 76 : 40));
      box = { x, y: top + 1, w, h: bottom - top - 2 };
    }
    const mark = { n: m.n, ...box };
    if (m.kind === 'foot') Object.assign(mark, { lx: box.x + box.w / 2, ly: cut[0] - 14 });
    else if (m.side === 'left') Object.assign(mark, { lx: box.x - 16, ly: box.y + 12 });
    else if (m.side === 'inside') Object.assign(mark, { lx: box.x + box.w - 20, ly: box.y + 12 });
    else if (m.side === 'above') Object.assign(mark, { lx: box.x + box.w / 2, ly: box.y - 12 });
    else Object.assign(mark, { lx: box.x + box.w + 16, ly: box.y + 12 });
    spec.marks.push(mark);
  }
  const specPath = out.replace(/\.png$/, '.spec.json');
  writeFileSync(specPath, JSON.stringify(spec, null, 1));
  execFileSync('node', [join(HERE, 'annotate.mjs'), png, specPath, out], { stdio: 'inherit' });
}

const a = shoot('a', 'full-a-ttf', { wait: 15000 });
annotate(a, [
  { n: 1, kind: 'filter', side: 'above' }, { n: 2, kind: 'disable', side: 'right' },
  { n: 3, kind: 'rows', col: 'Name', nameWidth: 150 }, { n: 4, kind: 'rows', col: 'Size', side: 'left' },
  { n: 5, kind: 'rows', col: 'Content-Encoding' },
  { n: 6, kind: 'foot', foot: 'transferred' }, { n: 7, kind: 'foot', foot: 'resources' },
], join(OUT, '3.png'));

const b = shoot('b', 'full-b-woff2');
annotate(b, [
  { n: 1, kind: 'rows', col: 'Name', nameWidth: 170 }, { n: 2, kind: 'rows', col: 'Size', side: 'left' },
  { n: 3, kind: 'rows', col: 'Content-Encoding' },
  { n: 4, kind: 'foot', foot: 'transferred' }, { n: 5, kind: 'foot', foot: 'resources' },
], join(OUT, '4.png'));

const c = shoot('c', 'full-c-subset', { sort: true, height: 1440 });
annotate(c, [
  { n: 1, kind: 'rows', col: 'Name', match: '^inter', nameWidth: 192 },
  { n: 2, kind: 'rows', col: 'Name', match: '^nskr-normal-300', nameWidth: 192 },
  { n: 3, kind: 'rows', col: 'Name', match: '^nskr-normal-400', nameWidth: 192 },
  { n: 4, kind: 'rows', col: 'Name', match: '^nskr-normal-500', nameWidth: 192 },
  { n: 5, kind: 'rows', col: 'Name', match: '^nskr-normal-700', nameWidth: 192 },
  { n: 6, kind: 'rows', col: 'Name', match: '^serif', nameWidth: 192 },
  { n: 7, kind: 'foot', foot: 'transferred' },
], join(OUT, '5.png'));

const d = shoot('d', 'full-d-google', { sort: true });
annotate(d, [
  { n: 1, kind: 'rows', col: 'Name', match: '^inter', nameWidth: 160 },
  { n: 2, kind: 'rows', col: 'Name', match: '^nskr', nameWidth: 110 },
  { n: 3, kind: 'rows', col: 'Name', match: '^serif', nameWidth: 110 },
  { n: 4, kind: 'foot', foot: 'transferred' },
], join(OUT, '6.png'));

const cd = shoot('css-d', 'full-d-google', { filter: 'CSS', wait: 7000 });
annotate(cd, [{ n: 1, kind: 'rows', col: 'Size', side: 'left' }, { n: 2, kind: 'foot', foot: 'resources' }], join(OUT, '7a.png'));
const cr = shoot('css-r', 'full-d-range', { filter: 'CSS', wait: 7000 });
annotate(cr, [{ n: 3, kind: 'rows', col: 'Size', side: 'left' }, { n: 4, kind: 'foot', foot: 'resources' }], join(OUT, '7b.png'));
writeFileSync(join(OUT, '7.html'), `<!doctype html><style>body{margin:0;background:#fff}img{display:block;width:${W}px}.g{height:20px}</style><img src="7a.png"><div class="g"></div><img src="7b.png">`);
const h = (p) => Number(execFileSync('sips', ['-g', 'pixelHeight', p]).toString().match(/(\d+)\s*$/)[1]) / 2;
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=2', '--virtual-time-budget=2000', `--window-size=${W},${h(join(OUT, '7a.png')) + h(join(OUT, '7b.png')) + 20}`,
  `--screenshot=${join(OUT, '7.png')}`, `file://${join(OUT, '7.html')}`], { stdio: 'ignore' });
console.log('done', OUT);

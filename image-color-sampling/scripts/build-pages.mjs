// 세 변형의 index.html 을 만든다. 카드 24장의 마크업은 같고 data-mode 만 다르다.   node scripts/build-pages.mjs
import { writeFileSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const cards = Array.from({ length: 24 }, (_, i) => `card-${String(i).padStart(2, '0')}`)
  .map((n) => `  <a class="card" data-name="${n}"><img loading="lazy" width="302" height="170" alt="" src="http://127.0.0.1:4201/${n}.png"><span>${n}</span></a>`).join('\n');
for (const [dir, mode] of [['a-full-sample', 'full'], ['b-thumb-sample', 'thumb'], ['c-precomputed', 'precomputed']]) {
  writeFileSync(`${root}${dir}/index.html`, `<!doctype html>
<html lang="ko">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${dir}</title>
<link rel="stylesheet" href="../shared/style.css">
<body data-mode="${mode}">
<div class="hero">${dir}</div>
<div class="grid">
${cards}
</div>
<script src="../shared/page.js"></script>
</body>
</html>
`);
}
console.log('built');

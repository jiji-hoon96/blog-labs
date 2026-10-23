// Writes index.html (short) and long.html into every variant folder.
// The body is identical across variants. Only the fonts.css next to it differs.
// The -4w folders get the same pages styled with four weights:
// first paragraph 300, body 400, h2 500, h1 and strong 700.
// They also get two control pages:
//   *-3w.html   three weights. Body stays 400, h2 500, h1 and strong 700.
//   *-note.html four weights, but 300 draws only a one-line note, not a paragraph.
//
//   node scripts/build-pages.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const BASE = ['a-pinned-ttf', 'b-full-woff2', 'c-subset-woff2', 'd-google-variable'];
const VARIANTS = [...BASE, ...BASE.map((v) => `${v}-4w`)];
const FOUR_WEIGHTS = ' main > p:first-of-type { font-weight: 300; } h2 { font-weight: 500; } h1, strong { font-weight: 700; }';
const THREE_WEIGHTS = ' h2 { font-weight: 500; } h1, strong { font-weight: 700; }';
const NOTE_WEIGHTS = ' .note { font-weight: 300; } h2 { font-weight: 500; } h1, strong { font-weight: 700; }';
const NOTE = '    <p class="note">보조 문구는 300 굵기로 그린다.</p>';

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Markdown post -> plain paragraphs. Code blocks, images, links and directives
// are dropped or flattened. The point is realistic Korean prose, not fidelity.
function markdownToHtml(md) {
  const body = md.replace(/^---[\s\S]*?\n---\n/, '').replace(/```[\s\S]*?```/g, '');
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((b) => b && !b.startsWith(':::') && !b.startsWith('![') && !b.startsWith('|') && !b.startsWith('>'))
    .map((b) => {
      const text = b
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/:term\[([^\]]+)\]\{[^}]*\}/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\n/g, ' ');
      const h = text.match(/^(#{2,4})\s+(.*)$/);
      if (h) return `    <h2>${escape(h[2])}</h2>`;
      const bold = escape(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      return `    <p>${bold.replace(/^- /, '')}</p>`;
    })
    .join('\n');
}

const long = markdownToHtml(readFileSync(join(ROOT, 'pages/long.md'), 'utf8'));
const short2 = readFileSync(join(ROOT, 'pages/short.html'), 'utf8').trimEnd();
const short4 = readFileSync(join(ROOT, 'pages/short-4w.html'), 'utf8').trimEnd();

// [file, body, extra CSS] per folder.
const pagesFor = (fourWeights) => fourWeights
  ? [
      ['index.html', short4, FOUR_WEIGHTS],
      ['long.html', long, FOUR_WEIGHTS],
      ['index-3w.html', short4, THREE_WEIGHTS],
      ['long-3w.html', long, THREE_WEIGHTS],
      ['index-note.html', `${short4}\n${NOTE}`, NOTE_WEIGHTS],
      ['long-note.html', `${NOTE}\n${long}`, NOTE_WEIGHTS],
    ]
  : [['index.html', short2, ''], ['long.html', long, '']];

let written = 0;
for (const v of VARIANTS) {
  for (const [file, body, css] of pagesFor(v.endsWith('-4w'))) {
    written++;
    writeFileSync(join(ROOT, v, file), `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${v}</title>
  <link rel="stylesheet" href="fonts.css">
  <style>body { font-family: 'Noto Sans KR', sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.7; }${css}</style>
</head>
<body>
  <main>
${body}
  </main>
</body>
</html>
`);
  }
}
console.log('wrote', written, 'pages');

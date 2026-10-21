// Writes index.html (short) and long.html into every variant folder.
// The body is identical across variants. Only the fonts.css next to it differs.
//
//   node scripts/build-pages.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const VARIANTS = ['a-pinned-ttf', 'b-full-woff2', 'c-sliced-woff2'];

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

const pages = {
  'index.html': readFileSync(join(ROOT, 'pages/short.html'), 'utf8').trimEnd(),
  'long.html': markdownToHtml(readFileSync(join(ROOT, 'pages/long.md'), 'utf8')),
};

for (const v of VARIANTS) {
  for (const [file, body] of Object.entries(pages)) {
    writeFileSync(join(ROOT, v, file), `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${v}</title>
  <link rel="stylesheet" href="fonts.css">
  <style>body { font-family: 'Noto Sans KR', sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.7; }</style>
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
console.log('wrote', VARIANTS.length * Object.keys(pages).length, 'pages');

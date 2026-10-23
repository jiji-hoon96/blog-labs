// Writes index.html into every full-* folder: the long post with its code
// blocks, inline code and blockquotes kept, drawn with four families.
// The body is identical across folders. Only the fonts.css next to it differs.
//
//   node scripts/build-full-pages.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FOLDERS = ['full-a-ttf', 'full-b-woff2', 'full-c-subset', 'full-d-google', 'full-d-range'];
const STYLE = `
    body { font-family: 'Inter', 'Noto Sans KR', sans-serif; font-weight: 400; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.7; }
    main > p:first-of-type { font-weight: 300; }
    h1, h2 { font-family: 'Noto Serif KR', serif; font-weight: 700; }
    h3 { font-weight: 500; }
    strong { font-weight: 700; }
    blockquote { font-style: italic; margin: 1.5rem 0; padding-left: 1rem; border-left: 3px solid #ccc; }
    code, pre { font-family: 'JetBrains Mono', 'Noto Sans KR', monospace; font-size: 0.9em; }
    pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; line-height: 1.5; }`;

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const inline = (text) => escape(text)
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/:term\[([^\]]+)\]\{[^}]*\}/g, '$1')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

function markdownToHtml(md) {
  const [, front, body] = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const title = front.match(/^title: '(.*)'$/m)[1];
  const out = [`    <h1>${escape(title)}</h1>`];
  // Split on code fences first so blank lines inside code stay put.
  body.split(/(```[\s\S]*?```)/).forEach((chunk) => {
    if (chunk.startsWith('```')) {
      const code = chunk.replace(/^```[^\n]*\n/, '').replace(/```$/, '').trimEnd();
      out.push(`    <pre><code>${escape(code)}</code></pre>`);
      return;
    }
    chunk.split(/\n{2,}/).map((b) => b.trim())
      .filter((b) => b && !b.startsWith(':::') && !b.startsWith('![') && !b.startsWith('|'))
      .forEach((b) => {
        const text = b.replace(/\n/g, ' ');
        const h = text.match(/^(#{2,4})\s+(.*)$/);
        if (h) out.push(`    <h${h[1].length === 2 ? 2 : 3}>${inline(h[2])}</h${h[1].length === 2 ? 2 : 3}>`);
        else if (text.startsWith('>')) out.push(`    <blockquote>${inline(text.replace(/^>\s?/, '').replace(/ >\s?/g, ' '))}</blockquote>`);
        else out.push(`    <p>${inline(text.replace(/^- /, ''))}</p>`);
      });
  });
  return out.join('\n');
}

const body = markdownToHtml(readFileSync(join(ROOT, 'pages/long.md'), 'utf8'));
for (const f of FOLDERS) {
  writeFileSync(join(ROOT, f, 'index.html'), `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${f}</title>
  <link rel="stylesheet" href="fonts.css">
  <style>${STYLE}
  </style>
</head>
<body>
  <main>
${body}
  </main>
</body>
</html>
`);
}
console.log('wrote', FOLDERS.length, 'pages');

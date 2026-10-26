// Pages for the second round: what the full-* folders could not show.
//
//   full-d-live             the same Google request as D, linked live from fonts.googleapis.com
//   full-d-live-preconnect  the same, with the two preconnect links Google's embed snippet adds
//   full-d-google/optional.html  D's own files with font-display: optional instead of swap
//
// The body and the style are taken from full-d-google/index.html so every page draws
// the same text the same way. Run after build-full-pages.mjs.
//
//   node scripts/build-extra-pages.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const D = readFileSync(join(ROOT, 'full-d-google/index.html'), 'utf8');
// One css2 request for all four families, the way Google's embed code asks.
const LIVE = 'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,700;1,400'
  + '&family=JetBrains+Mono:wght@400&family=Noto+Sans+KR:wght@300;400;500;700&family=Noto+Serif+KR:wght@700&display=swap';
const PRECONNECT = '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
  + '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  ';

const page = (title, head) => D
  .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
  .replace('<link rel="stylesheet" href="fonts.css">', head);

for (const [dir, head] of [
  ['full-d-live', `<link rel="stylesheet" href="${LIVE.replace(/&/g, '&amp;')}">`],
  ['full-d-live-preconnect', `${PRECONNECT}<link rel="stylesheet" href="${LIVE.replace(/&/g, '&amp;')}">`],
]) {
  mkdirSync(join(ROOT, dir), { recursive: true });
  writeFileSync(join(ROOT, dir, 'index.html'), page(dir, head));
}

const css = readFileSync(join(ROOT, 'full-d-google/fonts.css'), 'utf8');
writeFileSync(join(ROOT, 'full-d-google/fonts-optional.css'), css.replace(/font-display: swap;/g, 'font-display: optional;'));
writeFileSync(join(ROOT, 'full-d-google/optional.html'),
  page('full-d-google optional', '<link rel="stylesheet" href="fonts-optional.css">'));
console.log('wrote extra pages');

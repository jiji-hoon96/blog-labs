// Clicks the resource-type filter (and optionally sorts by Name), then returns
// the rects the annotator needs, in CSS px of the DevTools page.
// shot.mjs evaluates this file; FILTER and SORT are substituted by make-figures.mjs.
(async () => {
  const FILTER = '__FILTER__', SORT = __SORT__;
  const all = [];
  const walk = (n) => { for (const el of n.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } };
  walk(document);
  all.find((el) => el.textContent.trim() === FILTER && el.getAttribute('role') === 'option').click();
  await new Promise((r) => setTimeout(r, 400));
  if (SORT) {
    const th = all.find((el) => el.tagName === 'TH' && el.textContent.trim().startsWith('Name'));
    th.click();
    await new Promise((r) => setTimeout(r, 400));
  }
  const again = [];
  const walk2 = (n) => { for (const el of n.querySelectorAll('*')) { again.push(el); if (el.shadowRoot) walk2(el.shadowRoot); } };
  walk2(document);
  const R = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const filterBtn = again.find((el) => el.textContent.trim() === FILTER && el.getAttribute('role') === 'option');
  const disable = again.find((el) => el.tagName === 'LABEL' && /Disable cache/.test(el.textContent)) ||
    again.find((el) => el.children.length === 0 && el.textContent.trim() === 'Disable cache');
  const heads = Object.fromEntries(again.filter((el) => el.tagName === 'TH').map((th) => [th.textContent.trim(), R(th)]));
  const rows = again.filter((el) => el.tagName === 'TR' && el.classList.contains('data-grid-data-grid-node') && el.getBoundingClientRect().height > 0)
    .map((tr) => { const td = tr.querySelector('td'); return { name: td.textContent.trim(), rect: R(tr) }; })
    .filter((r) => r.name);
  const foot = again.filter((el) => el.children.length === 0 && /(transferred|resources)$/.test(el.textContent.trim()))
    .map((el) => ({ text: el.textContent.trim(), rect: R(el) }));
  return JSON.stringify({ filterBtn: filterBtn && R(filterBtn), disable: disable && R(disable), heads, rows, foot,
    page: { w: innerWidth, h: innerHeight } });
})()

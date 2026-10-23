(() => {
  const all = [];
  const walk = (n) => { for (const el of n.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } };
  walk(document);
  const btn = all.find((el) => el.textContent.trim() === 'Font' && (el.getAttribute('role') === 'option' || el.tagName === 'SPAN' || el.tagName === 'BUTTON' || el.tagName === 'DEVTOOLS-BUTTON'));
  if (!btn) return 'no font button';
  btn.click();
  return 'clicked ' + btn.tagName + ' ' + (btn.getAttribute('role') || '');
})()

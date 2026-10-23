(async () => {
  const all = [];
  const walk = (n) => { for (const el of n.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } };
  walk(document);
  const font = all.find((el) => el.textContent.trim() === 'Font' && el.getAttribute('role') === 'option');
  font.click();
  const th = all.find((el) => el.tagName === 'TH' && el.textContent.trim().startsWith('Name'));
  if (!th) return 'font clicked, no Name th';
  th.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  th.click();
  return 'font + sort ' + th.className;
})()

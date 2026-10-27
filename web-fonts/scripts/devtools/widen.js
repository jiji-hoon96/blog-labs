(async () => {
  const all = [];
  const walk = (n) => { for (const el of n.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } };
  walk(document);
  const rs = all.filter((el) => el.classList?.contains("data-grid-resizer")).filter((el) => el.getBoundingClientRect().height > 0).sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);
  const xs = rs.map((r) => Math.round(r.getBoundingClientRect().x));
  const targets = [230, 310, 390, 720];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < Math.min(rs.length, targets.length); i++) {
    const r = rs[i], b = r.getBoundingClientRect(), y = b.y + 10, x0 = b.x + b.width / 2, x1 = targets[i];
    const opt = (x) => ({ bubbles: true, composed: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, isPrimary: true });
    r.dispatchEvent(new PointerEvent('pointerdown', opt(x0)));
    r.dispatchEvent(new MouseEvent('mousedown', opt(x0)));
    for (let k = 1; k <= 8; k++) { const x = x0 + ((x1 - x0) * k) / 8; for (const t of [r, r.ownerDocument]) { t.dispatchEvent(new PointerEvent('pointermove', opt(x))); t.dispatchEvent(new MouseEvent('mousemove', opt(x))); } }
    for (const t of [r, r.ownerDocument]) { t.dispatchEvent(new PointerEvent('pointerup', opt(x1))); t.dispatchEvent(new MouseEvent('mouseup', opt(x1))); }
    await sleep(200);
  }
  const after = all.filter((el) => el.classList?.contains('data-grid-resizer')).filter((el) => el.getBoundingClientRect().height > 0).map((r) => Math.round(r.getBoundingClientRect().x));
  return JSON.stringify({ before: xs, after });
})()

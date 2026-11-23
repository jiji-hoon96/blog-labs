// 카드마다 배경색을 정한다. 카드 마크업은 HTML 에 이미 있고, 색을 정하는 방법만 변형마다 다르다.
//   full        원본 PNG 를 new Image() 로 받아 canvas 에 그리고 픽셀 하나를 읽는다 (토스뱅크 홈과 같은 구조)
//   thumb       64x43 썸네일로 같은 일을 한다
//   precomputed colors.json 에 미리 계산한 색을 쓴다
// 색 읽기는 setTimeout 안에서 시작한다. 토스뱅크 홈처럼 렌더가 끝난 뒤 별도 task 에서 돈다.
const IMG = 'http://127.0.0.1:4201/';
const mode = document.body.dataset.mode;

async function sampleColor(src, x, y) {
  const img = await new Promise((ok) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => ok(i);
    i.onerror = () => ok(null);
    i.src = src;
  });
  if (!img) return null;
  const canvas = document.createElement('canvas');
  canvas.width = img.width; // 원본 크기 그대로. 3200x2160 이면 RGBA 로 약 27.6 MB
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const [r, g, b] = ctx.getImageData(img.width - x, y, 1, 1).data;
  return { r, g, b };
}

const colors = mode === 'precomputed' ? fetch(IMG + 'colors.json').then((r) => r.json()) : null;
for (const card of document.querySelectorAll('.card')) {
  const name = card.dataset.name;
  const paint = (c) => c && (card.style.background = `rgb(${c.r}, ${c.g}, ${c.b})`);
  setTimeout(() => {
    if (mode === 'full') sampleColor(`${IMG}${name}.png`, 20, 20).then(paint);
    if (mode === 'thumb') sampleColor(`${IMG}${name}-thumb.png`, 1, 1).then(paint);
    if (mode === 'precomputed') colors.then((all) => paint(all[name]));
  }, 0);
}

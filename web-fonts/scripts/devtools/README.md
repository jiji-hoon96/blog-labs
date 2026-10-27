# DevTools Network 화면 찍기

글에 넣는 Network 화면은 실제 화면을 찍지 않고, 헤드리스 Chrome 안에서 DevTools 화면을 별도 페이지로 열어 찍는다.
`/devtools/inspector.html?ws=...` 를 다른 탭으로 띄우면 DevTools 가 그 탭을 검사하는 화면이 일반 페이지로 그려진다.

```bash
cd web-fonts/scripts/devtools
# Font 필터, Disable cache, 열(Name, Protocol, Size, Content-Encoding)을 pre.js 가 localStorage 로 건다
POST=post.js      WAIT=14000 node shot.mjs https://hooninedev-web-fonts.netlify.app/full-a-ttf/    a-ttf.png pre.js
POST=post.js      WAIT=8000  node shot.mjs https://hooninedev-web-fonts.netlify.app/full-b-woff2/  b2.png    pre.js
H=1420 POST=post-sort.js WAIT=9000 node shot.mjs https://hooninedev-web-fonts.netlify.app/full-c-subset/ c-sorted.png pre.js
POST=post-sort.js WAIT=8000  node shot.mjs https://hooninedev-web-fonts.netlify.app/full-d-google/ d-sorted.png pre.js
POST=post-css.js  WAIT=7000  node shot.mjs https://hooninedev-web-fonts.netlify.app/full-d-google/ css-d-google.png pre.js
POST=post-css.js  WAIT=7000  node shot.mjs https://hooninedev-web-fonts.netlify.app/full-d-range/  css-d-range.png  pre.js

# 번호 표시와 빈 줄 잘라내기. spec 좌표는 1600px 폭 기준 CSS px
node annotate.mjs a-ttf.png spec-a.json 3.png
```

- `post.js` 는 Font 필터를 누르고, `post-sort.js` 는 이름순 정렬까지, `post-css.js` 는 CSS 필터를 누른다.
- Content-Type 은 DevTools 의 기본 응답 헤더 열이 아니라서 보이지 않는다. 형식은 이름의 확장자로 읽는다.
- `rough.js` 는 rough.js 4.6.6(MIT)의 빌드를 그대로 넣은 것이다.

## 캐시 적중과 원본 회차 비교 (2026-10-27)

```bash
RUNS=8 node shot-cache.mjs https://hooninedev-web-fonts.netlify.app/full-d-google/ out/
```

- 같은 페이지를 Fast 4G(165 ms, 8.1 Mbps)로 새 프로필에서 여러 번 열고, 회차마다 Network 화면과 요청별 `cache-status` 를 `out/runs.json` 에 남긴다.
- 검사 대상 탭과 DevTools 탭을 다른 창으로 연다. 같은 창이면 검사 대상이 뒤에 깔려 폰트 요청이 Load 뒤로 밀린다.
- `widen.js` 는 열 경계를 포인터 이벤트로 끌어 Cache-Status 열을 넓힌다. Waterfall 열은 경계가 없어 넓힐 수 없다.
- 결과는 `results/2026-10-27-cache-status-d.json`. 8회 중 6회가 전부 적중(1.39~1.44초), 2회가 HTML·CSS·폰트 모두 원본(2.21초, 4.00초)이었다.

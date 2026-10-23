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

# blog-labs

[hooninedev.com](https://hooninedev.com) 글에 쓰는 실험을 재현할 수 있게 모아 둔다.
실험마다 폴더 하나이고, 각 폴더는 바꾸기 전과 후를 나란히 둔다.

## web-fonts

같은 페이지가 웹폰트를 어떻게 선언하느냐에 따라 브라우저가 얼마나 받는지 잰다.

| 폴더 | 선언 방식 |
|---|---|
| `a-pinned-ttf` | Google Fonts CSS API 가 구형 브라우저에 주는 TTF 주소를 CSS 에 고정 |
| `b-full-woff2` | 같은 TTF 를 fontTools 로 woff2 변환. 서브셋 없음 |
| `c-sliced-woff2` | 같은 API 가 최신 Chrome 에 주는 CSS(`unicode-range` 조각 124개 x 굵기 2)를 저장해 그대로 사용 |

페이지는 둘이다. `index.html` 은 문단 세 개, `long.html` 은 블로그 글 한 편의 본문이다(`node scripts/build-pages.mjs` 로 생성).
폰트는 Noto Sans KR 400·700 이다. `b-full-woff2` 의 폰트는 SIL OFL 1.1 이고 라이선스 파일이 같은 폴더에 있다.

```bash
cd web-fonts
node scripts/serve.mjs          # http://localhost:4173/a-pinned-ttf/
node scripts/measure.mjs 5      # 빈 프로필로 5회씩 재서 results/ 에 남긴다
python3 scripts/split-latin.py  # 라틴 Noto Sans 로 같은 분해를 한 번 더
```

`measure.mjs` 는 CDP 의 `encodedDataLength` 를 더한다. 응답 헤더를 포함해 실제로 네트워크를 지난 바이트이고, 디스크의 파일 크기가 아니다.
Google Fonts API 를 실시간으로 걸면 응답하는 폰트 URL 형식이 요청마다 달라질 수 있어, `c-sliced-woff2` 는 응답을 저장해 고정했다.

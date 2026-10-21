# blog-labs

[hooninedev.com](https://hooninedev.com) 글에 쓰는 실험을 재현할 수 있게 모아 둔다.
실험마다 폴더 하나이고, 각 폴더는 바꾸기 전과 후를 나란히 둔다.

## web-fonts

같은 페이지가 웹폰트를 어떻게 선언하느냐에 따라 브라우저가 얼마나 받는지 잰다.

| 폴더 | 선언 방식 |
|---|---|
| `a-pinned-ttf` | Google Fonts CSS API 가 구형 브라우저에 주는 TTF 주소를 CSS 에 고정 |
| `b-google-css` | Google Fonts CSS API 를 그대로 `<link>` 로 연결 |

```bash
cd web-fonts
node scripts/serve.mjs          # http://localhost:4173/a-pinned-ttf/
node scripts/measure.mjs 5      # 빈 프로필로 5회씩 재서 results/ 에 남긴다
```

`measure.mjs` 는 CDP 의 `encodedDataLength` 를 더한다. 응답 헤더를 포함해 실제로 네트워크를 지난 바이트이고, 디스크의 파일 크기가 아니다.
Google Fonts 는 응답하는 폰트 URL 형식이 요청마다 달라질 수 있어 B 의 합계는 수 KB 범위에서 흔들린다.

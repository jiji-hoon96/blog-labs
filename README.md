# blog-labs

[hooninedev.com](https://hooninedev.com) 글에 쓰는 실험을 재현할 수 있게 모아 둔다.
실험마다 폴더 하나이고, 각 폴더는 바꾸기 전과 후를 나란히 둔다.

## web-fonts

같은 페이지가 웹폰트를 어떻게 선언하느냐에 따라 브라우저가 얼마나 받는지 잰다.

| 폴더 | 선언 방식 |
|---|---|
| `a-pinned-ttf` | Google Fonts CSS API 가 구형 브라우저에 주는 TTF 주소를 CSS 에 고정 |
| `b-full-woff2` | 같은 TTF 를 fontTools 로 woff2 변환. 서브셋 없음 |
| `c-subset-woff2` | 같은 TTF 를 D 와 같은 `unicode-range` 124개로 잘라 woff2 로 (`python3 scripts/build-c.py`) |
| `d-google-variable` | 같은 API 가 최신 Chrome 에 주는 CSS 를 저장해 그대로 사용. 조각이 가변 폰트(wght 100~900)라 400 과 700 이 같은 파일을 쓴다 |

A, B, C 는 같은 TTF 에서 출발하므로 A 에서 B 는 형식만, B 에서 C 는 서브셋만 바뀐다.

`*-4w` 폴더는 같은 네 변형을 굵기 넷(300, 400, 500, 700)으로 만든 것이다(`python3 scripts/build-4w.py`). 페이지는 첫 문단을 300, 본문을 400, 소제목을 500, 제목과 굵은 글씨를 700 으로 그린다. 400 과 700 파일은 두 굵기 폴더의 것을 복사해 쓴다. fontTools 의 woff2 출력이 실행마다 수백 B 씩 달라서 다시 만들면 두 굵기 측정값이 흔들리기 때문이다.

`*-4w` 폴더에는 대조군 페이지가 둘 더 있다. `*-3w.html` 은 첫 문단을 400 에 두고 소제목만 500 으로 그린 굵기 셋, `*-note.html` 은 굵기 넷이되 300 을 한 줄짜리 보조 문구에만 쓴다. `node scripts/measure.mjs 5 controls` 로 재서 `results/<날짜>-controls.json` 에 남긴다.

페이지는 둘이다. `index.html` 은 제목 하나와 문단 두 개(`-4w` 는 소제목 하나를 더한다), `long.html` 은 블로그 글 한 편의 본문이다(`node scripts/build-pages.mjs` 로 생성).
폰트는 Noto Sans KR 이다. B 와 C 폴더의 폰트는 SIL OFL 1.1 이고 라이선스 파일이 같은 폴더에 있다.

```bash
cd web-fonts
node scripts/serve.mjs          # http://localhost:4173/a-pinned-ttf/
node scripts/measure.mjs 5      # 빈 프로필로 5회씩 재서 results/ 에 남긴다
python3 scripts/split-latin.py  # 라틴 Noto Sans 로 같은 분해를 한 번 더
```

`measure.mjs` 는 CDP 의 `encodedDataLength` 를 더한다. 응답 헤더를 포함해 실제로 네트워크를 지난 바이트이고, 디스크의 파일 크기가 아니다.
Google Fonts API 를 실시간으로 걸면 응답하는 폰트 URL 형식이 요청마다 달라질 수 있어, `d-google-variable` 은 응답을 저장해 고정했다. 측정 조건을 맞추려는 것이다. 실제 서비스에서 응답을 고정하면 API 가 브라우저마다 골라 주던 응답이 하나로 굳고, `a-pinned-ttf` 가 그렇게 해서 TTF 에 묶였다.

### 복합 구성 (`full-*`)

`full-*` 폴더는 한 페이지가 폰트 넷을 같이 쓰는 구성이다. 본문은 Inter 와 Noto Sans KR(300, 400, 500, 700), 인용은 Inter 이탤릭, 제목은 Noto Serif KR 700, 코드는 JetBrains Mono 400 이다. 위의 네 변형에 하나를 더했다.

| 폴더 | 선언 방식 |
|---|---|
| `full-a-ttf` | API 가 구형 브라우저에 주는 TTF 를 자체 호스팅 |
| `full-b-woff2` | 같은 TTF 를 woff2 로. 서브셋 없음 |
| `full-c-subset` | 같은 TTF 를 패밀리마다 Google 과 같은 범위로 잘라 woff2 로 |
| `full-d-google` | API 가 최신 Chrome 에 주는 CSS(굵기 나열 요청) 그대로, 파일은 자체 호스팅 |
| `full-d-range` | 같은 API 에 굵기를 범위(`wght@300..700`)로 요청한 것 |

`full-a-ttf` 의 TTF(약 40 MB)는 커밋하지 않았다. `python3 scripts/build-full.py` 가 없는 파일만 API 에서 받아 온다. 이미 있는 woff2 는 다시 만들지 않으므로 B, C, D 의 측정값은 그대로다. 받아 온 TTF 가 당시와 같은지는 API 쪽 폰트 버전에 달려 있다.

```bash
cd web-fonts
python3 scripts/build-full.py                 # fontTools, brotli 필요
node scripts/build-full-pages.mjs             # 각 폴더의 index.html
node scripts/measure-full.mjs 9 https://hooninedev-web-fonts.netlify.app fast4g
```

기준 결과는 `results/2026-10-23-full-deployed-fast4g.json` 이다(9회, 예열 3회, DevTools Fast 4G 적용값 165 ms, 8.1 Mbps). 같은 날의 `-run1`, `-run2` 는 `_headers` 의 캐시 헤더를 고치기 전에 잰 것이라 비교에 쓰지 않는다. 이 기준 결과는 edge 캐시 적중 판정을 고치기 전에 기록했다. 지금의 `measure-full.mjs` 는 `fwd=stale` 도 적중 실패로 센다.

글에 넣은 DevTools Network 화면은 `scripts/devtools/` 에서 찍는다. 절차는 그 폴더의 README 에 있다.

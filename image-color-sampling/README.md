# image-color-sampling

카드 배경색을 썸네일의 픽셀 하나에서 읽는 페이지가 첫 화면에서 얼마나 받는지 잰다.
2026-11-20 토스뱅크 홈(`www.tossbank.com`)의 피드 카드에서 관찰한 구조를 공개 재료로 다시 만들었다.
토스뱅크의 코드는 옮기지 않았다.

| 폴더 | 카드 배경색을 정하는 방법 |
|---|---|
| `a-full-sample` | 원본 PNG(3200x2160)를 `new Image()` 로 받아 canvas 에 그리고 오른쪽 위 픽셀 하나를 읽는다 |
| `b-thumb-sample` | 같은 일을 64x43 썸네일로 한다 |
| `c-precomputed` | 미리 계산한 색(`images/colors.json`)을 쓴다 |

세 페이지의 카드 마크업은 같다. 카드 24장, 각 카드의 `<img loading="lazy">` 는 원본 PNG 를 가리킨다.
이미지는 다른 origin(`127.0.0.1:4201`)에서 `Access-Control-Allow-Origin: *` 로 준다.

```bash
cd image-color-sampling
python3 scripts/make-images.py      # images/ 의 카드 24장, 썸네일, colors.json
node scripts/build-pages.mjs        # 세 변형의 index.html
node scripts/serve.mjs              # http://localhost:4200/a-full-sample/
DC=0 node scripts/measure.mjs http://localhost:4200/a-full-sample/ results/a-full-sample-1
```

`measure.mjs` 는 헤드리스 Chrome 에서 DevTools 화면을 별도 탭으로 열고, 검사 대상 탭을 앞에 둔 채 로드한다.
`DC=1` 이면 DevTools 의 Disable cache 를 켠다. 대상 탭이 뒤에 깔리면 lazy 이미지가 뜨지 않아 결과가 달라진다.

## 결과 (2026-11-20, Chrome 157, 창 1600x1000, 3회 모두 같은 값)

| 변형 | 요청 | 전송량 | Disable cache 켬 |
|---|---|---|---|
| a-full-sample | 40 | 16.80 MB | 24.73 MB |
| b-thumb-sample | 40 | 8.03 MB | |
| c-precomputed | 17 | 7.94 MB | 7.94 MB |

- A 는 화면에서 먼 카드 12장까지 원본을 받는다. lazy `<img>` 는 12장만 로드됐다
- A 에서 Disable cache 를 켜면 같은 파일을 `<img>` 가 한 번 더 받아 7.93 MB 가 늘어난다. 같은 파일을 두 번 요청하지 않는 C 는 그대로다
- Network 패널 Initiator 는 색 읽기 요청 24개가 `Script`, 카드 `<img>` 요청 12개가 `Parser` 다

카드 이미지는 `make-images.py` 가 만든 도형이고 이 저장소의 라이선스를 따른다.

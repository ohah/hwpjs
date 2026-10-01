# Canvas 문단 텍스트 미리보기

첫 웹 화면은 HWP5 파일을 브라우저에서 읽어 Canvas에 문단 텍스트를 그리는 **읽기 전용 실험**입니다. 파일 업로드 요청·외부 CDN·새 런타임 패키지는 없고 기존 JS/WASM reader를 재사용합니다. HWPX·원래 글자 모양·표 테두리·그림·필드 표시·페이지 조판·편집·저장은 지원하지 않습니다. 서식 편집 native 실험을 웹으로 공개한 단계도 아닙니다.

## 책임과 SSOT

- `web/preview/reader-worker.mjs`: 기존 `createHwp5Reader` 호출과 수명 관리. 파일마다 별도 Worker를 사용해 파싱은 UI 스레드 밖에서 수행합니다.
- `content.mjs`: 문단 텍스트·구역/문단/중첩·제어 표식 수의 표시용 projection과 UTF-16 잘림 경계. 원래 문서 모델이나 저장 입력이 아닙니다.
- `layout.mjs`: 기본 시스템 글꼴에서 grapheme별 폭을 더해 만드는 실험용 줄 흐름. 원본 HWP 줄바꿈·정렬·복잡한 shaping/kerning·페이지 좌표와의 일치는 보장하지 않습니다.
- `renderer.mjs`: viewport 크기의 Canvas 2D, DPR(최대 3), 표시되는 행만 그리기, ResizeObserver/스크롤 갱신. 원본 문서를 변경하지 않습니다.
- `app.mjs`: 파일 선택·취소·오류·진행 상태·제한 안내 및 읽기 전용 대체 텍스트. 빠른 재선택은 이전 Worker를 종료하고 오래된 읽기 결과를 적용하지 않습니다. 성공 여부와 무관하게 새 선택 시 이전 화면을 지웁니다.
- `tools/serve-preview.mjs`: 127.0.0.1에만 바인딩하는 개발 서버. web/preview·js·제품 WASM만 제공하고 나머지 경로와 경로 탈출은 거부합니다. GET/HEAD만 허용하며 문서를 받는 엔드포인트가 없습니다. 운영 배포 서버가 아닙니다.

화면 폭에 따른 시스템 글꼴·줄 흐름은 표시 계층의 정책이고 편집 가능한 문서 값의 SSOT가 아닙니다. Canvas 방식 결정은 [아키텍처](architecture.md)가 소유합니다. 사용 명령은 [개발 명령](development-commands.md), 빠른 사용법은 [README](../README.md)에 둡니다.

## 한도와 접근성

파일은 기존 reader의 64 MiB 입력 한도를 적용합니다. 표시 projection은 원래 텍스트 최대 200,000 UTF-16 단위·20,000문단, 줄 흐름은 최대 20,000행입니다. 한도를 넘으면 일부만 표시한다는 경고를 내고 창 크기를 바꾸면 행 한도를 다시 판정합니다. 한 문단 끝의 grapheme 폭이 viewport보다 크면 잘릴 수 있으며 이는 일반 문서 조판 지원이 아닙니다. 대체 텍스트는 최대 50,000 UTF-16 단위의 읽기 전용 textarea로 제공하며 해당 한도를 화면에 명시합니다. Text/HTML을 해석하거나 제어 토큰을 표시 문자열로 확장하지 않습니다. 전체 문서 검색·복사·선택·완전한 접근성 구현은 아닙니다.

## 2026-10-01 검증

Node 집중 테스트 3개는 원본 불변·surrogate 잘림·emoji/combining grapheme 보존·빈 문단·행/문단 한도·잘못된 폭과 측정값을 검사합니다. 정규 audit의 기존 HWP5 미리보기 Node 검사에도 연결했습니다. 기존 미리보기·문서 도구와 합쳐 20개가 통과했습니다.

ReleaseSafe 전체 Zig 테스트는 7/7 단계·2,687/2,687 테스트·종료 코드 0으로 통과했고 제품 WASM 빌드도 통과했습니다. 이번 변경은 Zig 파서 코어를 수정하지 않았습니다. 브라우저에서 좁은 합성 viewport에 21,000글자를 표시해 20,000행 한도와 clear 후 경고/행 초기화도 확인했습니다.

`agent-browser`의 Chromium에서 실제 `charshape.hwp`(7문단)·`table.hwp`(6문단)를 선택해 성공, 일반 파일 `README.md`를 선택해 `InvalidSignature`와 이전 Canvas/대체 텍스트 초기화를 확인했습니다. 표 표본은 직접 텍스트가 없는 중첩 문단도 명시합니다. 390×844 viewport에서 가로 넘침이 없고 Canvas의 스크롤 전후 픽셀 출력이 달라지는 것을 확인했습니다. 합성 File로 HWPX 거부·크기 속성 64 MiB+1 거부·잘못된 바이트·빠른 재선택을 검사했고, 마지막 실제 파일 선택이 이전 오류에 덮이지 않았습니다. 실제 64 MiB+1 파일의 메모리/성능 부하를 측정한 것은 아닙니다.

개발 서버의 HTML/JS/WASM MIME을 확인하고 비허용 문서 경로·일반/인코딩 경로 탈출은 404, POST는 405로 거부했습니다. 파일명/오류/대체 텍스트는 DOM 문자열로만 다루며 HTML을 실행하지 않습니다. 스크린샷은 로컬 `/private/tmp/hwpjs-canvas-preview.png` 및 `/private/tmp/hwpjs-canvas-mobile.png`에 남겼습니다. Firefox·Safari·실제 모바일·최대 문서 성능·한글 프로그램 화면 동등성은 미검증입니다.

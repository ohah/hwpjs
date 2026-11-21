# 공개 그림 크기 조절

공개 데모의 그림 속성 창은 기존 너비·높이 mm 입력과 비율 유지 기능을 사용한다. 이 후보는 같은 Native 그림 크기 요청을 캔버스 조절점에도 연결한다. 선택된 지원 그림의 오른쪽·아래 가운데 조절점은 한 축, 오른쪽 아래 조절점은 두 축을 바꾼다. Shift는 기존 계산에 따라 비율을 유지한다. 드래그 중에는 안내선만 그리며 놓을 때 한 번 적용한다. Esc, pointer cancel, 포커스/문서/선택/레이아웃 변경은 현재 드래그를 취소한다.

Native가 허용한 현재 HWP5/HWPX 그림과 실제 표시 정보가 모두 있어야 한다. 보호·상대 크기·읽기 전용·부분 문서·권한 없는 선택에는 조절점을 제공하지 않는다. 선택 인증서, Core 상태·lease·source·modal identity와 대상 section/node/현재 크기를 놓는 순간 다시 검사한다. 공개 API나 Native/worker/reader를 추가하지 않는다. 기존 shared geometry/guide/resize 요청을 사용하고 일반 텍스트 및 방향키 경로를 보존한다.

Surface는 정규 DOM 계약을 사용한다. 테스트 realm에는 Document/Window EventTarget과 modal querySelector를 제공한다. 빈 상태의 focus 거부와 ready 상태의 realm별 focus를 각각 검사한다. Node source 검증 provider는 실제 Core 소스 export를 연결하고 defaults.json import attribute만 정규화하며 JSON bytes나 Core 동작을 대체하지 않는다. 로드된 Surface/helper URL을 증거 로그로 출력한다. 합성 이벤트 replay는 trusted browser 증거가 아니다.

```sh
node --experimental-transform-types --max-old-space-size=384 \
  --import ./tools/tests/picture-resize-source-provider.mjs \
  --test --test-concurrency=1 \
  ./packages/vanilla/tests/picture-resize-controls.test.mjs \
  ./packages/vanilla/tests/surface.test.ts \
  ./packages/vanilla/tests/undo-onset-surface-integration.test.mjs
node --experimental-transform-types --max-old-space-size=384 \
  --import ./tools/tests/picture-resize-source-provider.mjs \
  --import ./packages/vanilla/tests/non-text-history-renderer-hook.mjs \
  --test --test-concurrency=1 \
  ./packages/vanilla/tests/non-text-history-surface.test.mjs \
  ./packages/vanilla/tests/non-text-history-rejected-picture.test.mjs \
  ./packages/vanilla/tests/non-text-history-rejected-picture-negative.test.mjs
node node_modules/typescript/lib/tsc.js --noEmit -p ./tools/tests/tsconfig.picture-resize.json
```

이 source/light 명령은 javascript-quality CI의 전용 step에도 명시 등록한다. 현재 source32/history58 통과는 Native 새 저장 또는 GUI 조절 성공을 뜻하지 않는다. 실제 제품 검증은 별도 정확한 gallery/worker/WASM artifact와 슬롯 승인 후 H5/HX own PNG의 trusted drag, 한 commit/undo-redo, 원본 crop·리소스 보존, 저장 raw와 fresh 재열기를 확인해야 한다. Shift 비율 유지와 실제 pointercancel도 별도로 수집한다. Native size-protected GUI fixture는 아직 생산 경로와 핀이 확정되지 않아 미실행이다.

기본 저장 정책은 그대로다. HWP5 조판 guard가 거부하면 그 결과를 보존하고, 기존 제품의 편집 문서 명시 동의 경로를 사용하는 경우에도 이를 기본 저장 성공으로 부르지 않는다. baseline에 stale 허용을 켜거나 그림 크기 기능에서 자동 동의하지 않는다. 일반 회전·그룹·상대 크기 개체와 모든 문서의 조판 저장을 보장하지 않는다.

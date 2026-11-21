# 공개 그림 크기 조절

선택된 그림의 모서리와 변 가운데에 조절점이 표시된다. 변 가운데는 한 축, 모서리는 두 축을 바꾼다. Shift는 비율을 유지한다. 드래그 중에는 안내선을 그리고 놓을 때 한 번 적용한다. Esc, 포인터 취소, 포커스·문서·선택·레이아웃 변경은 드래그를 취소한다. 속성 창의 너비·높이 입력은 기존 크기 편집 경로를 사용한다.

## 반대쪽 고정점

HWP5·HWPX에서 페이지 기준 위·왼쪽에 절대 위치하는 일부 떠 있는 그림은 드래그하는 조절점의 반대점을 고정한다. Native가 현재 그림의 물리 위치, 크기, 오프셋과 편집 권한을 인증하면 안내선과 실제 편집이 동일한 고정점을 사용한다. 변경된 위치와 크기는 한 번의 문서 이력으로 저장된다.

보호·회전·뒤집기·그룹·상대 배치·부분 문서는 이 위치 편집의 지원 범위에서 벗어난다. Native가 인증한 기존 크기 편집은 원래 위치 기준점을 사용한다. 고정점 드래그가 시작된 뒤 문서나 편집 대상이 달라지면 해당 동작을 취소한다.

Native 계산은 기존 위치에 `(이전 크기 - 새 크기) × 고정점 비율`을 더한다. 반대 변의 가운데가 고정점이면 HWPUNIT 정수 오프셋을 유지해야 한다. JS는 원본 프레임 인증서를 읽고 검증하며 저장 프레임 및 문서 이력을 Native가 소유한다.

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

Native 집중 검증은 공통 좌표 계산, HWP5·HWPX의 물리 소유자, 초과·반 단위 좌표 거부, 실행 취소·다시 실행과 할당 실패 시 원본 보존을 검사한다. 공개 SDK 검증은 두 형식의 8방향 모두에서 저장과 재열기를 확인하며, 모서리 사례는 외부 파서로 확인한 저장 파일 SHA를 비교한다. 캔버스 테스트는 현재 그림 선택과 안내선의 수명, 취소, 오래된 작업 거부를 다룬다. 실제 포인터 조작은 별도의 브라우저 검증으로 기록한다.

기본 저장 정책은 그대로다. HWP5 조판 guard가 거부하면 그 결과를 보존하고, 기존 제품의 편집 문서 명시 동의 경로를 사용하는 경우에도 이를 기본 저장 성공으로 부르지 않는다. baseline에 stale 허용을 켜거나 그림 크기 기능에서 자동 동의하지 않는다. 일반 회전·그룹·상대 크기 개체와 모든 문서의 조판 저장을 보장하지 않는다.

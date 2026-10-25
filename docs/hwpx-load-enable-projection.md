# HWPX 최초 활성화의 중복 표시 계산

성공한 비암호화 HWPX load 직후의 enable 한 번만, load가 만든 표시 projection의 별도 소유 복사본을 재사용한다. Native 문서·이력은 그대로 원본이며, enableHistory와 최신 capability/history metadata 계산은 계속 실행한다. 편집 후 content를 이전 원본으로 되돌리거나 일반 projection cache를 유지하는 기능은 아니다.

모든 다음 요청은 진입 시 복사본을 소진하거나 폐기한다. 바로 다음 enable이어도 editor/preview/bytes/module/window/정책과 요청 ticket이 다르거나, 알 수 없는 enable 옵션이 있으면 기존 계산 경로를 실행한다. 잘못된 요청·실패·다른 load·dispose·동시 진입도 재사용을 차단한다. unlock과 편집에는 복사본을 만들지 않는다. 반환한 load reply를 호출자가 수정해도 별도 소유 복사본은 변경되지 않는다.

## 검증

`tests/hwpx/load-enable-projection.test.mjs`의 10개 검사는 실제 WASM 함수를 그대로 위임하면서 paragraph snapshot 호출 횟수·결과·Native 이력·무효화를 관측한다. 이전 HEAD에서는 즉시 enable의 snapshot 호출이 1→2가 되어 실패하고, 후보 및 실제 소스에서는 10/10 통과했다. 느슨한 시간 임계값으로 성공을 판정하지 않는다.

별도 격리 대조는 무효화·소유권·metadata 16개와 charshape/noori/대형 편람의 baseline/candidate 6 lifecycle을 검사했다. 각 쌍의 전체 초기 content와 수정 저장 bytes가 같고 undo baseline bytes, redo bytes, 재열기 exact resave도 같았다. 근거는 `zig-out/verification/hwpx-load-enable-one-shot/`이다. 단일 Native 측정에서 편람 enable 20.778초→0.572초, 재열기 enable 20.708초→0.556초였다. load·splice·undo·redo 자체의 개선을 의미하지 않는다.

게시할 HEAD 기반 최소 runtime 변경에서도 무효화·metadata 대조와 charshape/noori lifecycle 동등성을 확인했다. 실제 소스의 Core 194개가 통과했고 현재 후보에서 skip된 과거 wire 검사2개는 지정 fdbb 고정 WASM으로 별도 통과했다. 서로 다른 산출물의 결과를 단일 WASM 전수 통과로 합산하지 않는다. 실제 WASM은 fc7fb2ab7eeff2bb07ae1463f7e5b12dcc7ebbd49f4c6de9487a85da6900dda4다.

웹 빌드·타입 검사 후 localhost와 Tailscale에서 각각 Vanilla/React/Svelte × HWP/HWPX 6조합의 실제 붙여넣기·후속 입력·undo/redo·다운로드·독립 CFB/XML 저장·재열기가 통과했다. 근거는 `zig-out/verification/hwpx-one-shot-head-publication/{private-e2e.log,public-e2e.log,actual-core-tests.log,frozen-wire-tests.log}`다. 이 브라우저 회귀의 두 fixture를 전체 corpus의 모든 명령이나 한글 조판 동치로 확대하지 않는다.

실행은 명시 `HWPJS_TEST_WASM`에서 `node --test tests/hwpx/load-enable-projection.test.mjs`다. 해당 환경변수가 없으면 10검사를 skip하며 이를 성공으로 집계하지 않는다. 대형 문서의 중복 활성화 외 표시 계산과 남은 객체·편집 지원은 별도 과제다.

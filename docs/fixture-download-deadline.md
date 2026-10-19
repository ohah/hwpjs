# 픽스쳐 다운로드 대기 제한

`web/preview/fixture-controls.mjs`가 서버 픽스쳐의 다운로드 수명을 소유합니다. 실제 lazy `arrayBuffer()` 호출부터 응답 헤더와 본문을 모두 받을 때까지 기본30초 제한을 적용합니다. 시간 초과는 요청을 abort하고 한국어 연결 확인·다시 열기 안내 오류로 반환합니다. WASM 준비·파싱·조판과 로컬 파일 업로드에는 이 제한을 적용하지 않습니다.

취소 신호와 실제 다운로드를 함께 기다리므로 abort를 무시하는 transport도 호출자를 무기한 붙잡지 않습니다. 늦게 도착한 응답은 사용하지 않으며 성공·HTTP 오류·크기 오류·취소 때 타이머와 abort listener를 해제합니다. 새 픽스쳐 클릭은 새 요청으로 재시도하며 파일 전환·종료의 기존 취소 계약을 유지합니다. 테스트는 timer 함수를 주입해 긴 실제 대기 없이 경계를 확인합니다.

## 검증 (2026-10-20)

기존 main 구현에 새 회귀만 적용하면 stalled headers/body 두 검사가 각각 deadline 부재로 실패합니다. 수정 뒤 `node --test tests/hwpx/fixture-request-lifetime.test.mjs`는12/12·skip0입니다. 이 중 두 검사는 실제 localhost HTTP 서버가 헤더 또는 본문을 끝내지 않는 상황에서 실제 fetch를 취소하고 새 연결로 재시도합니다. 그 두 사례만 테스트용500ms 제한을 사용하며 제품 기본30초나 사용자 네트워크 지연을 성능 수치로 검증하는 것은 아닙니다. 나머지는 취소 무시 transport·늦은 응답·성공 시 타이머 해제·이전 파일/종료 취소·기존 HTTP/크기 오류를 검사합니다.

현재 HTTPS10000의 실제 aligns.hwpx 픽스쳐 버튼을 두 번 눌러 정상 열기를 재검증했습니다. 클릭→두 RAF346.3/249.5ms, 원본14,299bytes·HTTP200·33문단이며 두 번째 WASM 요청0개였습니다. HAR 디렉터리 suffix는 `hwpjs-fixture-profile-1TKEao`이고 소유 브라우저 inactive를 확인했습니다. 서버와 같은 Mac의 관측이며 사용자 외부망의 긴 대기는 재현하지 못했습니다. 두 RAF는 GPU 표시 완료가 아니며 이번 수정도 다운로드 속도 개선이 아니라 무기한 대기 방지입니다.

WASM 수명은 [WASM 다운로드·컴파일](preview-wasm-loading.md)이 별도로 소유합니다.

main에서 추출한 분리 사본에 이번 네 파일만 적용한 뒤 request-lifetime/fixture-response/fixture-plan 세 파일17/17·skip0·exit0을 확인했습니다. 첫 분리 실행의 response 두 실패는 reference fixture 미복사로 인한 ENOENT였고 성공으로 세지 않습니다. catalog가 지정하는 원본 일곱 파일을 실제 복사한 뒤 같은 검사를 다시 실행한 결과가 위17/17입니다. 심볼릭 링크로 서버 경로 검증을 우회하지 않았습니다.

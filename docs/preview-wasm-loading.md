# 데모 WASM 다운로드·컴파일 수명

기본 WASM은2026-10-20에30434b54로 갱신했습니다. 승격 검증·복구 사본·실제 외부 응답은 [HWP5 표 호환 후보의 데모 반영](hwp5-absent-table-zone-count.md)이 소유합니다. 아래 bacf2ef3의 속도 수치는 이전 바이너리 실측이며 새 후보의 외부망 속도로 해석하지 않습니다. 모듈 재사용/압축 정책은 그대로 유지합니다.

페이지마다 한 번만 WASM을 fetch/compile하고 새 문서 Worker에 structured-clone된 WebAssembly.Module을 전달합니다. 각 Worker의 인스턴스·문서·편집값은 독립적입니다. 직접 Worker 호출은 기존 fetch 경로를 유지합니다. HTTP/컴파일 실패는 재시도를 허용하며 새 WASM 빌드를 읽으려면 페이지를 새로고침해야 합니다.

`web/preview/wasm-module-loader.mjs`가 페이지 수명과 실패 재시도를 소유합니다. 앱은 배열 버퍼 읽기·엔진 준비 후에도 현재 파일 선택 세대인지 확인합니다. 상태는 실행 엔진 준비와 문서 해석을 구분합니다. Worker는 잘못된 모듈 객체를 거부합니다.

`tools/preview-wasm-compression.mjs`는 gzip 수락 여부·압축 캐시를 소유합니다. 서버는 WASM에만 gzip/Vary/정확한 Content-Length를 적용하고 기존 no-store를 유지합니다. 본문 변경 시 캐시를 무효화하며 브라우저의 gzip;q=0을 존중합니다. 기본 WASM 바이트나 필수 ABI는 바꾸지 않습니다.

## 검증

loader·압축·실제 Worker 비교3파일5/5·skip0을 분리한 main 사본에서 통과했습니다. 동시/후속 로드의 단일 fetch/compile·실패 재시도·압축 해제 원본 일치/본문 변경·quality·실제 aligns.hwpx 응답 동일·공유 모듈 사용 시 fetch0회·잘못된 모듈 거부를 확인했습니다.

2026-10-20 기본 데모의 동일 페이지 aligns.hwpx 실측은 첫426.5ms/재열기226.7ms였습니다. WASM 전송은 처음5,418,377바이트(해제 후16,504,695바이트), 재열기0회였습니다. 서버와 같은 Mac의 브라우저 측정이므로 사용자 WAN의 시간이나 첫 열기 개선율을 증명하지 않습니다. 수정 전 같은 경로395.5ms보다 첫 열기가 빨라졌다고 주장하지 않으며 전송량 감소/반복 다운로드 제거를 확인한 것입니다. 기본 서버만 재시작했고 WASM SHA-256은bacf2ef3 그대로 유지했습니다. 소유 검증 브라우저는 종료했습니다.

전체 파서·편집·원본 조판 동치와는 별도이며 관련 gate는 개발 명령 문서를 따릅니다.

게시 전 분리한 main의 실제 브라우저 재검증에서도 첫378.2ms/재열기207.8ms와 동일한 압축 크기·재열기 WASM resource0개를 확인했습니다. HAR hwpjs-fixture-profile-5Ryi47 및 소유 세션 inactive·전용58888 서버 종료를 확인했습니다. 이 실행 역시 loopback이며 사용자 WAN 실측은 아닙니다.

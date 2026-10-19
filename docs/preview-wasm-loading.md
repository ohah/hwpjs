# 데모 WASM 다운로드·컴파일 수명

## 엔진 다운로드 대기 제한 (2026-10-20)

공유 loader는 HTTP 헤더와 본문 수신을 합쳐 기본30초로 제한합니다. 제한 시 AbortController로 전송을 취소하고 별도 Promise race로 abort를 무시하는 전송도 대기에서 해제합니다. 공유 실패 Promise는 비워 다음 문서 열기가 다시 시도하게 합니다. 늦게 도착한 이전 응답은 컴파일하거나 새 캐시를 덮지 않습니다. 수신이 끝나면 타이머를 해제하며 컴파일 시간에는 이 네트워크 제한을 적용하지 않습니다. 사용자 환경의 `읽는 중…` 장기 정체 원인이 이 경로였다고 확정한 것은 아닙니다.

loader·압축·실제 Worker3파일7/7, skip0을 현재 기본 WASM으로 확인했습니다. 헤더/본문 각각의 무응답, 취소를 무시한 늦은 완료, 동시 요청 공유, 재시도, 느린 컴파일과 제한값 검사를 포함합니다. 시간 기반 sleep 대신 주입 타이머로 deadline을 실행합니다.

`읽는 중…` 단계의 서버 픽스쳐 요청 제한은 [픽스쳐 다운로드 대기 제한](fixture-download-deadline.md)이 소유하며 WASM 준비 시간과 구분합니다.

기본 WASM은2026-10-20에30434b54에서 실행 바이트가 동일한 디버그 제외7512cca7로 갱신했습니다. 이번 경량화의 검증·복구·외부 응답은 아래 절이 소유합니다. 이전30434b54의 기능 승격은 [HWP5 표 호환 후보의 데모 반영](hwp5-absent-table-zone-count.md)이 소유합니다. 아래 bacf2ef3의 속도 수치는 이전 바이너리 실측이며 새 후보의 외부망 속도로 해석하지 않습니다. 모듈 재사용/압축 정책은 그대로 유지합니다.

페이지마다 한 번만 WASM을 fetch/compile하고 새 문서 Worker에 structured-clone된 WebAssembly.Module을 전달합니다. 각 Worker의 인스턴스·문서·편집값은 독립적입니다. 직접 Worker 호출은 기존 fetch 경로를 유지합니다. HTTP/컴파일 실패는 재시도를 허용하며 새 WASM 빌드를 읽으려면 페이지를 새로고침해야 합니다.

`web/preview/wasm-module-loader.mjs`가 페이지 수명과 실패 재시도를 소유합니다. 앱은 배열 버퍼 읽기·엔진 준비 후에도 현재 파일 선택 세대인지 확인합니다. 상태는 실행 엔진 준비와 문서 해석을 구분합니다. Worker는 잘못된 모듈 객체를 거부합니다.

`tools/preview-wasm-compression.mjs`는 gzip 수락 여부·압축 캐시를 소유합니다. 서버는 WASM에만 gzip/Vary/정확한 Content-Length를 적용하고 기존 no-store를 유지합니다. 본문 변경 시 캐시를 무효화하며 브라우저의 gzip;q=0을 존중합니다. 기본 WASM 바이트나 필수 ABI는 바꾸지 않습니다.

## 검증

### 디버그 섹션만 제외한 배포 후보 (2026-10-20)

`node tools/strip-wasm-debug.mjs INPUT.wasm NEW_OUTPUT.wasm`은 기존 출력 덮어쓰기를 거부하고 별도 배포 파일을 생성합니다. `.debug_*`와 선택적 `name` custom section만 제외하며 원본은 보존합니다. 함수명/소스 위치를 통한 디버깅 정보는 줄지만 ReleaseSafe 실행 코드·안전 검사는 바꾸지 않습니다. `tools/wasm-runtime-parity.mjs`가 표준 실행 섹션 및 그 외 custom section의 순서·크기·payload SHA-256을 비교합니다. API 이름만 같은 것을 동작 동치로 세지 않습니다.

현재 기본30434b54에서 생성한 후보7512cca7302d77b990ab5bcaf839a8a342feebc8ec3e7007e31b38931233d1f4는16,587,350→4,460,476bytes입니다. 서버와 같은 gzip level1 기준5,446,790→1,481,953bytes로 약72.8% 감소했습니다. 실행·데이터·나머지 custom section은 전부 동일합니다. 별도 실험의 Zig strip 빌드 ff330ad9는 code section도 달라 이 동치 후보로 채택하지 않았습니다. 제품 빌드 최적화 옵션은 변경하지 않았습니다.

분리한 main 사본에서 runtime-parity/loader/compression/shared-Worker/HWP5-editor/HWPX-editor 여섯 파일23/23·skip0을 확인했습니다. HWPX tracked45개 무암호 no-op ZIP 및 실제7필드 편집·독립 XML/ZIP 왕복을 포함하지만 전체 픽스쳐의 모든 위치·명령 완료 검사는 아닙니다. 첫 두 환경 설정 실패(분리 사본의 Git metadata/index 누락)는 성공으로 세지 않으며, 별도 index에 HEAD를 읽고 GIT_DIR/WORK_TREE를 지정한 재실행 결과입니다. ReleaseSafe 빌드5/5와 build.zig 포맷 검사도 통과했습니다. 진행 중인 다른 native 수정 후보의 전체 테스트 완료를 뜻하지 않습니다.

실제 HWP5 roadmap Canvas 입력·이력·다운로드·독립 전체 Section/stream/metadata·재업로드는 분리 main UI에서 통과했습니다. 출력 suffix Wiyh7e, 저장 SHA-256 d7a030c6ef07a92ce55e7ef7d5fc25fd9125e277e03bf5ea03aaaf4906ed9985이며 기존 기본 바이너리의 같은 왕복 출력과 일치합니다. 소유 브라우저/전용 서버 종료를 확인했습니다.

추가 HWPX copay 브라우저 감사는 분리 main UI에서 기존304와 새7512 모두 동일한 UnsupportedPageRow 논리 미리보기로 멈췄습니다(n7OSJm/gelziE). 이를 편집 왕복 성공으로 세지 않습니다. 이 사본은 페이지 배치 관련 로컬 미게시 UI 수정을 포함하지 않습니다. 바이너리 경량화가 해당 기존 레이아웃 한계를 해결하지 않습니다.

이는 엔진의 첫 전송량 감소이며 `읽는 중…` 파일 다운로드 지연 원인이나 사용자 외부망 체감 시간 개선을 입증하지 않습니다. 기존 디버그 포함 바이너리는 문제 분석용으로 보존합니다.

### 기본 데모 반영과 실제 재확인

기본 파일의30434b54 해시와 runtime parity를 다시 확인하고 `/tmp/hwpjs-stripped-wasm-publish.fxoK7P/default-before-strip-30434b54.wasm`에 원본을 백업한 뒤 같은 디렉터리의 별도 파일을 atomic rename으로 교체했습니다. 기본 서버 재시작은 필요하지 않았습니다. HTTPS10000 decoded SHA-256은7512cca7 전체 해시와 같고 HTTP200·gzip·Content-Length1,481,953을 확인했습니다. 기존 탭은 새로고침해야 페이지에 캐시한 이전 모듈 대신 새 모듈을 사용합니다.

현재 로컬 미게시 UI를 포함한 데모 코드에서는 copay HWPX의 실제 셀 문단6·공백 꼬리말963 입력·이력·독립 XML/ZIP 저장·재업로드가 새 바이너리로 통과했습니다(output Wdo72p).16페이지·1,206행·그림8/8을 확인했지만 원본 조판 동치나 분리 main UI의 기존 UnsupportedPageRow 해소로 해석하지 않습니다. 사용한 전용 브라우저 inactive와58886 서버 종료를 확인했습니다.

공개 HTTPS10000의 실제 aligns.hwpx 버튼을 새 브라우저에서 두 번 연 결과 클릭→두 RAF288.4/219.3ms, fixture1.3/2.2ms, Worker221.1/204.6ms였습니다. 첫 WASM gzip1,481,953/decoded4,460,476bytes·두 번째 WASM 요청0개입니다. 직전30434b54의 같은 Mac 측정601.2/231.5ms보다 첫 표본은 짧았지만 CPU/전송 상태를 통제한 사용자 WAN 비교가 아니므로 성능 보장으로 쓰지 않습니다. HAR suffix ibackd, 소유 브라우저 inactive를 확인했습니다. `읽는 중…` 장시간 정체의 사용자 환경 재현은 여전히 미확인입니다.

loader·압축·실제 Worker 비교3파일5/5·skip0을 분리한 main 사본에서 통과했습니다. 동시/후속 로드의 단일 fetch/compile·실패 재시도·압축 해제 원본 일치/본문 변경·quality·실제 aligns.hwpx 응답 동일·공유 모듈 사용 시 fetch0회·잘못된 모듈 거부를 확인했습니다.

2026-10-20 기본 데모의 동일 페이지 aligns.hwpx 실측은 첫426.5ms/재열기226.7ms였습니다. WASM 전송은 처음5,418,377바이트(해제 후16,504,695바이트), 재열기0회였습니다. 서버와 같은 Mac의 브라우저 측정이므로 사용자 WAN의 시간이나 첫 열기 개선율을 증명하지 않습니다. 수정 전 같은 경로395.5ms보다 첫 열기가 빨라졌다고 주장하지 않으며 전송량 감소/반복 다운로드 제거를 확인한 것입니다. 기본 서버만 재시작했고 WASM SHA-256은bacf2ef3 그대로 유지했습니다. 소유 검증 브라우저는 종료했습니다.

전체 파서·편집·원본 조판 동치와는 별도이며 관련 gate는 개발 명령 문서를 따릅니다.

게시 전 분리한 main의 실제 브라우저 재검증에서도 첫378.2ms/재열기207.8ms와 동일한 압축 크기·재열기 WASM resource0개를 확인했습니다. HAR hwpjs-fixture-profile-5Ryi47 및 소유 세션 inactive·전용58888 서버 종료를 확인했습니다. 이 실행 역시 loopback이며 사용자 WAN 실측은 아닙니다.

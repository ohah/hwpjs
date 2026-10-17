# 차트 현재값 Worker·폼 연결

## 소유권과 지원 경계

차트의 현재값·공유 XML/OLE 사본 저장·이력은 native 세션이 소유한다. JS adapter는 optional ABI와 UTF8 입력/출력 버퍼 수명을 처리한다. Worker는 조회·명령·현재 문서 표시 갱신만 연결하고 폼은 미적용 초안만 보유한다. 저장용 JSON/XML 캐시를 추가하지 않는다.

`chart-controls.mjs`는 차트/값 종류 선택과 임시 입력을, point table/grid는 native ordinal을 보존하는 목록·표 투영을 맡는다. 계열 이름은 전용 ordinal API다. chart OLE 호환 선택은 다음 load/unlock에 적용하며 현재 세션을 몰래 다시 열지 않는다. 잘못된 옵션은 기존 세션을 닫기 전에 거부한다.

native export가 없는 기능을 폼에 허가하지 않는다. 계열 이름 API는 새 native 후보에서 검증했으며 기존 기본 WASM에는 없다. 이번 JS 연결만으로 native 차트 구현이 main 빌드에 추가되거나 기본 WASM이 바뀌는 것은 아니다. 차트 그림을 렌더링하지 못해도 값과 저장을 검사할 수 있으며 화면 안내도 이를 구분한다. rich-text·batch·차트 전체 그림의 표시/편집 완료를 주장하지 않는다.

## 첫 조회 누락의 재현·수정 — 2026-10-18

실제 Chromium의 편집 시작에서 덧말 `inline-string-sources` 조회가 먼저 busy 상태를 만들면 차트 첫 조회가 취소된 채 남았다. Worker 송수신 기록에는 load/enable/inline-string-sources만 있었고 chart-points가 없었다. 값 종류를 수동 전환하면 조회됐다.

폼은 `queryNeeded`를 초안 조회 상태로만 보관하고 준비 상태가 돌아온 응답 이후 대기 조회를 한 번 보낸다. 새 content는 이전 대기를 무효화하며 load/close는 취소한다. 무한 microtask polling이나 제품 모델 변경으로 처리하지 않는다. 새 재현 테스트는 수정 전 3개 중 1개 실패, 수정 후 통과했다. 기존 busy 모드 전환 테스트가 추가로 잡은 오래된 대기 요청은 content 수신 시 취소하도록 수정했다.

## 검증

- native 후보 WASM SHA256 `891fe0a1cb560083251ac50130505dc2dabac57f6ebeaf37f90bc226e76a676a`로 UI·Worker 26개 통과, 실패/skip 0.
- 기존 기본 WASM SHA256 `cbaaf27f858229fedd01b9996ce152bd31aa6d6f346481b7887bcc510ef68346`으로 계열 이름 Worker 사례를 제외한 같은 집합 25개 통과, 실패/skip 0.
- HWP5 입력 정책·Canvas 입력/편집 및 HWPX 생성 표 내용·splice·독립 저장 회귀 233개 통과, 실패/skip 0. DOM/Canvas 대역과 실제 Chromium 결과는 구분한다.
- 차트 native export가 없는 main 기반 WASM으로 변경 전 Worker/adapter와 연결 후 Worker/adapter를 각각 실행했다. 추적 HWPX 46파일의 load 오류 및 문단 정책 전체가 동일했다. 기존 `worker-fixtures` 검사는 직접 편집 가능한 계산 결과 13문단을 읽기 전용으로 가정해 먼저 실패했다. 이는 전후 동일한 기존 기대값 문제이며 해당 전체 편집 검사를 통과한 것으로 세지 않는다.
- 실제 Chromium에서 issue6037의 `2차원원형-계열추가.hwpx`를 열고 편집 시작만으로 13포인트가 조회됐다. 계열 이름을 `시리즈 통합 검증😀<&`로 변경하고 실제 다운로드·undo·redo·편집본 재업로드 후 이름을 확인했다. 차트 그림은 아직 보호 객체 표시이며 스크린샷에서도 이 한계가 보인다.
- 다운로드 편집본 296,145바이트 SHA256 `c8056b71e4d8d9cd6dd53f76fe550be6a4afe74118d3f4a0dade762174b061c4`. undo 파일은 원본 byte-exact, redo는 편집본 byte-exact다. 독립 Python 일반/-O의 전체 XML/ZIP/OLE 대조 2개와 잘못된 값 반례 2개가 통과했다. 별도 native 세션 재열기·재저장도 byte-exact다.
- 성공 시나리오의 browser errors는 비었다. 추가 잘못된 형식 업로드는 selector 실패와 대기 시간 초과 때문에 미검증으로 남긴다. 해당 실패를 UI 초기화 통과로 세지 않는다.
- 사용한 브라우저는 close 후 inactive·PID 없음, 임시 loopback 서버도 종료를 확인했다. 외부 데모나 기본 WASM은 교체하지 않았다.

별도 새 native 단일 프로세스 전체 실행은 RSS 13,544,896 KiB를 관측해 해당 소유 실행만 SIGTERM했다(exit143). 이 관측은 물리 footprint나 제품 누수 원인의 증명이 아니다. 실행은 incomplete이며 이후 동일 바이너리를 테스트별 별도 표준 runner와 1,024 MiB sampled physical-footprint guard로 검사하기 시작했다. 저메모리 이전 고정 소스의 별도 실행도 유지한다. 두 전체 gate와 수정 전 테스트의 실패를 집중 검사로 소급 통과 처리하지 않는다.

실행 명령은 [개발·검증 명령](development-commands.md)의 차트 UI 항목이 소유한다. 전체 native 검사와 원본 한글 조판의 동일성은 별도 완료 기준이다.

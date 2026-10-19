# 문서 첫 로딩 실측

## 재현 도구

node tools/worker-load-profile.mjs /absolute/hwpjs.wasm /absolute/document.hwp
node tools/worker-load-profile.mjs /absolute/hwpjs.wasm /absolute/document.hwp --unwrapped

WASM·입력은 명시하며 HWP5/HWPX는 파일 signature로 구분합니다. 이 도구는 Node에서 실제 reader-worker를 호출하고 compile/instantiate 및 native export별 호출 횟수·누적/최대 시간을 기록합니다. 함수 인자나 원문 텍스트는 출력하지 않습니다. artifact/input/Worker 파일 해시와 Worker source 불변 여부를 남깁니다. 단일 Worker 파일 해시는 전체 JS import closure의 동결 증명이 아닙니다.

기본 모드는 instantiate 반환의 exports 어댑터로 계측하며 native 함수를 그대로 호출합니다. --unwrapped 대조는 계측 없이 같은 Worker 결과의 contentSha256을 비교합니다. 모든 JS 전역은 finally에서 복원하고 세션을 닫습니다. 브라우저 네트워크·파일 전송·Canvas·글꼴·이미지 해독은 측정하지 않으며 래퍼 자체 비용이 있습니다. 전체 사용자 로딩 속도나 성능 개선율로 사용하지 않습니다.

tests/hwp5/worker-load-profile.test.mjs는 잘못된 CLI의 실행 전 거부와 실제 software.hwp의 계측/비계측 Worker content 해시 일치를 확인합니다. 명시적 HWPJS_TEST_WASM으로2/2·skip0입니다. 시간 상한을 고정하는 flaky 성능 테스트가 아닙니다.

## 실제 측정

2026-10-19의 기본 WASM SHA256은 bacf2ef3cd5ed1b2cf5b2ffc9d50f755ae08092d4a52c9ccf6a264e936a7a9fc입니다. 당시 작업 트리의 Worker 경로를 계측했으며 다른 소스·기기의 결과로 일반화하지 않습니다. 아래 첫 실측은 같은 계측 방식의 격리 스크립트에서 얻었으며 이 문서와 함께 게시하는 도구에 추가한 해시/대조 모드가 소급해 실행된 것은 아닙니다.

- issue5543_carried_anchor_ladder.hwpx: Worker2557.86ms·251문단. manual_formula_result_targets14회518.44ms와 display_text14회518.94ms가 합계 약1.04초(41%)입니다. character_ranges251회356.79ms도 별도 비용입니다. formula_result_projection.prepare는 개별 조회마다 현재 section 수식 snapshot과 문단 좌표를 준비하며 두 API가 같은 준비를 각각 수행합니다. 한 번의 문단/section 표시 snapshot으로 합치는 후보를 검토해야 하며 아직 최적화가 구현된 결과는 아닙니다.
- 동아리 공모 내용의 software.hwp: Worker49.40ms·101문단, 그중 text_read5.44ms·compile4.36ms·edit_open1.86ms였습니다. software_1.html은 저장 HTML의 페이지 조각이며 별도 software_1.hwp가 있는 것으로 가정해 실행한 첫 시도는 ENOENT였습니다. 원본 software.hwp로 다시 측정했습니다.

서버와 같은 Mac의 실제 Chrome에서 기존 Tailscale 데모에 software.hwp를 업로드했습니다. Worker requestAt26421.0→reply 관측26697.6→두 requestAnimationFrame 뒤26701.6으로 약280.6ms입니다. 이는 요청부터 메인 핸들러/그리기 기회까지의 관측이며 Worker 처리와 동기 렌더링을 정확히 분해한 값이나 GPU 표시 완료가 아닙니다. 이 위치에서는 navigation DCL31.2ms/load59.4ms·main resource250개였습니다. 독립 curl의16,504,695바이트 WASM 전송도 같은 Mac에서179ms였으며 사용자의 외부망 다운로드 성능이 아닙니다. 원격 지연은 별도 네트워크 위치에서 측정해야 합니다.

화면은 UnsupportedHwp5SectionExtension을 표시하며 물리 페이지가 아닌 논리 미리보기입니다. 이 파일의 원본과 다른 레이아웃에는 실제 미지원 경로가 남아 있습니다. 계측 결과를 화면 동치나 편집 완료로 바꾸지 않습니다.

agent-browser 전용 세션 hwpjs-load-profile-35c54947528a는 브라우저 close 응답 직후 남는 daemon 상태까지 공통 closeOwnedBrowser로 재확인해 inactive/pid 없음이 됐습니다. default 및 다른 세션·배포 서버는 종료하지 않았습니다. 설치/repair는 하지 않았습니다.

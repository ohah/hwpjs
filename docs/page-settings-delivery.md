# 편집 용지 통합 범위와 검증

HWP5·HWPX의 기존 용지 설정을 같은 정수 HWPUNIT 요청으로 변경합니다. 공개 SDK는 `getPageSettings()`와 `EDIT_PAGE_SETTINGS_COMMAND`, 웹 데모는 쪽 → 편집 용지, CLI·MCP는 `page-settings` 연산을 사용합니다. 값·소유권·저장의 형식별 계약은 [HWP5](hwp5-page-settings-edit.md)와 [HWPX](hwpx-page-settings-edit.md)가 소유하며, 공개 호출 예제는 [HeadlessEditor](../apps/docs/docs/api/editor.md)에 있습니다.

방향·폭·길이·제본 방식과 일곱 여백을 명시합니다. 원본 width/height와 표시 축을 구분하고 방향 변경으로 원본 축을 자동 교환하지 않습니다. 현재 구역은 실제 선택에서 얻으며 선택 부재를 구역0으로 바꾸지 않습니다. 문서 범위는 모든 구역을 먼저 검사하고 하나의 Native 이력으로 반영합니다. JSON으로 복제한 SDK target이나 다른 세션·이전 편집의 target은 쓰기 권한이 아닙니다.

## 현재 통합 산출물

2026-11-11 최신 표·문자 서식 구현과 결합한 WASM SHA256은 `1e1cc0686d8086aa72c40bfa8d92d13981ff5dfdb6c315cee971dbd97629f84a`입니다. global ABI6과 기존499 exports의 종류·인자 수를 유지하고 optional page-settings4개를 추가한503 exports입니다. ReleaseSmall·ReleaseSafe 제품 빌드를 확인했습니다. 이전 격리 f51d88 Native의 검증을 이 합본 검증으로 대신 세지 않습니다.

원본 필드는 Native가 보유하며 JS는 요청 경계·형식별 현재 capability를 검사합니다. 새 숫자 주소나 별도 문서 모델을 만들지 않습니다. CLI·MCP는 같은 서비스와 Native writer를 사용하고 저장·종료까지 성공해야 새 출력 파일을 게시합니다. 구형 엔진의 optional ABI 부재는 전체 입력의 첫 변경 전에 거절합니다.

## 확인한 결과

- Native 집중 검사: HWP5 소유5개, HWPX 소유6개가 통과했습니다. HWPX runner의 추가 import 검사1개를 새 용지 기능의 별도 검사로 세지 않습니다. HWP5152개 할당 실패 지점에서 원문·revision·redo 보존도 확인했습니다.
- 현재 엔진의 SDK14개와 공유 값·완료 상태 검사4개가 통과했습니다. 정상 쓰기·무변경·두 구역 범위·오래된 target·다른 세션·readonly·대기 입력·독립 CFB/XML·저장 재열기를 검사합니다.
- CLI·스키마·기존 서식 계획 회귀72개, 실제 Native 문자 서식10개, 기존 표 격자104개가 통과했습니다. 서로 겹치는 실행을 고유 기능 수로 합산하지 않습니다.
- 기존 입력 최적화 검사는 실제 제품 profile로40개가 통과했습니다. 별도 test-hook preflight40개는 같은 분모이며 추가40개로 합산하지 않습니다. 검증한 정확 SHA만 등록했고 환경변수·알 수 없는 모듈의 권한 경계는 유지합니다.
- 실제 공개 번들에서 두 형식 × 세 프레임워크의6흐름을 확인했습니다. HWP5는50% 배율에서 용지 폭395→574px, 긴 문단71→58행, HWPX는395→574px·32→18행으로 재배치됐습니다. 각 흐름의 단일 undo·redo·독립 CFB/XML 일반/`-O` 검사·저장 재열기가 일치했습니다. 모든 소유 browser/server를 종료했습니다.
- 실제 로컬 npm archive의133개 파일 해시를 확인했습니다. 용지 설정 cohort6개 중 실제 archive CLI·MCP 소비자3개와 source 서비스 재검사3개를 구분합니다. 기존 문자 서식의 archive 소비자12개와 스킬의 인접 엔진을 사용하는 용지 편집 두 형식도 통과했습니다. MCP 세션은 모두 종료했습니다.
- 공개 패키지의 실제 선언으로 SDK 예제를 타입 검사했습니다. 설치형 산출물·스킬은 정규 패키지 빌드의 파일 해시를 대조하며 npm 게시와 구분합니다.

검증 자료는 `zig-out/verification/page-settings-main-integration-r1/`에 보존합니다. `GUI-FINAL.json`, `ABI-VERIFIED.json`, `PROFILE-ADMISSION.json`, 각 Native/SDK/CLI 로그가 분모를 구분합니다. CI에서는 명시한 합성 두 구역 입력과 기존 공개 page.hwp만 사용하는 [정규 실행](development-commands.md#page-settings-portable-regressions)을 수행합니다.

데모 라이선스는 현재 해석된 의존성의 실제 버전·SPDX·전문 해시로 생성합니다. Svelte5.57.2 기록이5.57.3 산출물에 남던 생성 경로를 수정했으며, 이전 메타데이터 거절과 새 메타데이터 승인을 확인했습니다. 이 보정 전후의 HTML·JS·CSS·WASM은 바이트가 동일합니다. `LICENSE-METADATA-VERIFIED.json`에 근거를 남겼습니다.

## 남은 범위

PAGE_DEF/pagePr 부재 생성, 새 구역, 중복·조건부 owner 확대, 해석할 수 없는 캐시, pending generated-table/cell-style를 유지한 쓰기는 남아 있습니다. UI의 용지 프리셋 확대와 실제 API 플레이그라운드의 용지 호출 항목도 후속입니다. 이번 재배치 확인은 전체 문서·글꼴·한컴 화면과의 조판 동치나 React Native 기기 검증을 뜻하지 않습니다. 표 분할 뒤 번호가 이동하는 caret 복원은 별도 미배포 후보이며 이 변경에 포함하지 않았습니다.

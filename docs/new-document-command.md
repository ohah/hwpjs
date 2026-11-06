# 새 문서 명령과 교체 수명

파일 생성 규칙·기본값은 [새 문서 포맷](new-document-format.md), 실제 API는 Core `createDocument`, 일반 파일 교체는 기존 load/admission 경로가 소유한다. 기본 형식은 HWPX이며 HWP5도 명시 선택할 수 있다.

`createReaderRuntimeFactory`가 제공하는 선택적 `createDocumentBytes(format)`는 현재 편집 세션과 다른 WASM instance에서 Native 생성기를 호출한다. 함수가 반환한 전용 Uint8Array의 소유권은 편집기로 넘기며 후보 접수 종료 시 지운다. 생성 기능이 없는 runtime factory는 명시적으로 거부한다. 모듈 import 시 파일·네트워크·브라우저 I/O를 수행하지 않는다.

`editor.createDocument({format?,history?,editable?,enableOptions?})`는 일반 load와 같은 후보·세대·취소·dispose 경계를 사용한다. 느린 생성 완료가 나중에 열린 파일을 덮어쓰지 않으며 생성·load 실패는 기존 문서/이력을 유지한다. 새 문서는 새 documentId/generation과 빈 이력으로 게시한다. 안정된 기본값은 A4·20mm 본문 여백·11pt·한국어 바탕글이고 공식 데모 한 문맥의 관측 기본값을 그대로 복사한 것은 아니다.

`createDocument`는 검증된 초기 선택을 문서의 ready 상태와 같은 한 번의 게시에 포함한다. HWPX의 빈 본문은 display0이다. HWP5의 작성된 빈 본문은 두 비도색 구역/단 제어 표식, 원본 본문 참조, 구조 앵커와 `sourceOffsets`의 대응이 모두 일치할 때만 display2/source16을 선택한다. 이 위치가 눈에 보이는 첫 입력 칸이다. 일반 load/unlock에는 이 초기화를 적용하지 않으며, 검증할 수 없는 사용자 runtime factory의 관측 형태에는 초기 선택을 추정하지 않는다. 데모는 반환된 선택을 사용하며 display0으로 다시 설정하지 않는다.

HWP5 display0/source0에서 ‘첫A’를 입력하면 원시 secd/cold가 source0/8에서2/10으로 이동하고 Enter가 `UnsupportedStructuralControl`로 거부되는 실제 반례를 보존했다. display2/source16에서는 제어 순서가0/8을 유지하며 첫 입력 뒤 게시된 caret의 source18에서 Enter가 성공한다. Native의 구조 이동 금지는 유지하며, 첫 문단을 두 개로 만드는 우회는 하지 않는다.

공통 `hwp5StructuralEditableStart(row)`는 원본 참조 관측값, 선두 구역/단 앵커 두 개, 오프셋 세 개와 두 보호 표식만 고정 비용으로 확인한다. 입증된 접두부는2, 나머지는0을 반환하며 임의 U+FFFC를 건너뛰지 않는다. Canvas는 이 경계를 선택 양 끝점과 탐색에 사용한다. 이 함수는 표시 경계일 뿐 참조 수명이나 편집 권한을 발급하지 않으며, canonical 선택 검증과 Native fence가 계속 적용된다.

문서 교체 시 Surface는 이전 Canvas 선택을 초기화하되 이 투영 작업을 Core의 선택 해제로 다시 게시하지 않는다. 새 ready 상태가 가진 canonical 선택은 새 문서 표시 뒤 활성 입력 lease에서만 투영한다. 새 문서에서 선택이 사라지던 실제 브라우저 반례는 SDK 초기 선택 생성과 화면 초기화를 분리해 확인했다. 이 화면 수정은 Native 생성·구조 제어 규칙을 바꾸지 않는다.

데모는 파일 메뉴·도구·설정 가능한 Ctrl/Cmd+N으로 진입하며, 같은 document admission으로 형식 선택과 교체를 처리한다. 저장 여부는 undo 가능성 대신 operationRevision/savedOperationRevision을 비교한다. 비교 전에 빈 `editor.update(() => {})`를 기다려 대기 입력·Native 변경·IME 조합의 기존 admission 경계를 통과한다. 저장된 revision과 같아 보인다는 이유로 이 대기를 생략하지 않는다. 교체 동의를 받은 뒤에도 같은 경계를 다시 기다린 후 문서·편집·저장 revision이 동의 전과 같은지 비교한다. 각 비동기 단계 뒤에는 취소 여부를 검사한다. 대기 중 다른 문서나 편집이 생기면 그 동의를 재사용하지 않으며 입력 반영 실패도 교체를 막는다. 저장하지 않은 변경의 교체 확인을 거부·취소하면 후보를 만들거나 `cancelLoad`를 호출하지 않고 기존 문서를 유지한다. 입력 표면이 없는 빈 편집기·잠긴 후보에서 빈 update는 Native 요청을 추가하지 않으며, 교체 거부 후 잠긴 후보를 다시 unlock할 수 있다. 포커스는 새 문서/선택이 실제 그려진 경우에만 반환한다.

검증은 source mock/Native 생성·편집·저장/실제 Core/실제 브라우저/배포를 구분한다. 원자료는 `zig-out/verification/table-range-new-document-r1/`이다. 초기 caret 수정 뒤 실제 HWP5/HWPX의 생성·첫 입력·게시된 caret에서 Enter·두 번째 문단 입력·undo/redo·저장·재열기를 확인한 Native/Core 6건은 `integration/newdoc-final-r6.json`과 로그가 소유한다. 초기 display0 반례와 실패 시 원시 바이트 보존은 별도 진단 증거로 남긴다. 이후 UI의 대기 입력 교체 반례는 수정 전 집중 검사6실패를 보존했고, 수정 후 관련 검사29개·소스 타입·lint·format이 통과했다. 이 UI 수정은 Core SDK·Native 변경을 요구하지 않으며 UI 번들 재생성과 실제 브라우저 증거는 별도로 확인한다. 소스 검사, Native/Core 성공과 기존 브라우저·배포 결과를 합산해 전체 지원 완료로 확대하지 않는다.

## 최종 통합 후보 확인

2026-11-06 R4 후보는 실제 브라우저의 Vanilla·React·Svelte × HWP5·HWPX 6개 조합에서 초기 커서, 첫 입력, Home/방향키/반복 Backspace, 한 문단 전체 선택 교체와 취소, Enter 뒤 두 번째 문단 입력 및 undo/redo를 통과했다. 빠른 입력 직후 이력 준비를 기다리지 않고 새 문서를 요청해도 취소 시 기존 텍스트를 보존했고, 동의 후에는 빈 새 문서와 빈 이력을 확인했다. Vanilla HWP5와 Svelte HWPX 두 조합은 실제 다운로드·독립 CFB/XML 검사·파일 재열기까지 확인했다. 브라우저의 신뢰된 키/입력 이벤트 증거이며 실제 OS 한글 IME 증거로 확대하지 않는다.

화면 초기 선택 수정의 통제 Surface/Canvas 검사는 신규7개와 기존65개를 각각 통과했다. 수정 전4실패와 최초 수정의 무효 입력 lease 반례도 보존했다. SDK를 다시 만든 최종 브라우저 결과는 `integration/R4-FINAL-AGGREGATE.json`이 소유한다. 표2개와 새 문서6개는 서로 다른 두 제한 실행이며 한 실행에서8개를 통과했다고 합산하지 않는다. 모든 소유 브라우저는 종료했고, 일시적으로 남아 보였던 프로세스도 재조회에서0개였다. 이는 전체 문서·모든 포맷 필드·모바일 완료를 뜻하지 않는다.

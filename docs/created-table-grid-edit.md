# 생성 표의 직사각형 격자 변경

이 모듈은 같은 편집 세션에서 생성한 병합 없는 `model.created_table.Table`의 행·열 삽입/삭제를 HWP5/HWPX 세션, optional WASM ABI, SDK와 CLI/MCP 배치 명령에 연결합니다. 원본 표·저장 후 재열어 원본이 된 표·병합/중첩 표는 지원 범위에 포함하지 않습니다. 생성 표의 Worker·헤드리스 명령과 웹 메뉴 연결은 아래 후속 범위를 따릅니다.

## 참고 자료와 정책의 구분

HWP5의 형식 근거는 한컴 [한글 문서 파일 구조 5.0 revision 1.2](https://cdn.hancom.com/link/docs/%ED%95%9C%EA%B8%80%EB%AC%B8%EC%84%9C%ED%8C%8C%EC%9D%BC%ED%98%95%EC%8B%9D_5.0_revision1.2.pdf)의 표 75·80입니다. 행·열 수와 셀 주소·병합 범위·폭·높이는 별도 필드입니다. 저장 구조를 담은 명세만으로 행·열 삽입 시 폭 분배 정책이나 한컴 UI의 동작까지 확정하지 않습니다. 로컬 Markdown 사본의 추가 파싱 주석도 공식 PDF 본문과 구분합니다.

HWPX의 이름·소유 관계는 [표 격자 구조 검사](hwpx-table-geometry.md)가 고정한 한컴 공개 모델과 OWPML 스키마를 따릅니다. `rowCnt`/`colCnt`, `cellAddr`, `cellSpan`, `cellSz`를 원본 관측 모듈과 혼동하지 않습니다. 이번 연결은 공식 필드 구조와 독립 생성/관측 결과를 근거로 구현했으며 rhwp 소스나 역분석 결과를 새로 열람하지 않았습니다. 기존 참조 이력은 유지하며 엄격한 clean-room 인증을 주장하지 않습니다.

## 공통 모델의 책임

`src/model/created_table_grid.zig`는 기존 생성 표의 행 우선 셀 배열을 새로운 소유 후보로 변환합니다. 기존 table identity·instance ID·resources와 남는 셀의 문단 ID·UTF-8 본문을 유지합니다. 삽입 셀은 호출자가 준비한 새 문단 ID와 빈 본문을 사용합니다. 문서 전체 ID 선택·충돌 검사는 형식별 세션의 책임이며 이 모듈의 표 내부 유일성 검사로 대체하지 않습니다.

행 삽입 위치는 0부터 행 수까지, 열 삽입 위치는 0부터 열 수까지 허용합니다. 삭제는 현재 존재하는 행·열만 대상이며 마지막 하나는 거부합니다. 행은 기존 균일 높이, 열은 기존 표 전체 폭을 기존 생성 plan의 분배 규칙으로 다시 나누는 정책입니다. 이는 새 직사각형 생성 표의 정책이며 원본의 비균일 열 너비·병합 셀·중첩 표에 자동 적용하지 않습니다.

준비는 원본을 수정하지 않고 별도 소유 후보를 반환합니다. 실패 시 후보의 부분 할당을 해제하고 원본 본문·ID·배열을 보존합니다. 결과 게시와 이력 반영은 상위 거래에서 처리해야 합니다. 셀 수·본문 바이트 예산을 적용하며 hash map으로 ID 중복을 검사해 셀 수와 본문 바이트에 비례하는 처리를 목표로 합니다. 문서 전체 파싱·저장·조판의 복잡도를 보장하는 계약은 아닙니다.

공통 모델의 Debug·ReleaseSafe 집중 검사는 각각 5개(대표 계약 4개와 import harness)가 통과했습니다. 독립 2차원 행렬로 모든 작은 격자의 삽입/삭제 경계·셀 본문/ID/순서·총 폭과 높이를 비교하고, 잘못된 원본·중복/0 ID·UTF-8·정확한 예산·오버플로·네 명령의 전체 할당 실패를 검사했습니다. `test-created-table-grid` 빌드 대상도 5/5 통과했습니다. 당시 검사는 모델 기반에 한정됐으며 아래 세션 연결 검증과 구분합니다. 근거는 `zig-out/verification/created-table-grid-r1/`입니다. 실행 명령의 단일 출처는 [개발·검증 명령](development-commands.md)입니다.

## 세션과 공개 명령

SDK의 `supportsCreatedTableGrid()`로 optional ABI 지원을 확인하고 다음처럼 호출합니다. `identity`는 생성 결과에서 얻은 0이 아닌 u64 십진 문자열입니다. `index`는 0 기반이며 action은 `insert-row`, `delete-row`, `insert-column`, `delete-column`입니다.

```js
editor.editCreatedTableGrid({ section: 0, identity: '1', action: 'insert-row', index: 1 });
```

CLI `apply`와 MCP `apply_document_changes`의 같은 patch 배열은 다음 항목을 받습니다. identity는 같은 거래 앞 단계의 표 생성 결과에 대응해야 하며 재열기 사이에 재사용하지 않습니다.

```json
{ "kind": "created-table-grid", "coordinates": "current-transaction", "section": 0,
  "identity": "1", "action": "insert-column", "index": 1 }
```

형식별 세션이 문서 전체 문단 ID와 충돌하지 않는 새 ID를 준비합니다. 공통 모델의 후보를 형식별 writer로 검증한 뒤 한 번 게시하고 이력 한 단계로 기록합니다. 잘못된 대상·위치·예산·할당 실패 시 원본 값과 이력을 보존합니다. SDK 요청은 getter를 실행하지 않고 own data 필드만 캡처하며 구형 WASM은 변경 전에 거부합니다. 새 ABI는 기존 ABI 6에 optional로 추가하며 숫자 action은 `js/abi-schema.mjs`와 생성된 Zig enum을 공유합니다.

## 연결 검증 결과

통제 소스의 ReleaseSafe 집중 빌드 대상은 HWP5 5개, HWPX 9개, wire 2개로 16/16 통과했습니다. 포맷별 Debug 검사도 통과했습니다. HWPX의 9개 중 2개는 import 초기화이며 기능 검사는 7개입니다. SDK·CLI 요청/기존 작업 회귀 검사는 53/53 통과했습니다.

새 WASM SHA256은 `a750d1d1a02ab48eab0d5eacfa6330a027e85e2722850ddea36eba35c833cb79`입니다. 고정 Noori HWP/HWPX의 실제 SDK 검사와 CLI/MCP 검사는 4/4 통과했습니다. 네 action의 셀 순서·본문·ID·크기, 한 단계 undo/redo와 저장 바이트 복원, 실패 후 redo 보존을 확인했습니다. 독립 CFB record/ZIP XML 비교기로 기존 표와 대상 외 스트림 보존을 검사했습니다. 원본 표의 확장 ListHeader는 생성 표의 26바이트 셀 꼬리로 추측 해석하지 않고 원시 레코드 보존으로 대조합니다. 원본 표 내부 삽입 시 부모 표가 달라지는 영향과 구분하기 위해 이 보존 검사는 독립적으로 찾은 최상위 일반 문단에 삽입합니다.

로컬 tarball 설치 후 126개 파일을 후보와 바이트 대조했고 설치된 CLI/MCP로 두 포맷의 실제 적용·동일 출력·후행 오류 시 출력 부재 검사 2/2를 통과했습니다. 증거는 `zig-out/verification/created-table-grid-connect-r1/`의 `native-final.log`, `installed-final.log`, `consumer-final.json`, `session-build.log`, `focused-controlled-final.log`입니다. 초기 실패 로그도 보존합니다. 이번 검사는 브라우저 UI·페이지 조판 동치·공개 배포의 증거가 아닙니다.

## Worker·헤드리스·웹 표 메뉴 연결

`EDIT_CREATED_TABLE_GRID_COMMAND`(`created-table-grid`)는 동일한 section/identity/action/index를 기존 Core 큐·토큰 검사와 Worker SDK 호출에 전달합니다. `createdTableGridAvailable`은 optional ABI의 실제 제공 여부로 관측하며 구형 엔진에서는 false입니다. Native 반영 직후 적용 사실을 기록하므로 이후 표시 갱신 실패를 미적용으로 보고 재시도하지 않습니다. 변경 뒤에는 셀을 다시 선택합니다.

생성 셀은 Core의 원본 문단 목록에 가짜 번호로 넣지 않습니다. Canvas가 실제 선택한 `createdCell` 주소를 `captureGeneratedTableGridSelection()`으로 캡처하고 Vanilla Surface가 Core state·문서/보기 수명·권한과 결속합니다. React·Svelte 데모는 같은 Surface 메서드를 전달합니다. 선택 A→B→A, 조합 입력·대기 입력·이력, 모달·닫힘·권한 변경 뒤 이전 캡처를 거부합니다. 일반 문단/원본 표의 ID나 serialized instance를 생성 identity로 추측하지 않습니다.

표 메뉴와 생성 셀 컨텍스트 메뉴는 ‘아래에 행 삽입’, ‘선택 행 삭제’, ‘오른쪽에 열 삽입’, ‘선택 열 삭제’를 제공합니다. 마지막 행·열 삭제와 원본 표 선택은 비활성화합니다. 실제 Canvas의 선택 변경은 Core null→null 관측만으로 누락될 수 있어, 데모의 소유 surface 이벤트 뒤 같은 포트를 다시 조회합니다.

통제 소스의 Worker/명령 연결 34개(실제 WASM 6개 포함), SDK 회귀 10개, 데모 집중 60개·Bun 8개와 실제 Canvas/Surface 집중 8개가 통과했습니다. `zig-out/verification/created-table-ui-r1/browser-six-r3`의 개발 서버 6개와 `browser-public-r1`의 배포용 정적 후보 6개는 Vanilla/React/Svelte × HWP5/HWPX에서 새 문서·2×2 표 생성·네 명령·undo/redo·다운로드·재열기·원본 표의 생성 명령 거부를 검사했습니다. 다운로드 결과는 별도 CFB 레코드/ZIP XML로 2×2 및 셀 문단 ID 유일성을 검사합니다. 실제 한글 프로그램 조판 동치나 원본 표 편집 완료를 뜻하지 않습니다.

공통 좌표 변환은 `src/model/table_grid_edit_plan.zig`가 소유하고 생성 모델과 두 원본 구현이 재사용합니다. 원본 표의 추가 기하·거부 범위는 [HWP5 계약](hwp5-source-table-grid.md)과 [HWPX 계약](hwpx-source-table-grid.md)을 따릅니다. 원본 표의 공개 파일 변환은 [파일 API](source-table-grid-file-api.md), 같은 세션의 SDK·Core·선택·메뉴와 undo 연결은 [열린 세션 편집 계약](source-table-grid-live-edit.md)이 소유합니다.

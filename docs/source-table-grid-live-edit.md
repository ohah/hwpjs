# 원본 표 격자의 열린 세션 편집

기존 생성 표 명령과 별도로 원본 표의 행·열 편집을 같은 Native 세션·이력에 연결합니다. Node 주소는 현재 보기에서만 유효하며, Core token과 Surface의 실제 셀 선택 lease가 다른 문서·보기·선택의 재사용을 거부합니다. 파일 단위 CLI/MCP의 SHA 참조는 [파일 API](source-table-grid-file-api.md)가 계속 소유합니다.

## 현재값과 원본 기준

원래 열린 컨테이너는 세션 종료까지 불변입니다. 각 구역의 현재 원본 기준과 그 위의 텍스트·서식 값이 Native SSOT를 이룹니다. 이력은 기존 native checkpoint·delta stack 하나를 확장하며 JS에 별도 명령 이력을 만들지 않습니다. 임시 저장 파일로 현재값을 물질화하고 기존 파일 변환기를 재사용하지만 CFB/ZIP 바이트를 undo 이력으로 보관하지 않습니다.

HWP5의 `model.Section.rebased_source`는 변경 후 구역 바이트·스타일 오프셋과 최초 record 개수를 소유합니다. checkpoint가 이를 깊게 복사하고 예산에 포함합니다. 복원 전에 framing·개수·스타일 오프셋·최초 소유 관계를 검증합니다. Session의 decoded/style-offset 배열은 현재 model 또는 불변 최초 원본을 빌리는 보기이며 교환·rollback·Section clone 뒤 갱신합니다. 일반 문서에 변경 원본 기준이 없으면 이 추가 순회를 하지 않습니다.

HWPX는 최초 tree의 Session 소유권과 현재 optional owned basis를 구분합니다. full checkpoint는 해당 tree 출처·locations·source 문단 기준과 편집값을 함께 복원합니다. 임시 tree·URI·locations의 깊은 복제는 기존 Meter에 청구하며 서로 다른 Session의 basis를 교환하지 않습니다. 공유 URI를 노드마다 다시 해시하지 않고 XML·고유 URI·위치와 요소 메타데이터를 한 번씩 처리합니다.

표 구조 변경은 v2의 기존 full/bridge 경로를 사용합니다. 전후 일반 입력은 기존 text delta 경로를 유지합니다. 삭제의 undo는 반대 명령 재실행이 아니라 이전 모델·basis 복원이므로 삭제된 본문과 서식도 돌아옵니다. 스칼라 실패·예산·할당 실패는 후보를 버리고 이전 값과 redo를 보존합니다.

## 명령과 표시

SDK의 `supportsSourceTableGrid()`와 `editSourceTableGrid({section, tableNode, expectedRows, expectedColumns, action, index, layout})`, Core의 `EDIT_SOURCE_TABLE_GRID_COMMAND`를 제공합니다. action은 `insert-row`, `delete-row`, `insert-column`, `delete-column`입니다. Native wire 숫자 0..3은 기존 ABI 스키마에서만 변환합니다. optional ABI6 export는 `hwp5_edit_source_table_grid`·`hwpx_edit_source_table_grid`이며 일곱 인자를 받습니다.

HWP5 웹 선택은 기존 Reader의 `observed8` 정책을 사용하며 파일 길이로 추측하지 않습니다. HWPX는 spec6/기본 0만 허용합니다. 변경 후 fresh full projection으로 주소·표·문단을 다시 게시하고 셀을 다시 선택합니다. Native 성공 뒤 projection이 실패한 경우 committed-refresh-required로 보고하며 자동 재실행하지 않습니다.

초기 HWPX load 결과는 enable 단계에서 재사용합니다. 콘텐츠의 ABI 제공 여부를 history 활성화 전의 false 값으로 고정하면 최초 편집에서 기능이 누락되는 반례를 확인했습니다. 콘텐츠는 실제 export 제공 여부를, 최상위 명령 capability는 history 활성화까지 확인하도록 분리해 기존 load 재사용을 유지했습니다. 일반 쓰기 정책과 Worker의 history guard도 적용합니다.

기존 네 행·열 메뉴와 컨텍스트 메뉴는 tagged source/generated lease router를 공유합니다. 원본 TABLE 노드를 생성 identity로 변환하지 않습니다. `captureSourceTableGridSelection()`은 실제 Canvas·Native table binding과 Core 상태의 일치를 확인하고 모달·조합·대기 입력·이력·재선택 이후 lease를 거부합니다.

## 지원 경계

두 형식 모두 완전한 직사각형 타일 격자를 지원합니다. 각 셀 크기를 축 경계의 차이 `prefix[end] - prefix[start]`로 취급하고, 표 전체 크기와 함께 모든 경계를 정확한 정수 합으로 결정해야 합니다. 모든 단일 span 값이 있으면 선형 직접 검증을 사용합니다. 단일 span 값이 없는 칸도 겹치는 원본 병합 구간의 합으로 유일하게 결정되면 허용합니다. 전 경계를 연결하지 못하는 입력은 `AmbiguousSourceTableTracks`, 모순이나 비양수 해는 기존 포맷별 기하 오류로 거부합니다. 평균 분할·반올림·부호 보정은 하지 않습니다. 변경 결과도 모든 축 경계를 다시 확정할 수 있어야 하므로 편집으로 마지막 결정 근거가 사라지면 원자 거부합니다. 전체 논리 slot 수는 기존 크기 한도를 따릅니다.

삽입선을 가로지르는 기존 병합 셀은 span과 크기를 늘리고 본문을 보존합니다. 빈 slot에는 인접 원본 셀의 반대 축 span·첫 문단 서식으로 빈 셀을 만듭니다. 삭제선을 가로지르는 span>1 셀은 줄어들며, anchor가 삭제돼도 살아 있는 셀의 모든 문단을 보존합니다. 해당 축 span=1 셀만 제거하고 undo는 제거된 본문도 복원합니다. 이는 공식 필드와 자체 모델에 근거한 편집 정책이며 한컴 UI의 병합 편집 결과와 동치라는 주장은 아닙니다.

중첩 표는 보호되지 않은 table/cell 조상 아래의 **leaf 대상 표**를 허용합니다. 대상 밖 부모/형제의 원시 바이트·본문은 보존하며 부모 크기를 자동 변경하지 않습니다. 공식 [표 안에 표 만들기](https://help.hancom.com/hoffice120/ko-KR/Hwp/table/table.htm)의 중첩 가능성과 부모보다 큰 자식이 가려질 수 있는 제한을 구분합니다. 대상 셀 자체에 중첩 개체가 있으면 여전히 거부합니다. 병합 HWPX의 row 재배치에서 국소 namespace 문맥을 옮기는 입력도 거부합니다.

[여러 plain 문단](source-table-grid-cell-paragraphs.md)·HWPX 다중 run/t 보존은 유지합니다. source 필드·개체·줄 캐시·불명확한 구조, 보호 셀/조상과 서명 등 기존 거부 정책은 유지합니다. 보류 중인 생성 표나 별도 cell style/background intent는 기존 remap 제한을 따릅니다. 생성표 전용 명령과 identity는 그대로 분리됩니다. 전체 병합/복합 표와 조판 동치는 후속 목표이며 현재 완료 범위가 아닙니다.

격리 확장 회귀는 `tests/table-grid/source-grid-native.test.mjs`와 `source-grid-interval-native.test.mjs`, 독립 literal matrix와 CFB/XML oracle를 사용합니다. 구간 합 기반 경계의 유일성, 원본 R1 WASM의 실제 거부 대조군, 모순·비양수 해 거부를 추가로 검증합니다. 이전 WASM 거부, 24개 실제 Native 긍정 경로, 원본/이력 불변 거부, 마지막 근거 삭제 거부, 실제 commit 뒤 잘못된 reply kind의 refresh-required/no-retry를 검사합니다. Core/Native 검사와 framework GUI·배포 증거는 별도로 보고합니다.


## 알려진 단순 캡션의 보존 입장

줄·칸 삽입/삭제는 알려진 단순 캡션을 가진 원본 표에도 적용합니다. 캡션 속성/본문을 설정하는 새 API는 추가하지 않습니다. 기존 파서의 typed owner/list와 현재 문단 그룹이 소유권의 단일 출처이며, 캡션 문단을 셀 paragraph 목록으로 취급하지 않습니다.

HWP5는 `table_lists`/`table_list_index`의 caption 분류와 `Groups`를 함께 확인합니다. 표시 위치가 위/아래여도 원본 caption list는 TABLE 앞에 위치합니다. 그룹의 일반 end에는 TABLE 경계가 포함될 수 있으므로, 실제 plain 문단 subtrees·개수와 TABLE까지의 경계를 별도로 일치시킨 뒤 전체 prefix bytes를 그대로 보존합니다. TABLE 뒤의 caption처럼 보이는 짧은 list를 길이로 재분류하거나 순서를 다시 쓰지 않습니다. Caption의 알려진 14바이트 필드와 list의 알려진 enum/비트만 허용하고, reserved/extension은 zero 값의 추가 byte도 포함해 거부합니다. 기존 object-common의 caption 존재 비트와 typed list의 실제 존재가 다르면 보정하지 않고 거부합니다.

HWPX는 기존 `table_caption_values`, `para_list_attributes`, `caption_list_owner`로 직접 caption/subList/p 소유 관계와 typed 값을 확인합니다. caption의 원래 table 자식 위치와 전체 XML bytes는 그대로 둡니다. 행 앞/뒤 위치와 표시 위/아래를 별개로 검증하며, 생략값을 기본값으로 정규화하지 않습니다. 캡션의 선언된 width/gap/lastWidth 등 source scalar는 고치지 않으며, 실제 문단 line cache나 list textWidth/textHeight cache를 허용한다는 뜻이 아닙니다.

한 caption/list 아래 하나 이상의 plain 문단·run/t만 허용합니다. field/자동번호 컨트롤, 줄 캐시, 연결 list/ref/cache, 중첩/복합 owner, 중복 caption/list, 알 수 없는 속성·자식·꼬리 확장은 명시적으로 거부합니다. 기존 merge/split의 지원 입장은 이 확장으로 바뀌지 않습니다.

독립 합성 캡션에는 한글·emoji와 여러 문단, 위/아래 표시 및 양/음수 gap을 넣습니다. 실제 `table-caption.hwp`/`.hwpx`는 자동번호·줄 캐시를 포함하므로 원본 그대로 거부·저장 불변 대조군으로 검사하며, 단순 캡션 긍정 cohort로 표시하지 않습니다. 오라클은 raw caption span과 원래 순서, 전체 CFB/XML target 및 다른 stream/part를 검사합니다. HWPX의 의미가 같은 quote 변경이나 HWP5 caption scalar 변경도 normal/-O 양쪽에서 거부합니다.


## 현재 검증

Native HWP5 집중 검사 6개는 텍스트·부분 굵게·격자·추가 입력·기울임을 섞은 v1/v2 snapshot·managed 이력, 네 명령과 삭제 본문 복원, 전체 할당 실패와 거부 후 redo 보존을 확인했습니다. HWPX 집중 검사 8개(기능 6개·import 2개)는 동일한 실파일 mixed 이력과 다중 구역의 후속 문단 좌표, 원본 불변성·OOM·거부 경로를 검사했습니다. 격리 소스의 실제 새 WASM Reader/Worker 네 조합도 네 명령·full projection·단일 Native 이력·저장 재열기를 통과했습니다. Core operationRevision은 거부 접수에도 번호를 예약하므로 연속 정수 대신 단조 증가와 Native 이력 한 단계 여부를 검증합니다.

초기 Source 선택·UI 검사 이후 격자 표시와 커서 이력 회귀를 추가했습니다. 최종 CI 집중 묶음은 Core·Surface 15개와 SDK 모형·선택·메뉴·커서 이력·COW schema 100개가 통과했습니다. 이 모형 검증은 실제 브라우저 E2E와 구분합니다. 상세 근거는 `zig-out/verification/source-table-live-r1/`에 보존합니다.

구역 기준 변경 후 suffix delta 조회에 공개 문단 번호를 그대로 사용하면 뒤 구역의 다른 문단을 수정하는 반례를 재현했습니다. 두 조회 모두 `sourceParagraph()`로 변환하고 lane의 공개 좌표는 유지합니다. 전용 synthetic 회귀는 v1/v2·managed/unmanaged·행 삽입/삭제에서 입력 대상, 저장 XML, 재열기와 undo/redo를 확인했습니다. 원본 기준·생성 표 회귀를 묶은 최종 Native 검사 49개가 통과했습니다.

새 `sourceTableGridAvailable` 필드가 owner-window COW 허용 목록에 빠져 일반 입력까지 full snapshot으로 내려가는 성능 회귀도 확인했습니다. 알려진 boolean 필드로만 허용하고, 다른 미지 필드와 잘못된 값은 계속 거부합니다. 실제 새 엔진의 SDK 18개, Reader/Worker 4개, 텍스트·Worker·모듈 소유권·COW 회귀 49개, 셀 표시·원시 XML 회귀 33개가 통과했습니다.

`showTableGrid`는 기본 false인 화면 전용 옵션입니다. 실제 셀 경계 안내선을 채움 뒤·인쇄 테두리 앞에 표시하며 Native 값·저장 서식·undo 이력을 변경하지 않습니다. 같은 옵션의 재설정은 선택 lease를 보존하고, 변경 후에는 기존 lease를 폐기합니다.

최초 브라우저 검사는 원본 표 redo 후 입력이 잠기는 문제를 발견했습니다. 문서 이력은 적용됐지만 목적 revision의 Canvas bookmark가 없었습니다. 검증된 명령 결과에 대해서만 변경 전후 bookmark를 기록하며, 표 노드 번호를 재사용하지 않고 동일 구역의 표 ordinal·개수와 새 셀·문단을 확인합니다. 보조 선택 정보만 기록하고 Native 문서 이력이나 unresolved barrier를 대체하지 않습니다. 전용 재현 2건의 실패를 보존했고 수정 후 전용 31개가 통과했습니다.

최종 공개 정적 후보의 실제 브라우저 6개 조합(Vanilla·React·Svelte × HWP5·HWPX)이 통과했습니다. 24개 원본 표 명령과 각각의 undo/redo, 6개 실제 키 입력·입력 취소, 최종 저장·재열기를 확인했습니다. 다운로드 102개는 독립 CFB/ZIP/XML 격자 오라클과 SHA를 대조했습니다. 브라우저 오류는 없었고 소유 세션 종료를 확인했습니다. 근거는 `browser-public-history-r1/`이며 두 최초 실패와 분리합니다. 공개 번들 manifest는 `6bda063f441d372e7a90a59fe31300f7e98aa651e8bb76642b47e44529179f34`입니다. 이 검증을 모든 문서·복합 표·조판 지원이나 npm 게시로 확대하지 않습니다.


## HWPX 셀 합치기

`MERGE_SOURCE_TABLE_CELLS_COMMAND`는 현재 Canvas의 셀 블록을 대상으로 합니다. 열린 세션의 표 크기, 직사각형 좌표, 셀의 소유 ID와 문단 목록을 Core에서 확인하고, Worker에 전달하기 전에 입력 정리와 최신 상태를 다시 검사합니다.

Native는 지원되는 원본 표에서 선택 셀의 문단을 행 우선 순서로 왼쪽 위 셀에 보존합니다. 다른 셀과 다른 패키지 부분을 보존하고 한 이력 항목을 기록합니다. 기존 셀 병합, 보호, 필드, 중첩 개체를 포함한 선택이나 확인되지 않은 표 구조는 거부됩니다. 도중에 거부되면 문서와 다시 실행 상태가 유지됩니다.

셀 블록을 유지할 메뉴는 활성 Canvas Surface의 등록 메서드를 통해 연결합니다. React·Svelte의 비동기 Surface 생성 때도 등록을 전달합니다. 입력 요소와 최신 선택의 소유권을 확인하며 메뉴 밖으로 포커스를 옮기면 선택 권한이 해제됩니다.

## 정규 CI와 과거 후보 비교

`bun tools/run-source-grid-regressions.mjs --wasm /absolute/current.wasm --out /absolute/new-evidence`는 새 문서·3×3 표를 현재 Native로 작성하고 명시적인 합성 병합/중첩/캡션 반례를 만든다. 현재 형식·저장 계약 104건을 정규 CI에서 독립 CFB/XML 일반/최적화·잘못된 기대값 반례와 검사한다. 실제 `table-caption` 두 입력은 추적된 공개 픽스처의 고정 경로를 사용한다. 해당 복합 자동번호/캐시 파일의 지원 확대는 별도 후보이며, 단순 캡션 검증으로 대체하지 않는다.

과거 미배포 R1/R2/중간 Native의 실제 비교 13건은 `source-grid-unreleased-compatibility.test.mjs`에 그대로 보존한다. `--legacy-compat`를 켜면 네 개의 명시적인 과거 WASM 환경변수가 모두 필요하며, 없으면 실패한다. 현재 입력 검증과 과거 바이너리 비교의 분모를 합쳐 정규 CI 117건이라고 보고하지 않는다. Main 통합에서는 104건과 같은 13건을 모두 실행해 이전 117건의 동작 범위를 유지한다.

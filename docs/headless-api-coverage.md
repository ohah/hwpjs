# Headless API 범위와 공식 WebHwpCtrl 대조

공식 WebHwpCtrl API와 공개 Core의 대응을 정리합니다. 2026-10-25 최초 조사 이후 후속 기능은 각 주제 계약에 따라 해당 행을 갱신합니다. 표의 API 존재를 최신 운영 배포나 모든 형식·대상의 검증 완료로 해석하지 않습니다. 구현·Native·브라우저·배포 근거는 연결된 주제 문서가 소유합니다.

실제 기본 붙여넣기·커서·저장 E2E는 [포커스 검증](native-clipboard-focus.md), 전수 감사 기준선의 oracle 미지원과 대형 문서 시간 제한은 [감사 공백 기록](headless-fixture-audit-gaps.md)이 소유한다. 이 inventory의 정적 지원 판정과 실행 검증 범위를 합산하지 않는다.

HWPX load 직후 enable의 표시 재사용·폐기·소유권과 실측은 [최초 활성화 계약](hwpx-load-enable-projection.md)을 따른다.

글자·문단 모양 창의 현재 제공 기능, 구현 중인 UI와 남은 원자 적용·조회·선택 검사·쓰기 계약은 [서식 대화상자](formatting-dialogs.md)를 따릅니다.

문자표의 선택·단일 삽입·커서 복원과 검증 한계는 [기호 삽입](symbol-insertion.md)을 따릅니다.

2026-11-06 선택 정정: 표 삽입과 문자·문단 원자 patch 및 조회 API는 현재 public 소스와 활성 공개 Core JS에 있습니다. 아래 부분 지원 표기는 UI 연결·타깃·capability 경계를 뜻하며 Native 전 필드의 known/쓰기·저장 완료를 뜻하지 않습니다. 로컬 dist와 활성 Core/Worker/EDE의 세대 및 검증 범위는 [웹한글 차이 감사](webhwp-gap-audit.md)를 따릅니다.

새 문서 생성은 [새 문서 명령](new-document-command.md)의 `createDocument`와 포맷별 생성기를 사용합니다. 원본 여러 셀·표 전체 테두리와 현재 셀의 통합 모양은 [범위 서식](table-range-formatting.md), 공식 창과의 차이는 [표 대화상자](table-dialog-reference.md)를 따릅니다.

## 기준과 책임

사용자 목표는 DOM 없이 문서를 읽고 편집·저장할 수 있는 API와 이를 사용하는 데모다. 공식 HwpCtrl 문서는 필요한 사용자 작업을 찾는 기준이며, ActiveX/기존 WebHwpCtrl의 이름·좌표·ParameterSet·UI를 동일 구현한다는 계약은 아니다. 레거시 호환 facade는 이후 선택 사항이다. HWP5/HWPX가 대상이며 HWP3는 범위 밖이다.

공식 1차 자료:

- [HwpCtrl Methods](https://developer.hancom.com/webhwp/devguide/hwpctrl/methods): 문서·선택·필드·개체·저장 및 host UI 메서드 목록.
- [HwpCtrl Properties](https://developer.hancom.com/webhwp/devguide/hwpctrl/properties): 서식·선택·컨트롤·페이지 속성 목록.
- 요청된 [HwpCtrl/action](https://developer.hancom.com/webhwp/devguide/hwpctrl/action)은 이번 조회에서 접근 실패했다. 공식 가이드의 별도 [Action](https://developer.hancom.com/webhwp/devguide/action), [Action Methods](https://developer.hancom.com/webhwp/devguide/action/methods), [Action Properties](https://developer.hancom.com/webhwp/devguide/action/properties)를 사용했다.
- [기본 사용법](https://developer.hancom.com/webhwp/devguide/usage)과 [Run](https://developer.hancom.com/webhwp/devguide/hwpctrl/methods/run): 공식 Action 객체 사용과 ID에 의한 실행을 확인했다. 개별 메서드 페이지 일부는 조회 도구에 제목만 노출되어, 목록에 없는 옵션·이벤트·반환형의 동등성을 추정하지 않았다.

판정 용어:

| 판정          | 의미                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| public 구현   | `@hwpjs/core` 공개 소스에서 이름과 동작 경계가 확인됨. 모든 문서/모든 서식 지원 또는 이번 실행 통과를 뜻하지 않음        |
| 부분          | public 경로는 있으나 공식 기능군 전체·관측 범위·형식/타깃 지원이 제한됨                                                  |
| 엔진/저수준만 | JS/WASM/내부 transport에 관련 기능이 있으나 전용 typed public core 계약이 없음. 해당 기능군 전체 엔진 구현을 뜻하지 않음 |
| public 미제공 | 해당 public core 계약을 확인하지 못함. 엔진 자체 미구현이라는 단정이 아님                                                |
| host 책임     | 파일 선택·다운로드·OS clipboard·DOM·Canvas·인쇄·UI 등. 순수 core의 대체 메서드로 억지로 넣지 않음                        |

public SSOT는 [index.ts](../packages/core/src/index.ts), [create-editor.ts](../packages/core/src/editor/create-editor.ts), [commands.ts](../packages/core/src/commands/commands.ts), [EditorState](../packages/core/src/state/editor-state.ts)다. runtime 주입은 [별도 runtime 진입점](../packages/core/src/runtime.ts)과 [package exports](../packages/core/package.json)를 따른다. 소스 공개와 빌드된 패키지 공개는 구분한다.

`js/`의 많은 파일이나 `hwpx-editor.mjs`/`hwp5-editor.mjs`의 메서드가 곧 `HeadlessEditor` API는 아니다. [surface-protocol.ts](../packages/core/src/commands/surface-protocol.ts)의 문자열 inventory도 내부 호환 transport 분류다. `requestExperimental`, `readResource`, `acquireInputSurface().request`가 일부 기능에 접근해도 독립 typed 명령·권한·좌표 계약의 완료로 계산하지 않는다.

## 현재 public core와 공식 작업군

다음 메서드 대조는 공식 Methods 목록의 항목을 기능별로 배치했다. 각 행의 판정은 의미 대응이며 동일 시그니처 호환을 뜻하지 않는다.

| 작업군             | 공식 HwpCtrl 메서드                                                                                | 현재 public core / 근거                                                                                                                             | 판정·남은 경계                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 문서 열기          | Open                                                                                               | `createEditor({runtimeFactory})`, `load(bytes,{format,editable,...})`, `unlock`, `cancelLoad`; `detectDocumentFormat`                               | public 구현. HWP5/HWPX bytes 입력, 암호/원본 정책 옵션은 명시적. URL 선택·파일 picker는 host            |
| 닫기·초기화        | Clear                                                                                              | `dispose()`는 terminal이며 재사용 clear가 아님                                                                                                      | 부분. 문서만 닫고 같은 editor를 재사용하거나 새 빈 문서를 만드는 public 메서드는 없음                   |
| 저장               | SaveAs                                                                                             | `save()` → `SaveResult.bytes/format/token 계열 식별 정보`                                                                                           | 부분. 현재 문서 저장이며 임의 형식 변환/경로 저장/PDF export와 같지 않음. 파일명·download는 host        |
| 내용 가져오기/삽입 | Insert, SetTextFile, GetTextFile | `INSERT_DOCUMENT_COMMAND`와 파일 메뉴의 HWPX 본문 삽입 | [HWPX 문서 삽입](hwpx-document-insert.md). 호환되는 단일 구역과 일반 본문부터 지원 |
| 텍스트 순회 | InitScan, GetText, GetTextBySet, GetPageText | 전체 텍스트 관측과 Canvas Surface의 `getPageText` | [쪽별 텍스트](canvas-page-text.md). 쪽별 물리 위치와 필터별 커버리지 제공 |
| 선택·이동          | GetPos, GetPosBySet, GetSelectedPos, GetSelectedPosBySet, SetPos, SetPosBySet, MovePos, SelectText | `state.selection`, `setSelection(SelectionTarget                                                                                                    | null)`; display owner/section/paragraph/UTF-16 단위와 token 검증                                        | public 구현(제한). 원본 list/paragraph/position 좌표와 동등하지 않으며 임의 컨트롤 이동까지 지원하지 않음 |
| 필드 조회·이동 | FieldExist, GetCurFieldName, GetFieldList, GetFieldText, MoveToField | `listNamedFields`, `readNamedField`, `moveToNamedField` | [이름 있는 필드](named-fields.md). HWP5/HWPX의 확인된 범위 지원 |
| 필드 생성·수정 | CreateField, PutFieldText, RenameField, SetCurFieldName, ModifyFieldProperties | `CREATE_NAMED_FIELD_COMMAND`, `SET_NAMED_FIELD_VALUE_COMMAND`, `RENAME_NAMED_FIELD_COMMAND`, `readNamedFieldParameters`, `SET_NAMED_FIELD_PARAMETERS_COMMAND` | [이름 있는 필드](named-fields.md). 확인된 HWPX 본문 누름틀의 생성·값·이름과 안내문·도움말 수정. 일반 HWP5 속성 쓰기는 후속 |
| 표·셀 주소         | GetTableCellAddr                                                                                   | 선택 owner와 snapshot을 소비하는 셀 내부 텍스트/서식 경로                                                                                           | 부분. 일반 텍스트 명령의 지원되는 CELL 타깃과 typed 셀 주소 API는 별개                                  |
| 개체 삽입/삭제     | InsertCtrl, DeleteCtrl                                                                             | `INSERT_TABLE_COMMAND`의 body caret 표 삽입; 폼·수식·차트 등은 개별 transport/저수준 모듈                                                           | 부분. 표 삽입은 public 명령과 데모 연결이 있음. 일반 개체 생성/삭제·컨트롤 tree public 계약은 별개      |
| 그림·배경          | InsertPicture, InsertBackgroundPicture                                                             | picture bytes 조회와 resize/geometry 저수준 경로                                                                                                    | 부분 저수준 기반. 이미지 삽입 public 명령이나 배경 그림 지원 완료가 아님                                |
| 페이지 이미지·인쇄 | CreatePageImage, CreatePageImageEx, PrintDocument | Canvas Surface의 `capturePrintPages`, `openPrintPreview` | [웹 인쇄 미리보기와 PDF](host-print.md). 쪽별 이미지·이미지 PDF·브라우저 인쇄 |
| 개요·메타데이터 | GetHeadingString, GetMetaTag, GetMetaTagAll, SetMetaTag | Canvas Surface의 `getHeadingString` | [캐럿 문단 글머리표](canvas-caret-heading.md). 확인된 문자 글머리표와 문단·개요 번호를 조회합니다. 메타태그 API는 후속 |
| 명령 생성·실행     | CreateAction, CreateSet, Run, ReplaceAction                                                        | `createCommand`, `dispatchCommand`, `registerCommand`, `update`; 아래 typed 명령 목록                                                               | 부분. Action ID/ParameterSet 호환 객체나 모든 액션 실행 API는 아님                                      |
| 명령 잠금          | IsCommandLock, LockCommand                                                                         | core token/status/권한 검증과 app의 command-support UI 상태                                                                                         | 부분(의미 다름). app disabled 상태는 엔진 권한의 SSOT가 아니며, 전역 이름 기반 잠금 public API 없음     |
| 맞춤법             | IsSpellCheckCompleted                                                                              | 대응 public API 없음                                                                                                                                | public 미제공. 외부 검사기 도입 여부 미결정                                                             |
| host UI 표시       | FoldRibbon, ShowCaret, ShowRibbon, ShowStatusBar, ShowToolBar                                      | 데모 shell/Canvas host가 소유                                                                                                                       | host 책임. core import에 DOM 접근을 추가하지 않음                                                       |

추가 작업군은 공식 Action/Properties와 함께 봐야 한다.

| 작업군                | 현재 계약                                                                                                                                                                                                                                                                                                                    | 판정·제한                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 텍스트 삽입·삭제·교체 | `SPLICE_TEXT_COMMAND`, `SpliceTextPayload.target/text/selectionVersion`                                                                                                                                                                                                                                                      | public 구현. 보호 필드/개체·clipped/unknown owner·stale selection은 실제 타깃 검증 결과를 따름                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 실행 취소·다시 실행   | `UNDO_COMMAND`, `REDO_COMMAND`, `editor.undo/redo`, `getHistoryAvailability`                                                                                                                                                                                                                                                 | public 구현. Native 이력이 SSOT; 새 command handler가 외부에서 처리했다는 사실만으로 Native 편집 완료가 되지는 않음                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 문자 서식             | `SET_CHARACTER_PROPERTIES_COMMAND`의 size/bold/italic, `SET_CHARACTER_UNDERLINE_COMMAND`, `SET_CHARACTER_STRIKE_COMMAND`, `SET_CHARACTER_TEXT_COLOR_COMMAND`, `SET_CHARACTER_FONT_NAME_COMMAND`; `APPLY_FORMATTING_PATCH_COMMAND`의 확장 문자 속성; `getSelectionFormatting`, `getFormattingCapabilities`, `queryFormatting` | 부분. 취소선과 `#RRGGBB` 글자색의 typed 명령·선택 조회가 소스에 있다. 글자색은 유효한 원본 바인딩·비어 있지 않은 편집 가능 선택·capability를 검증하며 RGB 변환은 Native 정책을 따른다. 독립 글자색 창은 소스에 연결되어 있으며 검증·게시 범위는 [대화상자 범위](formatting-dialogs.md)를 따름. 언어별 글꼴 이름의 typed 명령·선택 조회 경계는 [글꼴 이름 계약](headless-font-name.md)을 따른다. 확장 글자 모양 UI와 typed patch가 있으며 필드별 capability·조회 writable 검사를 따름. Native 모든 필드·타깃의 적용·저장 완료를 뜻하지 않음 |
| 문단 서식·구조        | `SET_PARAGRAPH_ALIGNMENT_COMMAND`; `APPLY_FORMATTING_PATCH_COMMAND`의 alignment/margins/spacing/grid/borderConnect/border/background/bullet; `getFormattingCapabilities`, `queryFormatting`                                                                                                                                         | 부분. [기존 글머리표 적용·해제](paragraph-bullet-editing.md)의 원본 HWPX 범위와 문단 모양 UI가 있으며 typed patch는 연결되어 있으며 필드별 capability·조회 writable 검사를 따름. 문단 split/merge의 전용 typed 계약과 전체 문단 속성 지원은 별개                                                                                                                                                                                                                                                                                                                                                                            |
| 찾기·바꾸기·통계      | 위 pure text helper + `setSelection`/splice 조합                                                                                                                                                                                                                                                                             | 부분. literal 순방향/역방향 match, 선택적 wraparound, 현재 snapshot 범위. 정규식·전체 replace transaction·한글의 통계 정의 동등성은 없음                                                                                                                                                                                                                                                                                                                                                                                                   |
| clipboard             | `getSelectionClipboard`가 plain text/target/copyReason/editReason/stateVersion 반환                                                                                                                                                                                                                                          | 부분. OS 권한·read/write·paste form은 host, rich clipboard/object 복사는 미제공. 비동기 결과는 selectionVersion/token을 다시 검증                                                                                                                                                                                                                                                                                                                                                                                                          |
| 양식·수식             | checkbox/radio/form-text/formula 등 내부 mutation 분류와 저수준 API                                                                                                                                                                                                                                                          | 엔진/저수준만. typed 조회/권한/명령/이력 계약을 기능별 공개해야 함                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 표 구조·배치 | `INSERT_TABLE_COMMAND`, `MERGE_SOURCE_TABLE_CELLS_COMMAND`, `SPLIT_SOURCE_TABLE_CELLS_COMMAND`, `EQUALIZE_SOURCE_TABLE_CELL_WIDTH_COMMAND`; 원본 셀 속성 experimental 포트 | 부분. [원본 셀 나누기](hwpx-source-cell-split.md)와 [너비 균등화](cell-width-equalization.md)는 소유 Surface가 발급한 대상과 확인된 원본 HWPX 정적 표부터 지원. HWP5 구조 편집·높이 균등화·생성/중첩 표 전체 지원과 구분 |
| media objects         | 그림/차트/수식/도형의 개별 source/query/edit 경로, 제한된 미리보기                                                                                                                                                                                                                                                           | 엔진/저수준만(일부). OLE 표시/실행·개체 전체 편집·삽입을 한 번에 지원한다고 쓰지 않음                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 페이지·layout         | state의 content/capabilities 관측, 제한된 resource query 및 host surface                                                                                                                                                                                                                                                     | 부분. 표준 typed page/layout model·완전한 재조판·PDF/bitmap export API는 미제공                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 변경·오류 이벤트      | `registerStateListener`, `registerUpdateListener`, `registerErrorListener`, 생성 시 `onError`; 해제 함수                                                                                                                                                                                                                     | public 구현. 공식 HwpCtrl 이벤트와 이름/발생 순서가 같은 호환 계약은 이번 문서에서 확인하지 않음                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 입력면 수명주기       | `acquireInputSurface` lease, composition commit/cancel, release                                                                                                                                                                                                                                                              | public host 연계 계약. DOM-free core와 실제 input/IME의 책임을 분리; 브라우저 이벤트 자체는 adapter가 소유                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## 공식 Properties와 상태 관측의 차이

| 공식 속성                                       | 현재 대응                                                                                          | 판정                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CharShape, ParaShape                            | `getSelectionFormatting`의 현재 지원 속성·mixed/null·capability reason                             | 부분. 전체 mutable property bag 아님                                                                                                                                                                                                                        |
| CellShape                                       | 원본 셀 크기·단색 배경·바깥 테두리의 experimental 포트와 데모, CELL 대상 서식 및 저수준 셀/표 정보 | 부분. [단일 셀 배경](cell-background-editing.md)·[셀 테두리](cell-border-editing.md)의 범위와 검증을 따름. 전용 typed property bag 미제공. 원본 여러 셀·표 전체의 테두리 배치는 [범위 서식](table-range-formatting.md)을 따름. 여러 셀 배경·대각선은 미지원 |
| CurFieldState                                   | 일반 `state.selection/capabilities`와 저수준 field 정보                                            | 부분 관측 기반. 같은 enum/필드 상태 public 계약 없음                                                                                                                                                                                                        |
| CurSelectedCtrl, HeadCtrl, LastCtrl, ParentCtrl | 일반 selection owner, 저수준 source references                                                     | public control tree API 미제공. snapshot을 mutable control 객체로 사용하지 않음                                                                                                                                                                             |
| EditMode                                        | load의 editable 옵션과 타깃별 runtime capability                                                   | 부분. 공식 편집 모드 enum/setter와 동일하지 않음                                                                                                                                                                                                            |
| PageCount                                       | preview/content 관측에 의존                                                                        | 전용 typed public 속성 미제공. 관측 페이지 수를 전체 조판 완료로 해석하지 않음                                                                                                                                                                              |
| SelectionMode                                   | `SelectionTarget` 또는 null                                                                        | 부분. 지원 타깃/affinity는 있으나 공식 선택 모드 enum 동등성 없음                                                                                                                                                                                           |

## Action과 typed command 책임

공식 Action의 `CreateSet`, `GetDefault`, `Execute`, `Run` 및 `ActID`/`SetID`는 액션·파라미터 객체 모델이다. `PopupDialog`는 UI 실행이다. 현재 core는 frozen typed command identity와 검증된 payload를 사용하며, 임의 문자열 Action ID 실행이나 mutable ParameterSet을 대체 구현하지 않는다. 대화상자는 app/host가 typed payload를 만들어 전달한다. [공식 Action 메서드](https://developer.hancom.com/webhwp/devguide/action/methods), [속성](https://developer.hancom.com/webhwp/devguide/action/properties).

명령별 SSOT 분담:

- core: 타깃·token·세대·좌표 검증, capability 관측, 명령 순서, 적용 여부와 실패 상태 구분. `update()`를 일반적인 다중 Native 명령 rollback transaction으로 주장하지 않는다.
- Native: 문서 모델·보호 권한·실제 변경·저장·이력. public wrapper의 enabled 상태는 권한을 대신하지 않는다.
- app: toolbar/form/대화상자, bridge 연결 목록, 파일·clipboard I/O 및 사용자에게 보이는 사유. [command-support.ts](../apps/demo/src/command-support.ts)는 UI 연결 상태 registry다. 미연결을 문서 미지원이나 엔진 미구현으로 표시하지 않는다.
- adapter/host: Canvas, DOM, pointer/IME, 접근성, 렌더링·인쇄·다운로드. React/Svelte/vanilla/RN의 view 상태를 문서 저장 SSOT로 사용하지 않는다.

## 다음 공개 명령군과 완료 조건

우선순위는 아래처럼 작은 수직 단위로 제안한다. 기존 엔진 기능부터 공개하되 ABI가 있다는 이유로 완료 처리하지 않는다.

| 다음 명령군               | 필요한 public 계약                                                                                       | 실물 검증 경계                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 필드·양식                 | typed field inventory/identity/선택·값 변경, 중복명/수식/보호/폼별 capability; 읽기와 변경 분리          | HWP5/HWPX 실제 필드·빈 필드·복수 필드·current/source 혼합. 원본 보호·dirty/continuation·필드 외부 문자 보존        |
| 표·셀 구조                | 기존 `INSERT_TABLE_COMMAND` 이후의 typed cell/행열·크기 변경 계약과 명시적 지원 범위                     | noori 등 실제 표 + 중첩/병합/새 생성 셀. 셀 외부·이력·저장/재열기 보존                                             |
| 문자/문단 확장·구조       | 기존 문자·문단 `APPLY_FORMATTING_PATCH_COMMAND`/조회 API의 타깃·필드 확장과 문단 split/join의 typed 승격 | 실제 혼합 서식·title/field/zero site·보호 구간. source+command 독립 XML/CFB 기대값                                 |
| 개체·media                | typed object identity/resource bytes/개별 편집; 그림·차트·수식부터 기능별 공개                           | 원본 관계/BinData·개체 외 XML/ZIP·배치 보존. OLE presentation 표시와 active OLE 실행은 분리하며 자동 실행하지 않음 |
| 문서 텍스트·layout/export | complete/partial 명시 텍스트 순회, typed 페이지 관측, 형식별 export capability                           | 긴/windowed 문서의 누락 검출. 페이지 수·이미지·인쇄는 동일 원본의 실제 조판 증거와 연결                            |
| 문서 관리·메타·facade     | 재사용 clear/new 문서, 명시적 메타 schema; 필요할 때만 HwpCtrl facade                                    | 취소/실패 시 기존 문서 유지, 리소스 해제·형식 보존. facade 부재를 core 편집 불가능과 혼동하지 않음                 |

모든 명령군의 승인 기준:

1. **DOM-free**: public entry import와 pure query에서 document/window/Worker/fetch getter를 호출하지 않는다. 주입 runtime으로 query→selection→typed command→save를 확인한다. unknown/보호/stale/다른 editor token, dispose/busy, 취소·경합·적용 후 refresh 실패를 음성 대조한다.
2. **실제 fixture + 명시 WASM**: 소스/WASM SHA와 사용 형식을 기록한다. read→edit→save→undo/redo→reopen을 검증하고 현재/재열기 동일 명령 결과를 비교한다. 필드/셀/개체 source binding, 비대상 part/stream과 ZIP/CFB metadata를 독립 oracle로 확인한다. 기대값은 원본+명령에서 만들며 실제 저장 결과로 생성하지 않는다. normal/최적화와 wrong-expected 음성 대조를 유지한다.
3. **E2E**: 공개 API를 사용하는 실제 bridge, trusted pointer/input/IME, toolbar 상태·selection·caret·정확한 화면/저장 증거를 검증한다. 전용 소유 session/server cleanup, 첫 실패 중단, 입력 재시도 없음. baseline layout limitation과 계측/CLI timeout을 제품 성공으로 바꾸지 않는다. host UI E2E와 DOM-free API 테스트는 별도 증거다.
4. **실패·자원**: 지원 범위를 늘리는 Native 변경에는 예산/overflow/OOM/clone·수명 검사를 별도로 요구한다. 거부는 문서 불변을 증명한다. 테스트 존재·합성 통과·저수준 decoder 성공을 전체 제품 지원으로 집계하지 않는다.

기존 소스 증거의 위치: [core integration tests](../packages/core/tests/integration/), [core state tests](../packages/core/tests/state/), [core editor tests](../packages/core/tests/editor/). 이 문서는 그 테스트들의 최신 통과 수를 주장하지 않으며, 보호된 사용자 staged 테스트는 조사 입력으로 읽지 않았다.

## 현재 데모의 퀵·문맥 메뉴 연결 후보

이 절은 `apps/demo/src/`의 소스 지원 범위이며 public core API의 새 권한이나 공식 WebHwpCtrl 메뉴 전체 동등성을 선언하지 않습니다. 검색 도구의 바꾸기, 도구 메뉴의 문서 통계, 서식 메뉴의 왼쪽·가운데·오른쪽·양쪽·배분·나눔 정렬은 기존 명령과 가용성 판정을 재사용합니다. 메뉴에 노출했다는 이유만으로 지원하지 않는 명령을 활성화하지 않습니다.

다중 문단의 public Core target이 없을 때 원본 body나 cell로 추정하지 않습니다. controller가 기존 Surface 선택 캡처의 `current()`를 문맥 메뉴에 전달하고, 메뉴는 Core 선택 키·자체 캡처 세대·Surface 현재성을 실행 전후 확인합니다. 메뉴가 오래됐거나 동기 재진입 중 선택·권한이 바뀌면 실행을 거부합니다. 실제 편집과 Native 원본 권한은 기존 명령 경로에 남습니다. 우클릭과 ContextMenu·Shift+F10 키 경로도 같은 소유 선택 검증을 거칩니다.

formatted-r2의 context 집중 검사는 기존39통과·3실패에서 후보42통과로, 노출 검사는 기존16통과·3실패에서 후보19통과로 바뀌었습니다. 서로 다른 검사 묶음이며 strict 검사는 context·command-support·shell과 정확한 controller 연결 식으로 제한됩니다. 전체 demo-controller·패키지 strict나 실제 Worker·Native·Canvas·브라우저·배포 완료의 증거가 아닙니다. 메뉴 가시성과 실제 키보드·포커스·다중 선택 동작은 아래 서로 다른 브라우저 검증 범위로 구분합니다. 과거 web/preview 앱의 메뉴 검증을 이 후보의 실제 성공으로 승계하지 않습니다.

### 현재 quick 후보의 HWP5 부분 검증

C2에서는 문단18:2→19:26의 다중 선택에서 우클릭 굵게 mixed→true와 undo mixed, Shift+F10, 다른 선택으로 이동했을 때 이전 메뉴 닫힘, 바꾸기·문서 통계 모달 실제 진입을 확인했습니다. 정렬4는 C2에서 DOM 존재만 확인했고 포인터 CLI 인자 오류로 멈췄습니다. 별도 C3에서 정수 좌표 포인터로 서식 메뉴를 열어 기존4 모두 visible·enabled·양수rect와 PNG를 확인했습니다. C3는 정렬 변경이나 C2의 굵게·이력 검사를 반복하지 않았습니다. 원실패를 보존하며 제품 실패로 단정하지 않습니다. 저장/재열기·전체 quick 메뉴 동등성·배포 완료로 확대하지 않습니다.

커서 관측·다음 입력과 생성 readonly 후속 후보의 경계는 [커서 입력 서식](collapsed-caret-formatting.md)을 따릅니다.

### 여섯 정렬의 소스 계약

추가 두 명령은 기존 `DISTRIBUTE`·`DISTRIBUTE_SPACE`에 연결하며 전자는 배분, 후자는 공백에만 배분하는 나눔 정렬입니다. label·지원 여부·변환은 기존 정렬 정본과 가용성을 재사용하며 controller의 새 편집 경로나 Native 권한을 추가하지 않습니다. 기존4의 가시성은 C3에서 확인했고, 후속 HWP5/HWPX 별도 cohort에서 메뉴6 노출과 추가2의 실제 적용·undo/redo를 확인했습니다. 모든6 정렬의 원본 조판·시각 동등성을 검증한 것은 아닙니다. 공식 primary 자료와의 의미 일치를 공식 화면 동등성으로 확대하지 않습니다.

최종 readonly 관측은 검증된 source 자료의 문자 속성과 알려진 문단 정렬 enum을 읽되 writer 권한을 확대하지 않습니다. 소스53 통과와 후속 형식별 실제 UI의 한정 범위는 [커서 입력 서식](collapsed-caret-formatting.md)의 관측·쓰기 경계를 따릅니다.

### 완료 결과와 host 수명

단일 Core 서식 명령의 포커스 복귀는 오류 없는 committed-with-snapshot 또는 known-no-op의 실제 result.state와 현재 host에 묶입니다. 외부 status/result callback 뒤 exact state·host·dispose를 다시 확인하고 기존 focus를 한 번만 요청합니다. Surface의 자체 모달 lease와 선택 현재성 검사는 유지하며 다른 선택의 존재로 통과시키지 않습니다. 접힌 커서의 HWP5/HWPX 실제 입력·원서식 복원 범위와 reset·저장 미검증은 [커서 입력 서식](collapsed-caret-formatting.md)을 따릅니다. QA E2E 통과는 실제 운영 배포 검증과 별도입니다.

### 추가 두 정렬의 실제 HWP5·HWPX 검증

각 한 문서의 별도 cohort에서 JUSTIFY→DISTRIBUTE→DISTRIBUTE_SPACE→undo DISTRIBUTE→redo DISTRIBUTE_SPACE를 확인했습니다. operation/view는 각 단계1→2→3→4→5였고 원래 ready 조건·예상 pressed·textarea focus·논리/painted caret0:18:2를 유지했습니다. 각 적용·undo·redo는 한 번씩이며 추가 클릭이나 Native 재시도는 없었습니다. 메뉴6의 실제 노출·양수rect·PNG와, HWPX에서 막대의 새2 항목도 확인했습니다.

HWPX의 완료 poll은 감시·전송을 포함한 관측이므로 응답 속도나 성능 보장으로 쓰지 않습니다. 원래 준비·조기관측·포커스 실패와 성공은 각각 보존합니다. 저장·재열기·Native 필드 독립 해독과 모든6 정렬의 조판 동등성·전체 UI 완료는 이 검증 범위가 아닙니다. 양 형식의 소유 Chrome 종료·독립 PS 빈 목록·정확한 postHTTP manifest는 기능 근거와 별도로 확인했습니다. QA 후보의 검증을 운영·공개 배포 완료로 승계하지 않습니다.

원본 HWPX 표의 전체 열을 포함한 비병합 행 블록에는 `EQUALIZE_SOURCE_TABLE_CELL_HEIGHT_COMMAND`를 제공합니다. 현재 Surface가 발급한 측정 포함 target만 허용하며 범위·실패 원자성과 실제 검증은 [셀 높이 균등화](cell-height-equalization.md)를 따릅니다.

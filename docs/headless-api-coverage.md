# Headless API 범위와 공식 WebHwpCtrl 대조

기준일: 2026-10-25. 현재 작업 트리의 **public core 소스**를 읽은 설계·범위 inventory다. 배포 패키지/dist와 최신 WASM의 일치, 각 행의 실행 성공을 새로 검증한 결과가 아니다. 이 조사에서는 빌드·Native·브라우저를 실행하지 않았다. 병렬 개발로 API가 바뀌면 아래 public 진입점부터 갱신한다.

실제 기본 붙여넣기·커서·저장 E2E는 [포커스 검증](native-clipboard-focus.md), 전수 감사 기준선의 oracle 미지원과 대형 문서 시간 제한은 [감사 공백 기록](headless-fixture-audit-gaps.md)이 소유한다. 이 inventory의 정적 지원 판정과 실행 검증 범위를 합산하지 않는다.

HWPX load 직후 enable의 표시 재사용·폐기·소유권과 실측은 [최초 활성화 계약](hwpx-load-enable-projection.md)을 따른다.

글자·문단 모양 창의 현재 제공 기능, 구현 중인 UI와 남은 원자 적용·조회·선택 검사·쓰기 계약은 [서식 대화상자](formatting-dialogs.md)를 따릅니다.

## 기준과 책임

사용자 목표는 DOM 없이 문서를 읽고 편집·저장할 수 있는 API와 이를 사용하는 데모다. 공식 HwpCtrl 문서는 필요한 사용자 작업을 찾는 기준이며, ActiveX/기존 WebHwpCtrl의 이름·좌표·ParameterSet·UI를 동일 구현한다는 계약은 아니다. 레거시 호환 facade는 이후 선택 사항이다. HWP5/HWPX가 대상이며 HWP3는 범위 밖이다.

공식 1차 자료:

- [HwpCtrl Methods](https://developer.hancom.com/webhwp/devguide/hwpctrl/methods): 문서·선택·필드·개체·저장 및 host UI 메서드 목록.
- [HwpCtrl Properties](https://developer.hancom.com/webhwp/devguide/hwpctrl/properties): 서식·선택·컨트롤·페이지 속성 목록.
- 요청된 [HwpCtrl/action](https://developer.hancom.com/webhwp/devguide/hwpctrl/action)은 이번 조회에서 접근 실패했다. 공식 가이드의 별도 [Action](https://developer.hancom.com/webhwp/devguide/action), [Action Methods](https://developer.hancom.com/webhwp/devguide/action/methods), [Action Properties](https://developer.hancom.com/webhwp/devguide/action/properties)를 사용했다.
- [기본 사용법](https://developer.hancom.com/webhwp/devguide/usage)과 [Run](https://developer.hancom.com/webhwp/devguide/hwpctrl/methods/run): 공식 Action 객체 사용과 ID에 의한 실행을 확인했다. 개별 메서드 페이지 일부는 조회 도구에 제목만 노출되어, 목록에 없는 옵션·이벤트·반환형의 동등성을 추정하지 않았다.

판정 용어:

| 판정 | 의미 |
| --- | --- |
| public 구현 | `@hwpjs/core` 공개 소스에서 이름과 동작 경계가 확인됨. 모든 문서/모든 서식 지원 또는 이번 실행 통과를 뜻하지 않음 |
| 부분 | public 경로는 있으나 공식 기능군 전체·관측 범위·형식/타깃 지원이 제한됨 |
| 엔진/저수준만 | JS/WASM/내부 transport에 관련 기능이 있으나 전용 typed public core 계약이 없음. 해당 기능군 전체 엔진 구현을 뜻하지 않음 |
| public 미제공 | 해당 public core 계약을 확인하지 못함. 엔진 자체 미구현이라는 단정이 아님 |
| host 책임 | 파일 선택·다운로드·OS clipboard·DOM·Canvas·인쇄·UI 등. 순수 core의 대체 메서드로 억지로 넣지 않음 |

public SSOT는 [index.ts](../packages/core/src/index.ts), [create-editor.ts](../packages/core/src/editor/create-editor.ts), [commands.ts](../packages/core/src/commands/commands.ts), [EditorState](../packages/core/src/state/editor-state.ts)다. runtime 주입은 [별도 runtime 진입점](../packages/core/src/runtime.ts)과 [package exports](../packages/core/package.json)를 따른다. 소스 공개와 빌드된 패키지 공개는 구분한다.

`js/`의 많은 파일이나 `hwpx-editor.mjs`/`hwp5-editor.mjs`의 메서드가 곧 `HeadlessEditor` API는 아니다. [surface-protocol.ts](../packages/core/src/commands/surface-protocol.ts)의 문자열 inventory도 내부 호환 transport 분류다. `requestExperimental`, `readResource`, `acquireInputSurface().request`가 일부 기능에 접근해도 독립 typed 명령·권한·좌표 계약의 완료로 계산하지 않는다.

## 현재 public core와 공식 작업군

다음 메서드 대조는 공식 Methods 목록의 항목을 기능별로 배치했다. 각 행의 판정은 의미 대응이며 동일 시그니처 호환을 뜻하지 않는다.

| 작업군 | 공식 HwpCtrl 메서드 | 현재 public core / 근거 | 판정·남은 경계 |
| --- | --- | --- | --- |
| 문서 열기 | Open | `createEditor({runtimeFactory})`, `load(bytes,{format,editable,...})`, `unlock`, `cancelLoad`; `detectDocumentFormat` | public 구현. HWP5/HWPX bytes 입력, 암호/원본 정책 옵션은 명시적. URL 선택·파일 picker는 host |
| 닫기·초기화 | Clear | `dispose()`는 terminal이며 재사용 clear가 아님 | 부분. 문서만 닫고 같은 editor를 재사용하거나 새 빈 문서를 만드는 public 메서드는 없음 |
| 저장 | SaveAs | `save()` → `SaveResult.bytes/format/token 계열 식별 정보` | 부분. 현재 문서 저장이며 임의 형식 변환/경로 저장/PDF export와 같지 않음. 파일명·download는 host |
| 내용 가져오기/삽입 | Insert, SetTextFile, GetTextFile | `load`와 `SPLICE_TEXT_COMMAND`는 각각 전체 bytes 교체와 선택 텍스트 교체 | 부분. 파일 병합·HTML/RTF 등 가져오기/내보내기 계약은 public 미제공 |
| 텍스트 순회 | InitScan, GetText, GetTextBySet, ReleaseScan, GetPageText | `EditorState.content`는 owned `unknown` 관측값. `findTextMatch`, `selectionMatchesText`, `getDocumentTextStatistics`는 현재 display snapshot을 사용 | 부분. 페이지별 전체 텍스트/scan cursor facade 없음. 잘리거나 windowed 관측을 전체 문서로 주장하지 않음 |
| 선택·이동 | GetPos, GetPosBySet, GetSelectedPos, GetSelectedPosBySet, SetPos, SetPosBySet, MovePos, SelectText | `state.selection`, `setSelection(SelectionTarget|null)`; display owner/section/paragraph/UTF-16 단위와 token 검증 | public 구현(제한). 원본 list/paragraph/position 좌표와 동등하지 않으며 임의 컨트롤 이동까지 지원하지 않음 |
| 필드 조회·이동 | FieldExist, GetCurFieldName, GetFieldList, GetFieldText, MoveToField | `js/hwpx-editor.mjs`의 `fieldLabels`, `fieldRangeTarget`; HWP5 field source 모듈 | 엔진/저수준만. 필드 ID/이름/중복명/현재 위치의 typed public 조회·선택 계약 필요 |
| 필드 생성·수정 | CreateField, PutFieldText, RenameField, SetCurFieldName, ModifyFieldProperties | 기존 field/formula/form transport와 저수준 편집 기능은 존재 | 부분 저수준 기반, 전용 public 필드 명령 미제공. 임의 필드 생성/이름 변경 지원을 이 근거로 주장하지 않음 |
| 표·셀 주소 | GetTableCellAddr | 선택 owner와 snapshot을 소비하는 셀 내부 텍스트/서식 경로 | 부분. 일반 텍스트 명령의 지원되는 CELL 타깃과 typed 셀 주소 API는 별개 |
| 개체 삽입/삭제 | InsertCtrl, DeleteCtrl | 내부 `insert-table`, 폼·수식·차트 등 개별 transport/저수준 모듈 | 엔진/저수준만(일부). 일반 개체 생성/삭제·컨트롤 tree public 계약 없음 |
| 그림·배경 | InsertPicture, InsertBackgroundPicture | picture bytes 조회와 resize/geometry 저수준 경로 | 부분 저수준 기반. 이미지 삽입 public 명령이나 배경 그림 지원 완료가 아님 |
| 페이지 이미지·인쇄 | CreatePageImage, CreatePageImageEx, PrintDocument | core에는 전용 메서드 없음. Canvas surface/미리보기는 adapter/web 계층 | public 미제공 + host 책임. Canvas 표시를 완전 조판·페이지 export 증거로 쓰지 않음 |
| 개요·메타데이터 | GetHeadingString, GetMetaTag, GetMetaTagAll, SetMetaTag | 범용 typed public 대응 없음 | public 미제공. raw snapshot 값이 있더라도 공통 스키마 계약은 별도 필요 |
| 명령 생성·실행 | CreateAction, CreateSet, Run, ReplaceAction | `createCommand`, `dispatchCommand`, `registerCommand`, `update`; 아래 typed 명령 목록 | 부분. Action ID/ParameterSet 호환 객체나 모든 액션 실행 API는 아님 |
| 명령 잠금 | IsCommandLock, LockCommand | core token/status/권한 검증과 app의 command-support UI 상태 | 부분(의미 다름). app disabled 상태는 엔진 권한의 SSOT가 아니며, 전역 이름 기반 잠금 public API 없음 |
| 맞춤법 | IsSpellCheckCompleted | 대응 public API 없음 | public 미제공. 외부 검사기 도입 여부 미결정 |
| host UI 표시 | FoldRibbon, ShowCaret, ShowRibbon, ShowStatusBar, ShowToolBar | 데모 shell/Canvas host가 소유 | host 책임. core import에 DOM 접근을 추가하지 않음 |

추가 작업군은 공식 Action/Properties와 함께 봐야 한다.

| 작업군 | 현재 계약 | 판정·제한 |
| --- | --- | --- |
| 텍스트 삽입·삭제·교체 | `SPLICE_TEXT_COMMAND`, `SpliceTextPayload.target/text/selectionVersion` | public 구현. 보호 필드/개체·clipped/unknown owner·stale selection은 실제 타깃 검증 결과를 따름 |
| 실행 취소·다시 실행 | `UNDO_COMMAND`, `REDO_COMMAND`, `editor.undo/redo`, `getHistoryAvailability` | public 구현. Native 이력이 SSOT; 새 command handler가 외부에서 처리했다는 사실만으로 Native 편집 완료가 되지는 않음 |
| 문자 서식 | `SET_CHARACTER_PROPERTIES_COMMAND`의 size/bold/italic, `SET_CHARACTER_UNDERLINE_COMMAND`, `SET_CHARACTER_STRIKE_COMMAND`, `SET_CHARACTER_TEXT_COLOR_COMMAND`, `SET_CHARACTER_FONT_NAME_COMMAND`; `getSelectionFormatting` | 부분. 취소선과 `#RRGGBB` 글자색의 typed 명령·선택 조회가 소스에 있다. 글자색은 유효한 원본 바인딩·비어 있지 않은 편집 가능 선택·capability를 검증하며 RGB 변환은 Native 정책을 따른다. 독립 글자색 창은 소스에 연결되어 있으며 검증·게시 범위는 [대화상자 범위](formatting-dialogs.md)를 따름. 언어별 글꼴 이름의 typed 명령·선택 조회 경계는 [글꼴 이름 계약](headless-font-name.md)을 따른다. 글꼴의 모든 속성·음영·모든 효과의 공개 완료를 뜻하지 않음 |
| 문단 서식·구조 | `SET_PARAGRAPH_ALIGNMENT_COMMAND`; split/merge/spacing/margins는 내부 transport에 존재 | 부분. 일반 문단 구조 및 전체 문단 속성 typed public 명령 필요 |
| 찾기·바꾸기·통계 | 위 pure text helper + `setSelection`/splice 조합 | 부분. literal 순방향/역방향 match, 선택적 wraparound, 현재 snapshot 범위. 정규식·전체 replace transaction·한글의 통계 정의 동등성은 없음 |
| clipboard | `getSelectionClipboard`가 plain text/target/copyReason/editReason/stateVersion 반환 | 부분. OS 권한·read/write·paste form은 host, rich clipboard/object 복사는 미제공. 비동기 결과는 selectionVersion/token을 다시 검증 |
| 양식·수식 | checkbox/radio/form-text/formula 등 내부 mutation 분류와 저수준 API | 엔진/저수준만. typed 조회/권한/명령/이력 계약을 기능별 공개해야 함 |
| 표 구조·배치 | insert-table/cell-size/table-column-width 등 내부 경로 | 엔진/저수준만. 셀 내 문자·정렬 public 기능이 표 생성/행열 조작 public 지원을 뜻하지 않음 |
| media objects | 그림/차트/수식/도형의 개별 source/query/edit 경로, 제한된 미리보기 | 엔진/저수준만(일부). OLE 표시/실행·개체 전체 편집·삽입을 한 번에 지원한다고 쓰지 않음 |
| 페이지·layout | state의 content/capabilities 관측, 제한된 resource query 및 host surface | 부분. 표준 typed page/layout model·완전한 재조판·PDF/bitmap export API는 미제공 |
| 변경·오류 이벤트 | `registerStateListener`, `registerUpdateListener`, `registerErrorListener`, 생성 시 `onError`; 해제 함수 | public 구현. 공식 HwpCtrl 이벤트와 이름/발생 순서가 같은 호환 계약은 이번 문서에서 확인하지 않음 |
| 입력면 수명주기 | `acquireInputSurface` lease, composition commit/cancel, release | public host 연계 계약. DOM-free core와 실제 input/IME의 책임을 분리; 브라우저 이벤트 자체는 adapter가 소유 |

## 공식 Properties와 상태 관측의 차이

| 공식 속성 | 현재 대응 | 판정 |
| --- | --- | --- |
| CharShape, ParaShape | `getSelectionFormatting`의 현재 지원 속성·mixed/null·capability reason | 부분. 전체 mutable property bag 아님 |
| CellShape | CELL 대상 서식 명령과 저수준 셀/표 정보 | 엔진/저수준 기반. 전용 typed property bag 미제공 |
| CurFieldState | 일반 `state.selection/capabilities`와 저수준 field 정보 | 부분 관측 기반. 같은 enum/필드 상태 public 계약 없음 |
| CurSelectedCtrl, HeadCtrl, LastCtrl, ParentCtrl | 일반 selection owner, 저수준 source references | public control tree API 미제공. snapshot을 mutable control 객체로 사용하지 않음 |
| EditMode | load의 editable 옵션과 타깃별 runtime capability | 부분. 공식 편집 모드 enum/setter와 동일하지 않음 |
| PageCount | preview/content 관측에 의존 | 전용 typed public 속성 미제공. 관측 페이지 수를 전체 조판 완료로 해석하지 않음 |
| SelectionMode | `SelectionTarget` 또는 null | 부분. 지원 타깃/affinity는 있으나 공식 선택 모드 enum 동등성 없음 |

## Action과 typed command 책임

공식 Action의 `CreateSet`, `GetDefault`, `Execute`, `Run` 및 `ActID`/`SetID`는 액션·파라미터 객체 모델이다. `PopupDialog`는 UI 실행이다. 현재 core는 frozen typed command identity와 검증된 payload를 사용하며, 임의 문자열 Action ID 실행이나 mutable ParameterSet을 대체 구현하지 않는다. 대화상자는 app/host가 typed payload를 만들어 전달한다. [공식 Action 메서드](https://developer.hancom.com/webhwp/devguide/action/methods), [속성](https://developer.hancom.com/webhwp/devguide/action/properties).

명령별 SSOT 분담:

- core: 타깃·token·세대·좌표 검증, capability 관측, 명령 순서, 적용 여부와 실패 상태 구분. `update()`를 일반적인 다중 Native 명령 rollback transaction으로 주장하지 않는다.
- Native: 문서 모델·보호 권한·실제 변경·저장·이력. public wrapper의 enabled 상태는 권한을 대신하지 않는다.
- app: toolbar/form/대화상자, bridge 연결 목록, 파일·clipboard I/O 및 사용자에게 보이는 사유. [command-support.ts](../apps/demo/src/command-support.ts)는 UI 연결 상태 registry다. 미연결을 문서 미지원이나 엔진 미구현으로 표시하지 않는다.
- adapter/host: Canvas, DOM, pointer/IME, 접근성, 렌더링·인쇄·다운로드. React/Svelte/vanilla/RN의 view 상태를 문서 저장 SSOT로 사용하지 않는다.

## 다음 공개 명령군과 완료 조건

우선순위는 아래처럼 작은 수직 단위로 제안한다. 기존 엔진 기능부터 공개하되 ABI가 있다는 이유로 완료 처리하지 않는다.

| 다음 명령군 | 필요한 public 계약 | 실물 검증 경계 |
| --- | --- | --- |
| 필드·양식 | typed field inventory/identity/선택·값 변경, 중복명/수식/보호/폼별 capability; 읽기와 변경 분리 | HWP5/HWPX 실제 필드·빈 필드·복수 필드·current/source 혼합. 원본 보호·dirty/continuation·필드 외부 문자 보존 |
| 표·셀 구조 | typed table/cell target, 생성·행열/크기 변경의 명시적 지원 범위 | noori 등 실제 표 + 중첩/병합/새 생성 셀. 셀 외부·이력·저장/재열기 보존 |
| 문자/문단 확장·구조 | 글꼴, 문단 split/join 등 기존 경로의 typed 승격과 문자·문단 속성의 원자 통합 적용 확장 | 실제 혼합 서식·title/field/zero site·보호 구간. source+command 독립 XML/CFB 기대값 |
| 개체·media | typed object identity/resource bytes/개별 편집; 그림·차트·수식부터 기능별 공개 | 원본 관계/BinData·개체 외 XML/ZIP·배치 보존. OLE presentation 표시와 active OLE 실행은 분리하며 자동 실행하지 않음 |
| 문서 텍스트·layout/export | complete/partial 명시 텍스트 순회, typed 페이지 관측, 형식별 export capability | 긴/windowed 문서의 누락 검출. 페이지 수·이미지·인쇄는 동일 원본의 실제 조판 증거와 연결 |
| 문서 관리·메타·facade | 재사용 clear/new 문서, 명시적 메타 schema; 필요할 때만 HwpCtrl facade | 취소/실패 시 기존 문서 유지, 리소스 해제·형식 보존. facade 부재를 core 편집 불가능과 혼동하지 않음 |

모든 명령군의 승인 기준:

1. **DOM-free**: public entry import와 pure query에서 document/window/Worker/fetch getter를 호출하지 않는다. 주입 runtime으로 query→selection→typed command→save를 확인한다. unknown/보호/stale/다른 editor token, dispose/busy, 취소·경합·적용 후 refresh 실패를 음성 대조한다.
2. **실제 fixture + 명시 WASM**: 소스/WASM SHA와 사용 형식을 기록한다. read→edit→save→undo/redo→reopen을 검증하고 현재/재열기 동일 명령 결과를 비교한다. 필드/셀/개체 source binding, 비대상 part/stream과 ZIP/CFB metadata를 독립 oracle로 확인한다. 기대값은 원본+명령에서 만들며 실제 저장 결과로 생성하지 않는다. normal/최적화와 wrong-expected 음성 대조를 유지한다.
3. **E2E**: 공개 API를 사용하는 실제 bridge, trusted pointer/input/IME, toolbar 상태·selection·caret·정확한 화면/저장 증거를 검증한다. 전용 소유 session/server cleanup, 첫 실패 중단, 입력 재시도 없음. baseline layout limitation과 계측/CLI timeout을 제품 성공으로 바꾸지 않는다. host UI E2E와 DOM-free API 테스트는 별도 증거다.
4. **실패·자원**: 지원 범위를 늘리는 Native 변경에는 예산/overflow/OOM/clone·수명 검사를 별도로 요구한다. 거부는 문서 불변을 증명한다. 테스트 존재·합성 통과·저수준 decoder 성공을 전체 제품 지원으로 집계하지 않는다.

기존 소스 증거의 위치: [core integration tests](../packages/core/tests/integration/), [core state tests](../packages/core/tests/state/), [core editor tests](../packages/core/tests/editor/). 이 문서는 그 테스트들의 최신 통과 수를 주장하지 않으며, 보호된 사용자 staged 테스트는 조사 입력으로 읽지 않았다.

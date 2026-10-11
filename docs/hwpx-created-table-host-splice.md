# 생성 표와 일반 본문 splice 거래

생성 표와 source 필드 라벨의 동시 편집·선택적 지원 조회·검증은 [별도 계약](hwpx-created-table-field-label.md)이 소유합니다.

검증 후보의 기본/외부 WASM 반영은 완료했습니다. 현재 산출물·백업·외부 해시·반영 후 검사는 [승격 기록](hwpx-table-creation-promotion.md)이 소유합니다. 아래 각 후보 검증 당시의 미반영 문장은 과거 상태입니다.

## 배포 후보의 깨끗한 체크아웃 검증

후속 실제 Chromium 검증: 후보에서 기본2×2표의 첫 셀 새 셀😀<&와 source 본문 기울임본문😀<&진하게를 입력하고 실제 다운로드했습니다. 다운로드본을 별도 브라우저 검증에서11문단 로딩 완료 후 다시 열어 본문 기울임본문😀<& + U+FFFC + 진하게 및 첫 셀의 정확한 문자열을 각각 찾았습니다. U+FFFC는 저장 후 원본 개체로 읽힌 표의 표시 표식입니다. 이를 빠뜨린 최초 exact-string 대기는 실패했고 실제 값을 읽어 수정한 기대와 각각 대조했습니다. 해당 실패를 성공으로 계수하지 않았습니다. 오류 조회는 비어 있었으며 소유 브라우저 세션들은 종료했습니다. 기록·스크린샷·실제 다운로드는 `/tmp/hwpjs-field-host-release.EeC25U/qa/`입니다. 기본 데모 승격은 아직 실행하지 않았습니다.

코어 `4cf585b2fcb51ef8445bd5e2f98424be1b3b29cb` archive의 ReleaseSafe WASM은 `fbe9fc14c3eaa373379e1512d83ba36ab4cbbdc2d21f560744fef5e61628d242`입니다. 최초 집중 검사16 passed/4 failed는 Git에 없던 field-outside/structure-formula 검사기 누락에 의한 실행 오류이며 통과로 처리하지 않았습니다. 해당 두 검사기만 `c92440b2`로 게시하고 archive/index를 그 커밋에 맞춘 뒤 추적 diff가 없는 상태에서 동일 산출물로 재검증했습니다. 런타임 소스/산출물은 교체하지 않았습니다.

후속 집중20/20·exit0(15908.904166ms), native6/6·exit0, HWP5-editor312/312·exit0(3288.0015ms), HWPX-text34/34·exit0(54362.776709ms), 문서당 한 host 추가 감사44/44·exit0입니다. 이 후보의 브라우저 다운로드/재열기와 기본 데모 승격은 아직 미완료입니다. 로컬 검증 서버는 `/tmp/hwpjs-field-host-release.EeC25U`의10007이며 사용자 기본 서버를 대체하지 않았습니다.

## 필드 외부 삽입·범위 조회 연결

`created_table_field_exterior.allowed`는 기존 source field exterior plan의 한 점 권한을 재사용합니다. 해당 범위일 때만 저장 writer가 기존 character-format의 field marker 보존 정책을 사용하고, 필드 내부/경계 보호는 기존 range 정책이 소유합니다. 문단 전체/필드 라벨 편집 허용으로 확대하지 않습니다. source field와 구조 편집된 field는 별도 경로이며 후자는 이번 확장에 포함하지 않습니다.

`created_table_host_splice.hasPending`가 Session 입력·구조 gate와 native field exterior 조회의 공통 판정입니다. native 범위 조회는 pending 표가 있으면 host 지원 모드도 확인합니다. Worker의 pending 상태는 전체 구역 registry projection에서 파생하며 구형 host-mode ABI가 없으면 외부 범위 조회도 false로 보호합니다. Canvas는 기존 query-edit-range를 재사용하고, 테스트 harness만 선택적으로 그 실제 Worker 응답 경로를 연결합니다.

native issue144 집중2/2·exit0에서 필드 밖 표 삽입·emoji prefix·라벨 시작/끝 이동·내부 삽입 거부·원본 불변을 확인했습니다. 최종 후보 `ccb1597ee5e9025da73642d294b75a69e4209f6a8f15f5ba01ac664c7e90442f`의 ReleaseSafe build/fmt/diff exit0, 공개/Worker/Canvas/projection15/15·exit0(10772.387833ms)입니다. Python 일반/-O 전체 XML·비대상 ZIP, redo/재열기의 연결 필드 범위, Canvas 외부 입력 권한/필드 내부 readOnly 유지와 선택적 host-mode export 제거 반례를 포함합니다.

동일 후보의 tracked unencrypted `/fixtures/` HWPX44개는 각각 한 적격 plain/anchored/field-exterior host의 표 생성·prefix·저장·undo/redo·재열기를44/44·exit0으로 통과했습니다. 기본 inventory의 password-12345는 제외되어 있으며 암호화 지원으로 계수하지 않습니다. 모든 문단/anchor 위치·필드 내용 명령·원본 조판·전수 독립 XML·실제 브라우저 검사는 남았습니다. 기본 데모 WASM은 아직 교체하지 않았습니다.

## 수식 구역의 저장본 의미 검증

실측 실패: chart.hwpx 숫자 입력 셀20 안에 생성 표를 저장한 뒤 재열기의 formula_current_snapshot이 UnsupportedFormulaCellContent로 실패했습니다. 숫자 참조 셀은 중첩 표를 지원하지 않는데 기존 stage가 원본 tree의 계산만 검사해 직렬화 후 바뀐 의미를 놓친 원인입니다. 이를 정상 계산으로 간주하거나 숫자 읽기를 임의로 완화하지 않습니다.

`created_table_saved_formulas.validate`는 수식이 있는 문서의 저장본을 별도 세션으로 열고 모든 수식 구역의 current snapshot을 검증합니다. stage와 host splice가 같은 검증기를 커밋 전에 호출합니다. 실패 시 기존 후보 registry 교환/전체 checkpoint rollback으로 저장 바이트와 이력을 복원합니다. 원본 flat 수식 구역 입력은 허용하지만 structure_values가 있는 수식 구역은 계속 제한합니다. 숫자 참조 셀 안의 표 생성은 명시적 오류로 원자적으로 거부합니다. 이는 지원 확장이 아니라 재계산 불가능한 결과의 저장을 막는 경계입니다.

후보 `0e26a0f0101c2dd8c9addc3778d05b546cac69278d760890d7e4dbf909f50c63`: ReleaseSafe build/fmt/diff exit0, native 수식 거래3/3·exit0, 새 검증기의 모든 할당 실패/원본 불변2/2·exit0, 공개 수식/drawing/plain3/3·exit0(1666.41925ms), Worker/Canvas10/10·exit0(9930.628708ms)입니다. 공개/Canvas 숫자11.2→100 재계산156.3, Python 일반/-O의 독립 Decimal·전체 XML/비대상 ZIP, 잘못된 숫자/참조 셀 표 삽입 거부 후 redo·정확 저장/재열기를 검사했습니다. 할당 실패 검사는 최초엔 루트1개만 실행되어 제외했고, root에 모듈을 연결한 후 실제 해당 테스트 실행을 확인했습니다.

같은 후보의 문서당 한 host 감사44개 중43 passed·1 no_eligible_host(issue144)·exit0입니다. 전체 문단/명령·중첩 표 계산 규칙·실제 브라우저/원본 조판은 완료 주장이 아닙니다. 기본 데모 WASM은 교체하지 않았습니다.

## 원본 개체 포함 본문 입력 확장

후속 staging 전체 할당 실패·구조 모드 회귀7/7·exit0으로 완료했습니다. 구조 모드만 분리한 집중 검사도2/2·exit0입니다. 기존 선 ID를 변조하는 추가 독립 XML 반례까지 포함한 공개 drawing 검사1/1·exit0(1709.082458ms)이며 Python 일반/-O 모두 정확한 Outside table XML changed 거부를 확인했습니다. 아래 실행 중 문장은 최초 기록이며 이 후속 완료로 대체합니다.

수식 다음 경계 조사: chart.hwpx의 일반 문단1과 숫자 입력 문단20은 각각 표 생성/save가 성공하지만 현 모드 조회는 false입니다. 결과 문단24의 표 생성은 UnsupportedParagraphControl로 거부됩니다. 이는 숫자 변경/독립 재계산·표 생성 이후 수식 의미 보존 완료의 근거가 아니며 해당 구역의 입력 제한은 아직 유지합니다.

현재 지원 모드 판정은 원본 문단의 anchored 입력도 허용합니다. 구조 편집된 section(structure_values가 있는 경우)의 anchored 입력과 수식 구역은 계속 거부합니다. 이는 source anchor 위치를 재사용하는 확장이며 joined/protected 구조의 위치 재배치 지원을 의미하지 않습니다. Worker는 기존 plain/anchored 적격성과 각각의 native 조회가 모두 true인 경우만 입력을 유지하고 필드 라벨·구조 편집 제한은 유지합니다. 아래 과거 anchored 일괄 거부 기록은 당시 계약입니다.

후보 `3224c9dc6195a24ae819e9cb40cee6d32a80f349522b0602f22803e6df9d801c`의 ReleaseSafe build와 native 집중4/4·exit0, 공개 drawing/plain 검사2/2·exit0(1174.176875ms), Worker/Canvas projection9/9·exit0(3623.647792ms)을 확인했습니다. 실제 두 선을 포함한 host에서 prefix 입력·생성 표 anchor 이동·개체 삭제 거부/저장 불변·redo, Python 일반/-O의 전체 비대상 XML/ZIP 보존과 잘못된 예상 prefix 거부를 검사했습니다. Canvas는 테스트 대역이며 이 후보의 실제 브라우저는 미검증입니다.

확장 감사는44개 중42 passed·2 no_eligible_host·exit0입니다. 이전 plain 감사의 제한9문서도 원본 anchored 경로의 표 생성·prefix·anchor0→5·이력·재열기를 통과했습니다. 남은 chart 수식 구역과 issue144 필드 컨트롤은 지원으로 계수하지 않습니다. 문서당 한 host만 검사하며 나머지 문단/명령·전수 독립 XML·조판은 미검증입니다. 별도 staging 전체 할당 실패/구조 모드 회귀는 아직 실행 중이며 완료 결과로 계수하지 않았습니다. 기본 데모는 교체하지 않았습니다.

## 기존 개체 사이 표 삽입 좌표 수정

실제 shapeline.hwpx는 anchorText가 기존 개체 표식2개를 반환하지만 이전 깨끗한 후보는 insertTable(unit0)만 성공하고 unit1은 InvalidTextPosition으로 거부했습니다. 생성 표 capture/resolve의 source paragraph 경계와 저장 site 선택이 plain 위치를 사용해 기존 개체 길이를 누락한 원인입니다. 두 곳은 기존 anchor_text_positions 계산기를 재사용하도록 수정했습니다. joined/protected 구조·수식·anchored 입력 지원은 이 변경으로 확정하지 않습니다.

ReleaseSafe native 집중3/3·exit0과 build/fmt/diff exit0을 확인했습니다. 공개 생성 표 drawing 경계와 plain host 회귀2/2·exit0(690.333667ms)입니다. 기존 두 선 앞/사이/뒤의 세 위치를 각각 저장·undo/redo·재열기하고, Python 일반/-O로 정확한 line/table 순서·기존 개체 전체 subtree/host 속성·구역 외 ZIP payload/메타데이터/CRC를 비교합니다. 잘못된 예상 삽입 위치는 정확한 ValueError: Wrong table anchor order로 거부되는 반례도 검사했습니다. native 표식 개수 통과만으로 순서를 주장하지 않습니다. 기본 데모는 교체하지 않았습니다.

## 깨끗한 커밋 빌드·브라우저 확인

후속 전 문단 eligibility 조회는 같은 산출물/44문서에서33 passed·11 no_eligible_host를 재확인했습니다. chart는 비중첩 plain47문단이 있어도 수식 구역 mode가 거부합니다. issue144의 비중첩3문단은 plain이 없고 anchorText도 UnsupportedParagraphControl로 거부합니다. 나머지9문서는 plain이0이며 anchoredReadable 문단은 각각 footnote-endnote2, matrix1, multicolumns-in-common-controls2, shapecontainer-2 1, shapeline1, shapepict-scaled2, shaperect1, table-caption7, textbox1입니다. anchoredReadable은 문자열 조회 성공일 뿐 삽입/저장 권한이 아닙니다. 진단의 anchorText 오류는 관측한 UnsupportedParagraphControl만 제한으로 계수하고 다른 오류는 failed/exit1로 전파합니다. 기존 개체가 있는 host의 anchor 좌표와 생성 표 저장의 좌표를 맞추는 구현·독립 보존 검증이 다음 경계입니다.

같은 깨끗한 산출물의 `hwp5-editor-audit`312/312·exit0(3360.761375ms), `hwpx-text-audit`34/34·exit0(53499.585042ms)을 확인했습니다. 기존 경계/전수 읽기·no-op/선정 입력 회귀이며 모든 명령·조판 지원 완료를 뜻하지 않습니다.

`node tools/hwpx-created-table-host-corpus-audit.mjs /absolute/hwpjs.wasm`은 Git 추적 `/fixtures/` HWPX(알려진 password-12345 제외)의 문서당 적격 plain source host 하나를 검사합니다. 빈 inventory를 거부하고 WASM/입력 hash를 확인하며 실패는 exit1로 기록합니다. 표 생성 후 prefix 입력·anchor0→5·undo/redo 정확 바이트·저장 재열기를 검사합니다. 44개 중33 passed·11 no_eligible_host·실행 exit0입니다. 나머지11은 chart, footnote-endnote, issue144-fields-crossing-lineseg-boundary, matrix, multicolumns-in-common-controls, shapecontainer-2, shapeline, shapepict-scaled, shaperect, table-caption, textbox입니다. 지원/통과로 합산하지 않습니다. 이 추가 감사는 모든 문단 위치·중간 anchor·독립 XML 대조나 브라우저 검사를 포함하지 않습니다.

`ae8479876af4fcdf49f7fe64b206058413a2120d` Git archive의 추적 파일/index diff가 없는 별도 디렉터리에서 ReleaseSafe build exit0을 확인했습니다. 산출물 SHA256은 `27920e973a01948226a1f9a768f93b612abb7457af490522bb9cd2a3b23d7e85`입니다. 이 산출물로 공개 host/projection/Worker/table creation 검사13/13·exit0(3245.553083ms)을 확인했습니다. 이전 dirty 후보와 별도로 계수합니다.

같은 빌드의 실제 Chromium에서 charshape.hwpx 업로드·편집 시작·진하게 검색/ArrowLeft caret·기본2×2표 생성 뒤 원래 본문을 다시 찾아 브라우저😀<&를 입력했습니다. 입력값 기울임브라우저😀<&진하게, 명시적 undo 뒤 기울임진하게, redo 뒤 정확한 편집값을 각각 조건 대기로 확인했습니다. 오류 조회는 비어 있었고 소유 브라우저 세션은 종료했습니다. 기록과 screenshots/host-input.png·host-redo.png는 `/tmp/hwpjs-host-input-release.qsA5pO/qa/`에 있습니다. browser download/reopen·실제 IME·정확한 조판·전수 fixture 브라우저 검증은 아직 남았습니다. 기본 데모 WASM은 이 빌드로 교체하지 않았습니다.

## Worker·Canvas 일반 본문 입력 연결

표시 projection3항목과 Worker/Canvas5항목의 실행은8/8·exit0(3412.006917ms), diff 검사 exit0입니다.

생성 표 표시 projection은 전체 native 구역의 pending registry를 조사합니다. 표시 창 밖 표도 전역 host 제한에 포함하고, visible 구역별 지원 모드를 한 번 조회합니다. 기존 plainEditable과 native 모드가 모두 true일 때만 입력을 유지하며 anchored·필드 라벨·anchored split·merge 이웃은 비활성화합니다. 구형 조회 ABI는 false로 보호됩니다. 문단의 기존 읽기 전용/잘림을 능력 조회만으로 허용하지 않습니다. 아래 UI 미연결 문장들은 이전 구현 기록이며 현재는 이 연결로 대체합니다.

후보 `81bed2bdb7d3c0a78dcdef2be0dda3b05b17d87c5492e6b8725eb1abaccff5ca`의 실제 Worker/WASM·Canvas 대역에서 source caret 입력 앞😀<&, anchor2→7/identity 유지, Python 일반/-O 전체 section XML·비대상 ZIP 대조, undo 원문 바이트·표 crossing/XML NUL 거부 뒤 redo 정확 저장을 검사했습니다. 이는 실제 브라우저 pixels/IME·원본 조판 검사가 아닙니다. 기본 데모 WASM은 아직 구형이므로 해당 제품에서 host 제한은 유지됩니다.

## 생성 표 host 지원 모드 조회

`created_table_host_splice.supportsMode`가 거래 실행과 선택적 `hwpx_edit_created_table_host_mode(section, anchored)`의 모드 판정을 함께 소유합니다. ABI는0/1/오류2이며 anchored는0/1만 받습니다. JS `createdTableHostMode(section, anchored = false)`는 Boolean만 받고 구형 ABI가 없으면 false를 반환합니다. 이 조회는 pending 표 거래의 모드 제한만 나타내며 문단/범위 편집 권한이나 split/merge 지원이 아닙니다. UI gate는 아직 연결하지 않았습니다.

ReleaseSafe native 집중3/3·exit0은 일반 모드/anchored/잘못된 구역과 실제 chart.hwpx 수식 구역의 거부·저장 불변을 확인했습니다. 후보 `81bed2bdb7d3c0a78dcdef2be0dda3b05b17d87c5492e6b8725eb1abaccff5ca`는 ReleaseSafe build·공개 host 검사1/1·exit0(302.298083ms)을 확인했습니다. 공개 조회의 true/false·잘못된 Boolean·구역 오류와 기존 거래/분할 보호·XML/ZIP 대조를 포함합니다. 아래 이전 후보 기록의 당시 미완료 host 할당 순회는 현재 후속 완료 기록으로 대체합니다. 기본 데모는 교체하지 않았습니다.

## 분할 가능 여부 조회의 보호 규칙

공개 `hwpx_edit_can_split`은 하위 분할 모듈을 직접 호출하지 않고 Session의 `canSplitParagraph`를 사용합니다. 생성 표가 있는 세션에서는 실행과 같은 전역 host 보호 규칙으로 false를 반환합니다. 이 제한은 생성 표 anchor의 구조 편집 재배치를 구현했다는 의미가 아닙니다.

2026-10-11 기존 후보 `62ecc0cef2630f08a7a8cb16461367648b3cc5b24502ce95bd26176c0af54e5b`는 실제 charshape.hwpx에 표를 만든 뒤 이 조회에서 `InvalidTextPosition`으로 회귀 테스트가 실패했습니다. 수정 후보 `72bc1f01928347e5b7ce03652409acf5cb14d0f684ce9a83544d5318245be1bc`는 ReleaseSafe build·fmt/diff exit0 및 공개 검사1/1·exit0(372.885333ms)을 확인했습니다. 조회 false·실행 UnsupportedCreatedTableHostEdit·거부 후 저장 전체 바이트 불변, 이후 일반 본문 입력/이력과 독립 XML/ZIP 비교를 함께 검사했습니다. 같은 후보의 공개 host 검사와 기존 수식 분할 네 항목을 함께 실행한 결과5/5·exit0(135676.093958ms)입니다. 실제13수식 문단의 양쪽 경계 분할·독립 XML/ZIP·저장 재열기·이력과 변경된 계산 결과/부분 서식의 분할·재병합도 검사했습니다. host 할당 실패 순회는 아직 완료 결과로 계수하지 않습니다. 기본 데모 WASM은 그대로입니다.

## 공개 저장 독립 대조

2026-10-11 별도 후보 `62ecc0cef2630f08a7a8cb16461367648b3cc5b24502ce95bd26176c0af54e5b`의 공개 API 검사1/1·exit0(390.416458ms)은 실제 생성 표가 있는 본문의 앞😀<& 입력, anchor2→7/identity 유지, undo·crossing 거부 후 redo와 정확한 저장 바이트를 확인했습니다. Python 일반/-O로 전체 section XML·비대상 ZIP payload/메타데이터/CRC를 대조했습니다.

기존 plain-splice oracle의 명시적 zero_width_table_id 옵션만 현재 생성 표의 virtual 위치를 허용합니다. 기본은 계속 plain-only이고, 지정하지 않은 표·잘못된 ID·표를 가로지르는 범위는 거부합니다. 표 subtree는 변경 예상에 포함하지 않아 전체 XML 비교로 보존을 확인합니다. 네 명시적 반례는 정확한 ValueError와 정상 프로세스 종료code1을 확인하며 실행 실패를 거부 성공으로 세지 않습니다. 기존13개 plain oracle 반례도 통과했습니다.

open/prepare/staging부터 host 거래까지 모든 할당 실패를 순회하는 추가 native 테스트를 실행했습니다. host 실패 후 비실패 할당자의 readonly view로 저장을 검사해 본문/anchor 복원도 검증합니다. 이 view의 공유 owner는 해제하지 않습니다. Worker gate는 아직 해제하지 않았습니다.

후속 재실행은 ReleaseSafe 2/2(root 포함)·exit0으로 완료했습니다. 위 open/prepare/staging/save/host splice의 전체 실패 지점을 생략 없이 순회하고, host 실패 후 전체 저장 바이트·anchor2 복원 및 성공 시 anchor4/원본 불변을 검사했습니다. 이 결과는 복수 구역/다양한 객체와 Worker/브라우저 본문 입력 검증을 대신하지 않습니다.

추가 검사의 첫 실행은 SIGKILL로 종료했으며 assertion 통과나 메모리 누수 부재의 근거로 계수하지 않습니다. 원인은 확인되지 않았습니다. 재실행은 공통 `testing/allocation_failures.zig` helper로 할당별 stack trace 비용만 제거하고 모든 실패 지점과 종료 시 leak 검사를 유지합니다. helper 자체의 전체 실패 지점 순회·무시된 OOM 검출 테스트는 ReleaseSafe 1/1·exit0을 확인했습니다. 이는 실제 문서 거래의 전체 순회 완료와 별도 결과입니다.

`created_table_host_splice.apply`는 현재 host 참조와 UTF-16 입력 길이를 확인하고 registry 후보의 해당 anchor만 공통 이동 계획으로 변환합니다. 기존 checkpoint를 캡처한 뒤 후보 registry를 설치하고 기존 private 본문 splice를 호출합니다. 저장 검증까지 통과해야 커밋하며 실패·no-op은 checkpoint rollback으로 표와 본문을 함께 복원합니다. 원본 XML/ZIP은 변경하지 않습니다.

Session의 원래 plain splice 구현은 private callback으로 유지합니다. 생성 표가 없으면 기존 경로를 그대로 호출합니다. 생성 표가 있으면 일반 본문 splice에 위 거래를 적용합니다. anchored 입력·수식이 있는 대상 구역·split/merge·필드 전용 편집은 아직 UnsupportedCreatedTableHostEdit 보호를 유지합니다. UI는 새 native 능력 조회와 검증이 끝나기 전 기존 host read-only gate를 유지합니다.

2026-10-11 ReleaseSafe 집중3/3(root 포함)·exit0, fmt/diff·ReleaseSafe build exit0입니다. 실제 charshape.hwpx 기반 생성 표의 emoji 입력으로 anchor2→4, 저장 재열기의 정확한 host 전체 텍스트/표 marker 위치, undo·crossing/XML NUL/no-op/늦은 출력 예산 실패 뒤 staged 저장 바이트 불변과 redo 정확 저장, 원본 불변을 확인했습니다. 기존 staging/history 회귀도 포함합니다. 후보 prefix는 `/tmp/hwpjs-created-table-host-splice-20261011`이며 기존 작업 트리 변경을 포함합니다.

복수 구역/다양한 실제 객체·Worker/브라우저 body 입력과 수식/구조 위치 재배치는 아직 검증/구현이 남아 있습니다. 기본 데모 WASM은 교체하지 않았습니다.

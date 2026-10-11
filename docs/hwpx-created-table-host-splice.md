# 생성 표와 일반 본문 splice 거래

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

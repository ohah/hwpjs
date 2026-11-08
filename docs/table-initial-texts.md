# 표 생성 시 초기 셀 본문

이 계약은 개발 중인 SDK·CLI·MCP 후보에 적용합니다. npm `@ohah/hwpjs@0.1.0`의 기능으로 소급하지 않습니다. 실제 저장 검증과 공개 배포는 별도로 확인합니다.

## 요청과 원자성

CLI·MCP의 `table-insert` 작업은 선택적인 `cellTexts`를 받습니다. 행 우선의 2차원 문자열 배열이며 `rows`·`columns`와 정확히 일치해야 합니다. 생략하면 기존 빈 표 생성 경로를 유지합니다. 빈 문자열은 빈 셀이고 `null`·희소 배열·줄바꿈·제어 문자·잘못된 UTF-16은 허용하지 않습니다. 셀은 최대 4,096개이며, JSON 요청과 초기 본문은 각각 4MiB 이내여야 합니다. JSON 포장 비용 때문에 본문만 4MiB인 요청이 반드시 허용되는 것은 아닙니다.

Native가 분리된 새 표 모델에 본문을 채운 뒤 기존 표 생성 명령으로 한 번 반영합니다. 셀마다 편집 세션·체크포인트·저장을 반복하지 않습니다. 생성과 초기 본문은 하나의 이력 항목이며 실패한 준비 과정은 열린 문서를 변경하지 않습니다. 준비의 비용은 셀 수와 입력 바이트 수에 비례합니다. 전체 문서의 파싱·조판·저장 비용까지 이 보장에 포함하지 않습니다.

## SDK와 WASM 경계

HWP5 SDK는 `insertTable(request)`의 `cell_texts`, HWPX SDK는 `insertTable(section, paragraph, unit, options)`의 `options.cellTexts`로 전달합니다. 기존 형식별 인수 형태는 유지합니다.

`supportsTableInitialTexts()`는 새 초기 본문 진입점의 존재를 확인합니다. HWP5는 `hwp5_edit_insert_table_with_texts`, HWPX는 `hwpx_edit_insert_table_with_texts`를 사용합니다. 구형 WASM에서는 초기 본문 요청을 삽입 전에 거부하며, 빈 표로 대체하지 않습니다. 기존 빈 표 ABI는 유지합니다.

JS는 소유한 데이터로 요청을 고정하고 실제 UTF-8 요청 크기를 확인합니다. HWP5 초기 본문 요청에서 accessor·`toJSON`·순환 구조를 거부해 검증한 본문이 전송 직전에 바뀌지 않게 합니다. Native의 공통 JSON 검사는 셀을 실제 JSON 문자열로 제한합니다. 숫자 배열을 바이트 문자열로 해석하는 파서의 편의 동작을 허용하지 않습니다.

## 책임 소유자

- CLI·MCP의 작업 필드와 사전 검증: `packages/cli/src/mutations/validate.ts`
- 형식별 SDK 호출 연결: `packages/cli/src/mutations/dispatch.ts`
- JS 데이터 캡처·요청 예산: `js/table-initial-texts.mjs`
- 공통 Native JSON 문자열 검사: `src/model/created_table_initial_text_json.zig`
- 형식별 분리 표 준비: `src/hwp5/edit/created_table_initial_text.zig`, `src/hwpx/created_table_initial_text.zig`

초기 본문은 한 문단의 일반 텍스트입니다. 셀별 글자·문단 서식 지정, 병합, 표 전체 삭제, 그림 삽입·교체를 이 기능에 포함하지 않습니다.

## 확인한 결과와 배포 경계

새 WASM `c033ef3f93383385a630ac912274bb6b18b90c495f29edad21c8fc4e36be73ae`와 Git 기준 소스에 명시한 변경만 포함한 후보에서 Noori 두 형식의 SDK·CLI·MCP 적용을 확인했습니다. 단일 생성의 이력 증가, undo 시 표 전체 제거, redo 시 네 셀 본문 복구, 저장 후 Native 재열기가 통과했습니다. 독립 CFB 레코드의 UTF-16 본문과 HWPX ZIP/XML의 문자열·특수문자·빈 셀을 대조했습니다. 잘못된 후행 셀은 실제 Native ABI에서도 저장 바이트·이력을 바꾸지 않았고 CLI/MCP의 새 출력 파일도 생기지 않았습니다.

합성 SDK 검사에서 발견한 getter 재읽기와 `toJSON`에 의한 검증·전송 불일치는 데이터 캡처로 수정했습니다. 구형 ABI의 초기 본문 거부와 기존 빈 표 유지도 확인했습니다. Native 준비 단계에서는 할당 실패와 잘못된 JSON 셀 타입의 거부를 확인했습니다. 초기 실물 검사의 실패는 중첩 표 셀을 일반 문단으로 선택한 비교기, 허용치를 넘는 이력 예산, WASM 인스턴스 반환형을 잘못 처리한 검증 코드에서 발생했으며 해당 실패 기록을 보존했습니다.

이 결과는 새 후보의 기능 검증입니다. 공개 npm 0.1.0의 기능 추가, 배포된 웹 UI에서의 입력, 모든 표·문서의 조판 동등성을 뜻하지 않습니다. 실행 명령의 단일 출처는 [개발·검증 명령](development-commands.md)입니다.

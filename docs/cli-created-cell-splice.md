# CLI 생성 셀 splice 계약

`apply`와 같은 필드 명세를 사용하는 MCP의 `created-cell-splice`는 해당 요청에서 앞서 성공한 `table-insert`의 Native receipt만 참조합니다. 저장된 파일의 원본 셀 편집이나 Canvas 입력 경로의 성공 증거를 대신하지 않습니다.

```json
{
  "kind": "created-cell-splice",
  "coordinates": "current-transaction",
  "selector": { "section": 0, "created_cell": { "operation": 0, "row": 0, "column": 0 } },
  "startUnit": 0,
  "endUnit": 0,
  "expectedText": "",
  "text": "앞😀\n뒤",
  "insertion": { "character": { "bold": true, "fonts": { "hangul": { "name": "함초롬바탕" } } } }
}
```

`operation`은 같은 배열의 앞선 표 생성 작업의 0부터 시작하는 인덱스입니다. 구역과 행·열은 그 작업에 일치해야 합니다. 문자열 identity나 문단 주소를 호출자가 대신 지정할 수 없습니다. 표 생성 결과의 0이 아닌 정규 u64 identity를 공통 receipt map에 기록하고, 차트·수식 생성과 같은 selector resolver로 해결합니다. 새 명령은 chart/equation 분류에 포함하지 않습니다.

전체 작업을 소유 캡처하고 모든 참조·UTF-16 경계·서식 문법을 열기 전에 검증합니다. 먼저 전체 작업의 메서드·History2/생성 셀 rich ABI1 제공 여부를 정적으로 검사한 뒤 기존 `enableHistoryV2`를 호출합니다. 이력이 활성화된 뒤에만 현재 capabilities·형식·좌표계·binding을 조회하고 첫 문서 변경 전에 검사합니다. 각 splice 직전의 동일한 현재성 재검사도 유지합니다. 초기 `table-insert.cellTexts`의 LF 거부는 그대로입니다. 새 rich 입력 경로에서만 LF를 허용하며 NUL·CR·잘못된 서로게이트·그 밖의 제어문자는 거부합니다. `insertion.character`는 Core의 기존 서식 검증기를 재사용하며 7언어 글꼴과 희소 서식의 Native 의미 검증을 변경하지 않습니다.

각 splice 직전 기존 `observeCreatedCellTextTarget` 및 `prepareCreatedCellTypingTarget`을 동기 재사용합니다. 현재 Native binding·셀 본문·owner를 검사하고 HWP5는 Native가 발급한 현재 셀 참조와 `currentText`도 대조합니다. Surface가 없는 독립 CLI 세션의 지역 scope 표식은 조회와 검증을 연결할 뿐 권한을 발급하지 않습니다. 사용자 `expectedText`는 범위 문자열이 아닌 현재 셀의 전체 본문과 일치해야 합니다. 주소나 참조를 추측하지 않고 정식 `spliceCreatedCell`만 호출합니다.

독립 세션의 명령·저장·종료가 전부 성공해야 바이트를 반환하는 기존 게시 경계를 유지합니다. Native 거부·불명확한 완료·cleanup 오류·후행 본문 불일치가 있으면 재시도·후행 명령·새 파일 게시를 수행하지 않습니다. 이미 수행된 앞 명령은 폐기되는 독립 세션 안에만 남습니다. HWP5의 조판 갱신 필요 시 명시 `allowStaleLayout` 정책도 유지합니다.

## 검증 범위

`bun test --no-install packages/cli/tests/created-cell-splice.test.ts`는 실제 CLI 코드와 제어 SDK 응답을 검사합니다. 이는 Native 실행·실제 CLI68·Canvas·설치 SDK·공개 배포 증거가 아닙니다. 실제 엔진의 LF·rich 저장, undo/redo 및 재열기는 같은 소스와 엔진을 고정한 후속 실행이 필요합니다.

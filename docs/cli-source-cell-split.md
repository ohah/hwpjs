# CLI·MCP 원본 셀 나누기

기존 `hwpjs apply`와 MCP `apply_document_changes`는 `source-table-cell-split` 명시 연산을 공통 mutation service로 실행합니다. Native HWPX/HWP5 SDK의 `splitSourceTableCells`를 그대로 사용하며 새 패키지·Native writer·파일/XML/CFB 편집 모델을 만들지 않습니다. 원본 형식의 지원 계약은 [HWPX](hwpx-source-cell-split.md)·[HWP5](hwp5-source-cell-split.md)가 소유합니다.

## 요청과 Native 권한

`reference`는 같은 원본의 기존 구조 보기에서 발급한 table reference입니다. 기존 `parseObjectReference`와 `resolveTableReference`를 재사용해 원본 SHA·형식·구역·표를 해결하고 `expectedRows`, `expectedColumns`를 현재 관측과 대조합니다. `top`, `left`는 0부터, `bottom`, `right`는 미포함 끝입니다. 나누기 `rows`, `columns`는 각각1~63이며 둘 다1은 허용하지 않습니다. `mode`는 `each` 또는 `merge-then-split`, `equalizeRows`는 필수 boolean입니다.

물리 셀 수는 현재 `tableBindings`에서 읽어 SDK 요청의 selectedCells로 전달합니다. 사용자가 Native node·binding·selectedCells를 주입하지 못하게 strict operation 키와 공용 MCP 스키마를 검사합니다. 부분 병합 셀 선택, 중첩·비본문 owner와 기대 격자 불일치를 거절합니다. Native는 전체 격자·정적/보호 구조·레이아웃·4096격자 및 기존 예산을 다시 검사합니다. 최종 허용 여부를 JS에서 합성하지 않습니다.

HWPX는 병합된 원본 셀 전체, 여러 물리 셀 각각, 합친 후 나누기를 지원합니다. 높이 유지의 구체적 가능 여부는 기존 Native가 판정합니다. HWP5의 `single-unmerged-source-cell` profile은 표 전체가 비병합이며 선택 물리 셀 하나·each·equalizeRows=true일 때만 연결합니다. 이 제한을 완화하지 않습니다.

## 원본 reference와 batch 수명

모든 나누기 reference는 **첫 변경 전에** 기존 문서 관측 서비스로 해결합니다. 당시 SDK 객체·문서 객체·원본 SHA·형식·Native session/revision/non-rewinding serial과 실제 placement·body owner·셀 binding을 준비 대상에 묶습니다. 실행 직전에 같은 SDK·Native binding 및 owner 관측을 재검사하며 Native도 마지막 검사를 수행합니다.

batch 앞선 변경이 binding을 바꾸면 뒤 나누기는 `StaleSourceTableSplitReference`로 거절합니다. revision이 undo로 돌아와도 serial은 되감기지 않으므로 대상이 되살아나지 않습니다. 문서 닫힘·재열기·다른 세션과 JSON으로 재구성한 준비 대상도 사용할 수 없습니다. 동일 SHA 원본의 serialized reference를 새 파일 transaction에서 해결하는 것과 이전 세션의 opaque 준비 대상을 다른 세션에 실행하는 것은 구분합니다.

자동 reference rebase는 제공하지 않습니다. 앞선 변경을 저장한 뒤 새 구조 보기에서 SHA와 reference를 다시 받아 별도 apply를 시작합니다. 이 때문에 서로 다른 표에 대한 두 나누기도 첫 변경 후 두 번째의 이전 binding을 재발급하지 않고 전체 batch를 거절합니다. `current-transaction`은 기존 다른 연산의 현재 좌표 규칙이며 serialized 원본 reference를 변경 이후 숫자 주소로 해석할 권한이 아닙니다.

## 저장과 오류

전체 batch의 명령 종류·좌표·ABI를 사전 검사한 뒤 필요한 세션에만 기존 managed history V2를 활성화합니다. SDK 완료1은 적용, 완료2는 무변경으로 처리하며 오류·불명확 완료·cleanup/refresh 오류는 재시도하지 않고 파일 transaction을 실패시킵니다. 독립 세션의 모든 연산·저장·종료가 성공한 뒤 기존 새 파일 게시 호스트만 사용합니다. 앞선 변경이나 나누기가 transient 세션에 적용됐어도 후행 오류에는 출력 바이트·성공 stdout·부분 파일을 게시하지 않습니다. 입력과 기존 출력은 덮어쓰지 않습니다.

HWP5 저장은 기존 `allowStaleLayout` 동의를 요구합니다. HWPX도 새 조판 생성으로 표시하지 않으며 나누기 결과의 `layoutRequiresReflow`를 true로 보고합니다. exact save/reopen은 저장 바이트 보존의 증거이며 시각적 재조판 성공을 뜻하지 않습니다.

## H497의 알려진 Native 제한

HWP5의 외곽 선언과 내부 셀 크기 합이 달라도 지원되는 단일 비병합 셀 나누기는 원래 외곽 선언을 보존합니다. 같은 constructor 입력에서 수정 전 거절과 수정 후 성공을 재현했으며, CLI·MCP 저장본은 독립 CFB 일반/-O로 확인합니다. 입력을 정규화하거나 너비·높이를 덮어쓰는 우회는 사용하지 않습니다. 행·열 편집 및 병합 입력의 별도 제한은 [HWP5 나누기 계약](hwp5-source-cell-split.md)을 따릅니다.

검증 증거·정확한 원본/후보 SHA·Node 명령·독립 CFB/XML oracle·남은 게이트는 `zig-out/verification/source-cell-split-cli-mcp-r1/HANDOFF.md`와 `MANIFEST.json`에 고정합니다. 정규 `packages/cli/e2e/source-cell-split-bridges.test.mjs`는 명시한 현재·과거 엔진 해시로 합성 문서 여섯 개를 직접 만들며 외부 sidecar fixture를 요구하지 않습니다. 공개 사용 예제는 Rspress `guide/cli.md`·`guide/mcp.md`가 소유하며 npm 릴리스 제공 여부와 구분합니다.

# 원본 셀 범위의 테두리와 통합 셀 모양

이 문서는 원본 여러 셀·표 전체 테두리의 계획, Native 원자 배치와 통합 테두리/배경 명령을 소유한다. 한 셀의 기본 선 도메인은 [셀 테두리](cell-border-editing.md), 배경 생성 정책은 [셀 배경](cell-background-editing.md), 선택 lease는 [원본 셀 서식](headless-original-cell-formatting.md), 실제 공식 창과 후보 UI 차이는 [대화상자 관측](table-dialog-reference.md)을 따른다.

## 범위와 기하

현재 셀·명시 줄/칸 범위·원본 표 전체의 바깥 선/안쪽 선/모든 선을 계획한다. 범위 입력은 UI에서 1부터 시작하는 양끝 포함 번호이고 `tableBorderPlan`에는 0부터 시작하는 끝 제외 구간으로 전달한다. 이것을 Canvas의 여러 셀 드래그 선택 구현으로 해석하지 않는다. 생성 셀, 일부만 관측된 표, 병합 셀을 가르는 범위, 보호된 대상은 거부한다. 배경 변경은 현재 셀에 한정한다.

`js/table-border-plan.mjs`는 source cell의 각 변에 방향이 있는 끝점 사건을 Map에 더해 내부 공유 경계를 상쇄한다. 긴 병합 변과 여러 짧은 변도 같은 방식으로 검증한다. 남은 사건이 사각 외곽과 정확히 일치해야 하므로 겹침과 빈 영역의 면적 합이 우연히 같은 반례도 거부한다. 정렬이나 row×column 배열을 만들지 않는다. 원본 셀 N과 결과 M에 대해 기대 O(N+M), 공간 O(N+M)이다. 이 JS 결과는 Native 소유권을 발급하지 않는다.

## Native 배치와 이력

`setCellBorders(cells)`의 한 요청에는 최대4096개 원본 셀이 들어간다. 각 셀은 기존 일곱 scalar이며 같은 구역/list 소유자를 중복 요청하지 않는다. wire는 셀당28바이트 little-endian이다. 한 배치에서 source 구역·소유자·BorderFill을 색인하고 요청 전부를 검증한 뒤 같은 셀 intent에 게시한다. 한 셀 setter를 M번 반복하여 전체 문서를 M번 파싱하지 않는다. 배경과 모든 비대상 속성, 공유 원본 자원은 보존한다.

배치는 이력 하나이며 빈 배치·같은 값은 no-op이다. 중간 대상 오류·할당 실패·잘못된 참조가 앞선 셀만 변경한 상태를 남기지 않는다. ABI의 요청 배열은 호출 동안만 빌리며 이력은 자체 소유 checkpoint/state를 보관한다. 호출자가 배열을 덮어쓴 뒤에도 undo/redo가 유지되어야 한다.

통합 `setCellAppearance({cells, background})`에서 background는 null 또는 section/tableNode/listNode/color다. 테두리 배치와 현재 셀 배경을 Native `History.applyBatch` 하나로 적용한다. 두 번째 배경 명령이 실패해도 첫 번째 테두리를 롤백한다. Core의 `cell-borders`·`cell-appearance`는 기존 mutation/token 경계를 사용하고 실제 export에서 각각 capability를 관측한다. 구조화된 요청은 공통 포트에서 깊이 정규화·소유한 뒤 queue barrier 전후의 fingerprint와 선택 fence를 비교한다.

## 현재 검증

원자료는 `zig-out/verification/table-range-new-document-r1/`에 보존한다. Native 배치·기존 한 셀 배경/테두리 회귀와 실제 SDK/Core·독립 저장 오라클을 구분한다. 공식 화면 조사는 제품 구현 검증이 아니며, 자체 소스 검토3회를 최종 통합 적대적 검증3회로 계산하지 않는다. 실제 화면·배포는 통합 후보를 동결한 뒤 별도 판정한다.

## 통합 검증 결과

2026-11-06 실제 SDK/Core의 원자 모양 검사10개는 변경/이력/실패 롤백과 독립 저장 CFB/XML을 통과했다. 이후 추가한 실제 Core 전체 표 DTO의 planner2개도 통과했으며, 파일 SHA가 달라진 두 cohort는 `integration/QA5-AUTHORITATIVE-PER-COHORT.json`으로 구분한다. 기존10개와 추가2개의 반복 실행을 새로운 전수 통과 수로 합산하지 않는다.

최종 R4 브라우저에서 고정 Noori HWP5/HWPX의 원본 셀을 실제 클릭해 테두리·배경 동시 적용, 열린 창 유지, 변경 없는 확인의 무변경, 한 번의 실행 취소로 전체 이전 스타일·참조 복원을 확인했다. HWP5는3×4 명시 범위/전체 변의10셀, HWPX는 표 전체/바깥 변의8셀 결과를 확인했다. 이는 새로 만든 셀·Canvas 다중 셀 드래그·다중 셀 배경 지원 증거가 아니다. 원자료는 `integration/R4-FINAL-AGGREGATE.json`과 두 실행의 실제 결과가 소유한다.

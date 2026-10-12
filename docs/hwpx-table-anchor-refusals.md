# 실제 표 배치 거부의 진단

`tablePageAnchorError`는 기존 `tablePageAnchorSupported`의 동일 조건을 검사해 첫 거부 이유를 반환합니다. boolean API는 이 결과를 재사용합니다. 원문 배치값·원래 지원 범위를 수정하지 않으며 한 이유가 나머지 조건도 지원된다는 뜻은 아닙니다.

표 본문 조판의 `UnsupportedTablePageAnchor` 결과에는 `tableNode`와 `anchorReason`을 추가합니다. 논리 미리보기 fallback에서도 renderer의 `pageLayoutTableNode/pageLayoutAnchorReason`와 Canvas dataset에 같은 진단을 보존합니다. 물리 배치 성공으로 표시하지 않습니다.

## 실제 원문 대조

36389301 덧말 파일의 표 node381/host29는 XML 원값 `vertRelTo=PAGE`, `vertAlign=BOTTOM`이고 native 값은1/2입니다. 기존 문단 기준 위쪽 배치 정책에서 첫 거부는 `UnsupportedTableVerticalReference`입니다. 별도 표 node1068/host30은 `textWrap=BEHIND_TEXT`, `vertAlign=BOTTOM`이며 첫 거부는 `UnsupportedTableTextWrap`입니다. 독립 Python ZIP/XML과 실제 Worker가 일치했고 입력과 표시 데이터는 변경하지 않았습니다.

페이지 기준 아래쪽 표·뒤쪽 표의 실제 페이지 연결/겹침/본문 흐름은 아직 구현해야 합니다. 문단 기준 위쪽 값으로 정규화하거나 미지원 표를 삭제해 통과시키지 않습니다.

후보 `field-label-display-owned-api`(SHA256 39c827edcce665efcce4b40c9a70d47d0d1f74a1ac63013972d2b10a49692a1f)에서 `table-page-anchor-reference`, `table-page-anchor-policy`, `field-label-display` 테스트5/5 종료코드0입니다. 잘못된 타입/범위/인라인 및 부동 모드 조합의 기존 boolean 판정 동치·거부 이유·실제 표 소유권·renderer 진단을 검사했습니다. 실제 브라우저/원본 조판 완료 검사가 아닙니다.

# 실제 표 배치 거부의 진단

`tablePageAnchorError`는 기존 `tablePageAnchorSupported`의 동일 조건을 검사해 첫 거부 이유를 반환합니다. boolean API는 이 결과를 재사용합니다. 원문 배치값·원래 지원 범위를 수정하지 않으며 한 이유가 나머지 조건도 지원된다는 뜻은 아닙니다.

표 본문 조판의 `UnsupportedTablePageAnchor` 결과에는 `tableNode`와 `anchorReason`을 추가합니다. 논리 미리보기 fallback에서도 renderer의 `pageLayoutTableNode/pageLayoutAnchorReason`와 Canvas dataset에 같은 진단을 보존합니다. 물리 배치 성공으로 표시하지 않습니다.

## 실제 원문 대조

36389301 덧말 파일의 표 node381/host29는 XML 원값 `vertRelTo=PAGE`, `vertAlign=BOTTOM`이고 native 값은1/2입니다. 기존 문단 기준 위쪽 배치 정책에서 첫 거부는 `UnsupportedTableVerticalReference`입니다. 별도 표 node1068/host30은 `textWrap=BEHIND_TEXT`, `vertAlign=BOTTOM`이며 첫 거부는 `UnsupportedTableTextWrap`입니다. 독립 Python ZIP/XML과 실제 Worker가 일치했고 입력과 표시 데이터는 변경하지 않았습니다.

페이지 기준 아래쪽 표·뒤쪽 표의 실제 페이지 연결/겹침/본문 흐름은 아직 구현해야 합니다. 문단 기준 위쪽 값으로 정규화하거나 미지원 표를 삭제해 통과시키지 않습니다.

## 페이지 기준 예약 계산

`reserveTableVerticalFlow`에 PAGE 기준 TOP/CENTER/BOTTOM 예약을 추가했습니다. 정렬 식은 기존 그림 배치의 `alignedReferenceCoordinate`를 공유하고 측정된 전체 높이와 호출자가 준 기준 영역을 사용합니다. 고정 좌표를 occupiedBottom으로 clamp하지 않으며 충돌은 next-page, 기준 영역 밖 offset/크기는 명시적 오류입니다. 페이지 기준 표 band는 offset0이어도 whole 예약을 요구합니다.

실제 node381의 셀을 원문 padding과 폭8/높이12 주입으로 측정한 뒤 해당 표와 호스트 flow만 단독 planner에 전달해 fragment 아래 경계가 기준 page 아래 경계와 일치함을 확인했습니다. 최초 harness의 origin 누락과 셀 flow까지 함께 넘긴 UnsupportedPageFlow는 호출 범위를 교정했고 제품 가드를 풀지 않았습니다. 실제 단독 table plan과 예약 반례4/4 종료코드0입니다. 이 단면은 전체 문서 배치 성공이나 원본 글꼴 동치가 아닙니다.

제품 `tablePageAnchorSupported`와 전체 본문 entry 조립은 아직 기존 거부 정책을 유지합니다. 다음 작업은 whole PAGE 예약을 본문에 연결하고, BEHIND_TEXT·겹침·본문/그림 조합까지 검사하는 것입니다.

후보 `field-label-display-owned-api`(SHA256 39c827edcce665efcce4b40c9a70d47d0d1f74a1ac63013972d2b10a49692a1f)에서 `table-page-anchor-reference`, `table-page-anchor-policy`, `field-label-display` 테스트5/5 종료코드0입니다. 잘못된 타입/범위/인라인 및 부동 모드 조합의 기존 boolean 판정 동치·거부 이유·실제 표 소유권·renderer 진단을 검사했습니다. 실제 브라우저/원본 조판 완료 검사가 아닙니다.

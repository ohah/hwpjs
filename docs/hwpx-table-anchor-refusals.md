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

## PAGE 본문 경로 연결

부동 중첩 셀 투영 단면: `projectNestedFloatingTable`은 명시적으로 계산한 현재 위치/소유자와 페이지 정보를 받고 기존 whole band·source padding·projectTablePageFragments를 재사용합니다. 측정한 grid가 원문 위치 사각형을 넘으면 NestedFloatingTableMeasuredOverflow로 거부하며 축소/잘림으로 바꾸지 않습니다. 뒤쪽/앞쪽 layer와 원문 사각형을 보존합니다. 소유자 변조·잘못된 column ordinal·좌표 덧셈 오버플로 반례, 셀 box/Unicode 텍스트·입력 불변 테스트가 통과했습니다. 최초 작은 표 측정에는 일반 grid 최소 폭이 적용돼 넘침이 발생했고, 명시적 원문 열 폭20px을 주입한 측정으로 테스트 계약을 교정했습니다. 위치/셀 투영2/2 종료코드0이며 아직 재귀 조판/레이어 paint 호출에 연결하지 않았습니다.

부동 중첩 기준 조사: 실제 덧말 파일 host30의 원문 줄 높이는1200HU(16px)인데 부모 셀 높이는26353HU(351.373333px)입니다. child1068은 PARA/BOTTOM/BEHIND_TEXT이므로 부모 셀을 문단 사각형으로 대체하면 전혀 다른 위치가 됩니다. 원문 줄 값은 편집 후 최신 조판으로 간주하지 않습니다.

`positionNestedFloatingTable`은 현재 소유 문단 사각형과 종이/필요한 기준 상자를 명시적으로 받아 기존 placeFloatingTable 계산을 재사용합니다. section·부모 table/list·host paragraph 식별자를 검사하고 뒤쪽 layer를 구분하며, 셀 밖이지만 종이 안인 배치는 clamp하지 않고 별도 상태로 보고합니다. 종이 밖·잘못된 소유권/타입·부재/비유한 기준 반례와 입력 불변 테스트1/1 종료코드0입니다. 이 위치 단면은 아직 재귀 셀 측정/paint에 연결되지 않았으며 현재 문단 높이를 정확히 제공하는 조판 경로와 중첩 그림/겹침을 구현해야 합니다.

후속 중첩 연결: 기존 validateNestedTableOwnership과 measureNestedTable을 본문 경로에서 재사용합니다. 소유권을 먼저 검증한 뒤 루트 표만 본문 entry로 조립하고 자식은 부모 셀의 재귀 측정/페이지 projection에 포함합니다. 자식 표의 wrap 값으로 루트 페이지 경로를 선택하지 않습니다.

합성 인라인 중첩 표의 두 cell box·자식 Unicode 텍스트/소유권·단일 배치·입력 불변, 잘못된 parentListNode의 측정 전 거부가 통과했습니다. 실제 table-bug의 인라인 자식5개는 원문 폭을 유지해 root2282의 InlineObjectLineWidthOverflow/가용 폭/개체 폭을 보고합니다. 덧말 파일은 child391(parent381)의 UnsupportedNestedTableAnchor입니다. 두 파일을 성공으로 분류하지 않습니다. 중첩 부동/겹침·과대 자식 폭의 정확한 표시 정책과 실제 브라우저/원본 조판은 남습니다.

PAGE 기준 TOP/CENTER/BOTTOM을 본문 정책에 연결하고 row-bands 대신 whole 예약을 선택합니다. 고정 PAGE 표의 가로 경계는 종이 기준으로 검사하며 본문 폭보다 큰 원문 표를 축소하지 않습니다. 기존 PARA 기준 표의 가로 검사는 유지합니다. 실제 표381은665.213333px 폭이고 본문 폭은661.44px입니다. CENTER+원문 offset은 왼쪽 본문 경계도 조금 넘지만 종이 안에 있어 고정 배치가 가능합니다. 종이 밖 offset은 여전히 TablePageWidthOverflow입니다.

실제 표381과 그 직접 셀 문단만 선택한 테스트 조각에서 전체 table-body 경로의 paginated/모든 셀 box/앵커 연결을 확인했습니다. 이 조각은 포함된 중첩 표 내용 전체를 배치한 결과가 아니며 전체 원본 성공으로 계수하지 않습니다. 원본 전체는 다음 표391(parent381)의 UnsupportedNestedTablePagePolicy로 거부됩니다. 해당 노드와 정책 이유는 renderer layout/dataset에 남습니다. 뒤쪽 표1068도 parent381이며 별도로 BEHIND_TEXT가 미지원입니다.

단독 실제 계획/제품 table-body 단면·종이 밖 거부·예약/타입 정책·원본 거부 진단5/5 종료코드0입니다. 기본 WASM 승격·전체 중첩/겹침 조립과 원본 한글 조판 검증은 아직 남습니다.

후보 `field-label-display-owned-api`(SHA256 39c827edcce665efcce4b40c9a70d47d0d1f74a1ac63013972d2b10a49692a1f)에서 `table-page-anchor-reference`, `table-page-anchor-policy`, `field-label-display` 테스트5/5 종료코드0입니다. 잘못된 타입/범위/인라인 및 부동 모드 조합의 기존 boolean 판정 동치·거부 이유·실제 표 소유권·renderer 진단을 검사했습니다. 실제 브라우저/원본 조판 완료 검사가 아닙니다.

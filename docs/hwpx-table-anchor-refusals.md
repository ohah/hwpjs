# 실제 표 배치 거부의 진단

## 현재 상태와 검증 경계

현재 구현은 PAGE 기준 전체 표 예약, 부모 셀 안의 인라인 중첩 표, 조건부 TOP_AND_BOTTOM 부동 자식 및 뒤쪽/앞쪽 자식의 측정·투영·paint/hit 연결을 포함합니다. 인라인 자식과 뒤쪽/앞쪽 자식이 같은 문단을 공유하는 조합도 지원합니다. 중첩 본문은 원문 폭을 보존하는 visible 경로를 사용하며 셀 밖 가로 배치는 허용하되 최종 종이 경계를 검증합니다. 아래 단계별 기록의 `아직 미지원`, `다음 작업`은 해당 단계 당시 상태이며 최신 지원 판정으로 사용하지 않습니다. 현재 제한은 일반 글자가 섞인 부동 감싸기, 다단계 부동 계층, 캡션·줄 높이 영향 및 원본 조판 동치입니다. 실제 table-bug는 폭 측정 이후 별도 UnsupportedPageFlow가 남습니다.

2026-10-13 후보39c827ed에서 정확한 파일 선택으로 `table-page-anchor-reference`와 `nested-floating-flow-reservation` 2/2를 재실행해 통과했습니다. 실제 덧말 문서의 측정 기반 배치 증거이며 전체 픽스쳐 지원 완료가 아닙니다.

같은 후보를 loopback 서버로 제공해 Chromium에서 실제 덧말 파일을 업로드했습니다. 업로드 명령은 성공했으나 이후 준비 상태 조회·Canvas dataset 조회·세션 종료 명령이 반환되지 않았습니다. 자동화 daemon은 살아 있었고 샘플은 대기 상태였으므로 제품의 무한 루프나 화면 성공으로 판정하지 않습니다. 소유 Chrome/daemon/server의 정확한 PID를 확인해 종료했습니다. 실제 글꼴 화면·편집 후 재조판·다운로드 검증은 미확인으로 남습니다. 기본 제품 WASM은 승격하지 않았습니다.

## 단계별 구현 이력

원문 폭 visible 배치: `measureNestedTable`은 reject/clip 외에 명시적 visible 모드를 제공합니다. 기본 저수준 reject 계약은 유지하고 본문 연결만 visible을 선택합니다. 셀 projection은 가로 셀 경계를 완화하지만 높이·음수 좌표·소유권·행 예산 검사는 유지하며 pageClip을 새로 붙이지 않습니다. 중첩 box/row의 positionOwnerTableNode가 부모 표 가로 이동을 함께 전달합니다. 최종 본문 위치 조정 후 `nestedTablePaperBounds`가 각 중첩 셀의 실제 페이지 paper와 유한 좌표·종이 네 경계를 검사합니다. 종이 밖은 NestedTablePaperOverflow로 거부합니다.

실제 의료장비 파일은 주입 metric 폭4/높이12에서 paginated이며 모든 표 셀을 중복 없이 배치합니다. 인라인 자식1064의 실제 셀 폭은48008/75px로 보존하고 clipping 없이 종이 안에 있습니다. 엄격 모드는 여전히 독립 원문 가용 폭/예약 폭과 일치하는 InlineObjectLineWidthOverflow를 반환합니다. 합성 과대 자식240px/부모200px 표시·부모10px 이동에 자식10px 이동·종이 밖 과대 자식 거부·기준 부재/비유한 좌표 반례 및 실제 덧말 저장/재열기 회귀12/12 종료코드0입니다. table-bug는 원문 폭을 읽은 뒤 UnsupportedPageFlow로 남아 전체 지원 성공이 아닙니다. 실제 의료장비 브라우저 화면·편집 UI·원본 한글 조판 동치는 미검증이며 기본 WASM을 승격하지 않았습니다.

의료장비 폭 넘침 루트 원인: 독립 Python ZIP/XML은 인라인 자식의 실제 부모 tc와 tbl을 조상 경로로 찾습니다. 부모 cellSz.width=47730, hasMargin=0이므로 cellMargin의141이 아니라 부모 inMargin의283을 좌우에서 차감합니다. 현재 가용 폭은(47730-283-283)/75=628.853333px입니다. 자식 sz.width=48008에 outMargin141+141을 더한 원문 예약 폭은643.866667px입니다. native/JS 결과가 두 독립 식과1e-8 오차 이내로 일치했고 테스트2/2 종료코드0입니다. 이 거부는 해당 폭 측정 오류가 아니라 현재 셀 내부 배치 정책에서 원문 크기를 허용하지 못하는 제한입니다. 원문이 잘못된 문서라고 단정하지 않으며, 셀 밖 배치의 종이 경계·겹침·선택/paint 의미는 추가 구현과 외부 조판 비교가 필요합니다. 폭 축소·셀 여백 무시·자동 clipping으로 완료 처리하지 않습니다.

혼합 중첩 앵커 연결: `measureInlineObjectParagraph`의 명시적 zeroWidthUnits는 부동 개체 앵커의 논리 UTF-16 위치를 유지하되 폭과 개체 높이를 행에 추가하지 않습니다. 일반 인라인 개체는 기존 크기로 예약하며 전체 U+FFFC가 정확히 두 집합에 배정되어야 합니다. 중복·미존재·서로 겹치는 위치 및 결합 grapheme는 거부합니다. `measureNestedTable`이 소유권을 검증한 자식에서만 해당 위치를 전달하며 인라인/부동 혼합의 일괄 거부를 제거했습니다. TOP_AND_BOTTOM 문단 감싸기 제한은 기존 예약 계산기가 계속 검사합니다.

독립 XML 조사에서 참조 `.hwpx` 파일의 혼합 호스트24개 중 부모 표 안의 혼합 호스트는2개였습니다(확장자 `.hwpx` 순회·해독 불가 ZIP/XML 제외이므로 전체 포맷 census가 아닙니다). 행정업무운영 편람 section2는 앞쪽+인라인, 의료장비 파일 section0은 TOP_AND_BOTTOM+인라인입니다. 실제 의료장비 파일은 현재 mixed 앵커 측정을 통과한 뒤 자식1064의643.866667px 폭이 부모628.853333px보다 커 InlineObjectLineWidthOverflow로 거부합니다. 원문 폭·입력·부분 성공 미반환을 검사했고 전체 문서 성공으로 계수하지 않습니다. 합성 behind/front 혼합의 단일 셀 생성·논리 앵커·폭0·레이어·table 배열 역순 불변, Unicode/중복/잘못된 앵커 반례와 기존 실제 덧말 저장/재열기·table-bug·인라인 회귀13/13 종료코드0입니다. 실제 앞쪽 혼합 문서 전체 배치/브라우저/원본 조판 증거는 아직 없습니다.

2026-10-13 저장 후 재조판 회귀: `dutmal-table-reflow.test.mjs`는 실제 덧말 파일을 Worker/WASM으로 열고 본문 덧말 값을 Unicode로 변경한 뒤 현재 배치·저장·undo·redo·재열기 배치를 검사합니다. 모든 표 셀의 단일 투영, 원문 표 배치값과 부모/셀 소유 관계, 조판 입력 불변 및 undo 원래 배치 복원이 통과했습니다. 저장 시 오래된 줄 캐시가 제거되어 후속 XML 노드 번호가 이동하므로 재열기 전후 번호 동일성을 요구하지 않습니다. 현재 세션의 번호로 각 배치의 소유권을 검사하고 세션 간에는 표/셀 역할을 비교합니다. 기존 Worker 전체 ZIP 독립 oracle과 실제 표 배치 검사까지 정확한 선택3/3 종료코드0입니다. 주입 metric·Canvas 대역이며 실제 글꼴/원본 조판 증거로 합산하지 않습니다.

브라우저 진단 후속: 새 세션의 업로드 직후 snapshot은 응답했으나 이후 해당 탭의 직접 CDP Runtime/Debugger/Page 명령도 응답하지 않았습니다. Browser.getVersion과 새 탭의 Runtime.evaluate는 응답했고, 별도 진단 탭은 load와 업로드 직후 Runtime 응답까지 확인했습니다. 이 증거만으로 parser/renderer의 무한 루프나 자동화 daemon 단독 결함을 확정하지 않습니다. 실제 UI 편집 후 재조판 검증은 여전히 미확인입니다. 소유 진단 탭·Chrome·daemon·서버를 종료했습니다.

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

TOP_AND_BOTTOM 연결: 일반 글자가 없는 보호 앵커 호스트의 PARA/TOP·flow_with_text·비겹침 표는 현재 측정 문단 기준과 원문 높이/offset으로 셀 흐름 아래 경계를 예약합니다. 뒤쪽/앞쪽 표는 공간을 추가하지 않습니다. 일반 글자가 섞인 감싸기·다른 기준/정렬은 아직 명시적으로 미지원입니다.

실제 파일에서 빈 중앙 정렬 문단의 paragraphX(글자 시작점)를 전체 문단 영역의 시작으로 오해해 child391이 종이 밖으로 밀리는 결함을 재현했습니다. layout은 기존 paragraphLineGeometry로 정렬 전 paragraphReferenceX를 별도로 만들고 부동 기준이 이를 사용합니다. 부모 표의 가로 이동도 positionOwnerTableNode로 자식 셀/행/그림에 전달합니다. 부동 셀 조합에서 flowPictures가 누락될 수 있는 경로도 보존하도록 보강했습니다.

후보39c827ed의 실제 덧말 파일 전체를 폭4/높이12로 측정한 결과 paginated,93행·84개 셀 box입니다. 모든 표 셀을 중복 없이 배치하고 모든 현재95문단의 UTF-16 범위를 검사했습니다. 소비된 루트 표 앵커만 검증용 interval로 보완했으며 render/model에 행을 삽입하지 않았습니다. 잘못된 text 변조는 거부되고 원문 표시 데이터는 불변입니다. Canvas 대역 renderer도 pageLayoutError 없이 배치됩니다. 숫자 폭8/기본 높이20은 child391의 실제 측정 내용이 원문 사각형을 넘으므로 NestedFloatingTableMeasuredOverflow로 거부하며 이를 축소하지 않습니다.

예약·정렬 기준·그림 보존·부모/자식 이동·실제 문서 전체 범위와 중첩/덧말 집중10/10, 정확한 파일 선택 wrapper로 grid/row-bands/HWP5 중첩9/9 종료코드0입니다. 실제 브라우저/다운로드/저장 편집 후 재조판·원본 한글 페이지 동치는 별도 검증이 남습니다. 기본 WASM도 승격하지 않았습니다.

원문 행 높이와 UI 하한 분리: 실제 child391의 폭4/높이12 주입 측정은 기존28px 최소 행 높이 때문에392.613333px가 되어 원문 사각형 높이311.866667px를 초과했습니다. minimumRowHeight를 명시적으로0으로 선택하는 원문 기반 중첩 측정에서는310.266667px이며 원문 크기 안에 들어옵니다. tableGrid의 일반 기본28px는 유지하고 measureTableCells가 초기/최종 grid에 같은 최소값을 전달합니다. 음수/비유한 최소값은 거부하며 행 높이와 측정 내용은 축소하지 않습니다. 원문 크기·최소값0/기본·측정 크기 성장·입력 불변, 실제 높이 비교와 중첩/그림/페이지 회귀11/11 종료코드0입니다. 숫자 metric 주입이며 실제 글꼴/브라우저/원본 줄바꿈 일치 검증이 아닙니다. TOP_AND_BOTTOM 셀 흐름 연결은 다음 작업으로 남습니다.

재귀 측정→투영→paint 연결: 뒤쪽/앞쪽 부동 자식(textWrap2/3, 명시적 affect_line_spacing=false, 캡션 없음)은 현재 부모 문단의 소유 앵커를 확인하고 floatingTables descriptor를 생성합니다. 앵커는 UTF-16 한 글자로 보존하되 글자 폭0으로 측정하고 renderer의 개체 앵커 생략 경로로 중복 표식을 그리지 않습니다. 페이지 투영 결과의 tablePaintLayer는 뒤쪽→본문→앞쪽 paint와 동일 순위의 공간 hit 검사에 사용합니다. geometry 배열을 paint 순서로 재정렬하지 않습니다.

합성 데이터의 producer부터 table-body/페이지 투영/실제 renderer 대역까지 child text·cell 단일 생성/앵커 폭0·뒤쪽/앞쪽 태그·paint 순서·겹치는 뒤쪽보다 본문 text hit 우선·입력 불변, 실제 원본 거부 진단과 HWP5 중첩/그림·덧말 회귀10/10 종료코드0입니다. 실제 table-bug 폭 넘침 거부도 유지합니다. 부동 자식의 캡션/줄 높이 영향·인라인과 혼합 앵커·여러 단계 부동 계층·TOP_AND_BOTTOM 감싸기와 실제 브라우저/원본 조판은 남습니다. 특히 덧말 원본의 child391(textWrap1)은 계속 UnsupportedNestedTableAnchor이며 전체 원본 지원 완료가 아닙니다.

부동 셀 조합은 `projectNestedFloatingCellContent`가 현재 문단 범위 확인→기준 사각형→소유자 위치→측정 셀 페이지 투영을 한 경로로 연결합니다. 부모 table/list·host·현재 U+FFFC 앵커·중복 노드/앵커와 누적 행 예산을 검사합니다. 기존 projectTablePageFragments는 명시적 flow.floatingTables가 있을 때만 이 조합을 호출합니다. 부모/자식 cell box·자식 텍스트 단일 추가·오류 뒤 부분 성공 미반환·행 예산 거부·입력 불변을 위치/문단/투영 테스트3/3 종료코드0으로 확인했습니다. 실제 재귀 측정기가 이 descriptor를 생산하는 경로와 renderer의 뒤쪽/앞쪽 paint 순서는 아직 연결하지 않았으므로 실제 부동 중첩 표 지원 완료가 아닙니다.

현재 문단 기준 단면: `nestedParagraphReference`는 현재 측정 행의 section/paragraph와 완전한 UTF-16 텍스트 범위를 pageParagraphCoverage로 확인하고, 행의 명시적 width/textHeight와 공통 textTop으로 기준 사각형을 만듭니다. 부모 셀/flow 전체 높이와 원문 줄 캐시는 사용하지 않습니다. 분할 페이지/단·transform/clip·비유한 높이/누락·중복/Unicode 절단은 거부합니다. 현재 행 높이16과 flow높이351을 구분해 부동 BOTTOM 위치 계산에 전달하는 검사 및 위치/셀 투영3/3 종료코드0입니다. 원본 한글의 PARA 기준 정의나 실제 글꼴 shaping 동치 증명이 아니며, 재귀 조판의 부동 자식 생산·paint 연결은 계속 남습니다.

부동 중첩 셀 투영 단면: `projectNestedFloatingTable`은 명시적으로 계산한 현재 위치/소유자와 페이지 정보를 받고 기존 whole band·source padding·projectTablePageFragments를 재사용합니다. 측정한 grid가 원문 위치 사각형을 넘으면 NestedFloatingTableMeasuredOverflow로 거부하며 축소/잘림으로 바꾸지 않습니다. 뒤쪽/앞쪽 layer와 원문 사각형을 보존합니다. 소유자 변조·잘못된 column ordinal·좌표 덧셈 오버플로 반례, 셀 box/Unicode 텍스트·입력 불변 테스트가 통과했습니다. 최초 작은 표 측정에는 일반 grid 최소 폭이 적용돼 넘침이 발생했고, 명시적 원문 열 폭20px을 주입한 측정으로 테스트 계약을 교정했습니다. 위치/셀 투영2/2 종료코드0이며 아직 재귀 조판/레이어 paint 호출에 연결하지 않았습니다.

부동 중첩 기준 조사: 실제 덧말 파일 host30의 원문 줄 높이는1200HU(16px)인데 부모 셀 높이는26353HU(351.373333px)입니다. child1068은 PARA/BOTTOM/BEHIND_TEXT이므로 부모 셀을 문단 사각형으로 대체하면 전혀 다른 위치가 됩니다. 원문 줄 값은 편집 후 최신 조판으로 간주하지 않습니다.

`positionNestedFloatingTable`은 현재 소유 문단 사각형과 종이/필요한 기준 상자를 명시적으로 받아 기존 placeFloatingTable 계산을 재사용합니다. section·부모 table/list·host paragraph 식별자를 검사하고 뒤쪽 layer를 구분하며, 셀 밖이지만 종이 안인 배치는 clamp하지 않고 별도 상태로 보고합니다. 종이 밖·잘못된 소유권/타입·부재/비유한 기준 반례와 입력 불변 테스트1/1 종료코드0입니다. 이 위치 단면은 아직 재귀 셀 측정/paint에 연결되지 않았으며 현재 문단 높이를 정확히 제공하는 조판 경로와 중첩 그림/겹침을 구현해야 합니다.

후속 중첩 연결: 기존 validateNestedTableOwnership과 measureNestedTable을 본문 경로에서 재사용합니다. 소유권을 먼저 검증한 뒤 루트 표만 본문 entry로 조립하고 자식은 부모 셀의 재귀 측정/페이지 projection에 포함합니다. 자식 표의 wrap 값으로 루트 페이지 경로를 선택하지 않습니다.

합성 인라인 중첩 표의 두 cell box·자식 Unicode 텍스트/소유권·단일 배치·입력 불변, 잘못된 parentListNode의 측정 전 거부가 통과했습니다. 실제 table-bug의 인라인 자식5개는 원문 폭을 유지해 root2282의 InlineObjectLineWidthOverflow/가용 폭/개체 폭을 보고합니다. 덧말 파일은 child391(parent381)의 UnsupportedNestedTableAnchor입니다. 두 파일을 성공으로 분류하지 않습니다. 중첩 부동/겹침·과대 자식 폭의 정확한 표시 정책과 실제 브라우저/원본 조판은 남습니다.

PAGE 기준 TOP/CENTER/BOTTOM을 본문 정책에 연결하고 row-bands 대신 whole 예약을 선택합니다. 고정 PAGE 표의 가로 경계는 종이 기준으로 검사하며 본문 폭보다 큰 원문 표를 축소하지 않습니다. 기존 PARA 기준 표의 가로 검사는 유지합니다. 실제 표381은665.213333px 폭이고 본문 폭은661.44px입니다. CENTER+원문 offset은 왼쪽 본문 경계도 조금 넘지만 종이 안에 있어 고정 배치가 가능합니다. 종이 밖 offset은 여전히 TablePageWidthOverflow입니다.

실제 표381과 그 직접 셀 문단만 선택한 테스트 조각에서 전체 table-body 경로의 paginated/모든 셀 box/앵커 연결을 확인했습니다. 이 조각은 포함된 중첩 표 내용 전체를 배치한 결과가 아니며 전체 원본 성공으로 계수하지 않습니다. 원본 전체는 다음 표391(parent381)의 UnsupportedNestedTablePagePolicy로 거부됩니다. 해당 노드와 정책 이유는 renderer layout/dataset에 남습니다. 뒤쪽 표1068도 parent381이며 별도로 BEHIND_TEXT가 미지원입니다.

단독 실제 계획/제품 table-body 단면·종이 밖 거부·예약/타입 정책·원본 거부 진단5/5 종료코드0입니다. 기본 WASM 승격·전체 중첩/겹침 조립과 원본 한글 조판 검증은 아직 남습니다.

후보 `field-label-display-owned-api`(SHA256 39c827edcce665efcce4b40c9a70d47d0d1f74a1ac63013972d2b10a49692a1f)에서 `table-page-anchor-reference`, `table-page-anchor-policy`, `field-label-display` 테스트5/5 종료코드0입니다. 잘못된 타입/범위/인라인 및 부동 모드 조합의 기존 boolean 판정 동치·거부 이유·실제 표 소유권·renderer 진단을 검사했습니다. 실제 브라우저/원본 조판 완료 검사가 아닙니다.

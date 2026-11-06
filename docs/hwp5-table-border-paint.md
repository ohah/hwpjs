# HWP5 셀 배경과 테두리의 Canvas 연결

2026-11-06 이후의 채우기 없음·단색·무늬·선형 그라데이션 지원과 최신 검증은 [셀 테두리·채우기 배치](table-cell-fill-batches.md)가 소유합니다. 아래 단색 전용 설명과 초기 후보 수치는 당시 범위의 기록입니다.

2026-10-24 현재 추가된 noori의 0.5mm DOUBLE_SLIM 지원과 배경색 대조는 [공통 테두리 검증](demo-page-frame-and-noori-borders.md)을 따릅니다. 아래의 복합선 미지원 표기는 이 좁은 후속 지원을 제외한 이전 범위입니다.

## 책임

[테두리·배경 원본](hwp5-border-fill-sources.md)이 current DocInfo와 WASM/JS 원값을 소유합니다. `hwp5-table-border-content.mjs`는 요청마다 리소스를 한 번 조회하고 문서 교체/오류 시 이전 스냅샷을 지웁니다. 셀은 기존 layoutSource의 table_record_node/list_node/border_fill_id로 연결합니다. HWPX XML 노드나 fillBrush report를 만들어 HWP5 원본으로 위장하지 않습니다.

`hwp5-table-border-plan.mjs`는 HWP5 원값을 공통 table-border-paint가 받는 fill/strokes로 변환합니다. COLORREF 변환은 공통 colorrefCss를 사용합니다. 원본 셀 크기·패딩·문단/페이지 배치는 바꾸지 않습니다. 기존 표 배경→선택→글자 그리기 순서를 공유합니다.

## 최초 단색 표시 정책과 후속 범위

flags=1, pattern kind=-1, 추가 정보/미해석 꼬리가 없는 단색을 지원합니다. 명시 alpha는 pattern=0이어야 하며 비영 투명도는 아직 거부합니다. alpha 부재의 완결된 구형 단색은 표시 계층에서 불투명으로 취급하되 원본 API의 null은 유지합니다. 0xffffffff 배경 sentinel은 색을 만들지 않습니다. 이미지·그라데이션·무늬·미지 비트는 평면 단색으로 대체하지 않습니다.

선 종류는 실제 wire의0=없음/1=실선, 굵기는 기존 명세의16단계 mm 값을 픽셀로 변환합니다. attributes가 활성화한 대각선/효과와 복합 선은 아직 지원하지 않습니다. 테두리만 거부되더라도 이미 확인된 단색은 보존하고 unavailable 진단을 유지합니다. 기본 대각선 선 정보는 attributes=0이면 활성 선으로 그리지 않습니다. 잘못된 셀/표/리소스 소유권과 중복은 거부하며 임의 색이나 선을 추가하지 않습니다.

구 WASM의 선택 export 부재는 Hwp5BorderFillSourcesAbiUnavailable로 남깁니다. 기존 proxy 윤곽 경로를 색상 지원 완료로 집계하지 않습니다. 새 API는 선택 기능이므로 구 WASM으로 문서를 여는 것 자체를 차단하지 않습니다.

## 검증과 제한

실제3-09월_교육_통합_2022.hwp의38개 리소스를 독립 CFB.js+Node zlib/레코드 해석과 전체 필드 대조했습니다. 실제 Worker에서49개 회색 셀이 각각 native 리소스와 공통 Canvas fillRect #e5e5e5로 연결됐습니다. BGR 순서,16단계 굵기, 미지원 선/효과와 채움의 독립 판정, 비영 alpha/미해석 꼬리/잘못된 소유권/중복·문서 교체/구 ABI도 반대군으로 확인했습니다. HWPX 표 색상/선택 렌더와14쪽 회귀4문서를 포함한7파일22/22·실패/취소/생략0·종료코드0입니다.

실제 Chromium `hwp5-table-fill-browser-GOxdsi`는 section0/paragraph1331의 회색 확률과통계 셀에 trusted 클릭/Unicode 입력→undo/redo→독립 HWP5 전체 레코드/비대상 스트림 검사→다운로드/재업로드를 통과했습니다. 화면 안 caret/Canvas hit 모두true이며 전체 Canvas의 불투명 #e5e5e5 픽셀110454개를 확인했습니다. 해당 셀 면적만의 계수나 모든 셀/페이지 픽셀 동치가 아닙니다. 화면을 직접 확인했고 검증 브라우저·임시 서버의 verified/inactive/serverExited 모두true입니다.

첫 브라우저 도구는 HWP5 editable 문단에 selectable 속성도 필수라고 잘못 요구해 대상을 찾지 못했습니다. 실제 문단 플래그를 대조해 공통 검색 도구와 같은 editable-or-selectable 선택으로 고쳤습니다. 이 도구 실패를 제품 파서 버그나 통과 실행으로 기록하지 않습니다.

이 파일의 페이지 배치는 여전히 UnsupportedHwp5GroupChild입니다. 위 브라우저 검증은 논리 미리보기이며 HWP5 저장도 기존 명시 allowStaleLayout 실험 경로를 사용합니다. 배경색 연결을 원본 한글 조판/재배치 저장 완료로 확대하지 않습니다. 기본 WASM/공용 데모는 교체하지 않았습니다.

색상 연결을 포함한 전체975 재검사 `zig-out/verification/hwp5-border-fill-alpha/corpus-table-fill/reference-page.jsonl/.stderr`는0f943e83 후보·--distribution·--charts에서 종료코드0·입력975/소스/후보 지문 불변으로 끝났습니다. 완전461/부분48/불가433/runtimeErrors0이며 직전461개 결과와 비교한 새 성공/후퇴/기존 성공 페이지 수 변경은 모두0입니다. 색상 표시 추가를 페이지 지원 수 증가로 집계하지 않습니다. 이후 곡선 원본 API/Worker 확장은 이 전체 검사 이후의 별도 변경입니다.

# 생성 표의 각주·미주 페이지 배치

생성 셀의 LF 저장 의미와 메모리/출력 한도는 [HWPX 생성 셀 XML](hwpx-created-cell-xml.md)이 소유합니다. 페이지 배치 성공만으로 저장 XML 의미까지 검증됐다고 해석하지 않습니다.

노트가 없는 문서에서 원본 인라인 표와 새 표를 함께 배치하는 경로는 [원본·생성 표 페이지](generated-source-table-pages.md)가 소유합니다. 원본 표와 노트까지 모두 섞인 조합의 지원으로 확대하지 않습니다.

현재 실제 HWPX footnote-endnote 픽스쳐의 각주·미주 안 생성 표를 측정 페이지에 연결했습니다. HWP5 첫 각주의 생성 표도 후보 WASM에서 측정 페이지 모드를 확인했습니다. 원본 한글 조판 동치나 모든 노트/객체 조합의 완료를 뜻하지 않습니다.

## 호스트 안에 남아 있는 번호 제어

`created-host-text-anchors.mjs`는 원본 U+FFFC만 분류합니다. 기존 `storedAutomaticNumberText`로 해석 가능한 번호는 글자로 측정하고, 기존 structural anchor와 소유 문단이 일치하는 page control은 폭 없는 원본 위치로 유지합니다. 생성 표 placeholder와 번호/숨김 제어를 같은 ID나 객체로 합치지 않습니다. 삽입 위치가 같으면 원본 제어 메타데이터를 생성 placeholder 뒤로 이동시켜 표를 번호나 숨김 앵커로 오인하지 않게 합니다. 창 오프셋도 기존 projection으로 변환합니다.

공통 inline 측정의 `textAnchorUnits`는 원본 글자 제어 위치만 지정합니다. 중복·비정수·일반 글자 위치·숨김 위치와 겹침·표 위치와 겹침은 거부합니다. 중복 번호, 알 수 없는 표시 형식, 페이지에 따라 달라지는 HWP5 번호, 출처 없는 개체는 여전히 `UnsupportedCreatedTableHostControls`입니다. native 원문·번호 값·편집 좌표는 바꾸지 않습니다.

softline02 후보의 실제 HWP5 anchor-display와 HWPX note-prefix-worker, 새 text-anchor 분류/공통 측정, 기존 자동 번호·host·mixed inline 회귀의 정확한8파일23/23·실패/skip/cancel0·exit0을 확인했습니다. 실제 HWP5 첫 각주의 native8/표시1과 host 입력/undo/redo, `measured-note-created-inline` 모드를 검사했습니다. 같은 위치/번호 뒤/emoji 앞의 생성 표, 원문/입력 불변, 잘못된 제어 거부 반례도 포함합니다. HWP5 native 확장 연결은 아직 로컬 후보이며 이번 공통 JS 변경 게시와 별개입니다. 실제 새 브라우저·디바이스는 실행하지 않았습니다.

## 소유권과 예약

`created-note-body-measurement.mjs`는 native 생성 셀과 호스트의 인라인 측정을 노트 로컬 좌표에 결합합니다. 원문과 번호 접두사·셀 box/clip을 분리하며 기존 노트 바인딩·분리선·쪽 예약 정책을 재사용합니다. 생성 셀 주소를 원본 paragraph/list 노드로 바꾸지 않습니다. 생성 행에는 노트 목록을 `noteListNode`로 별도 보존해 cell hit가 다른 노트 목록과 섞이지 않게 합니다.

각주 표 높이는 기존 footnote reservation에 포함하며 노트 영역 확정 때 셀 box·clip·번호를 한 번만 이동합니다. 생성 표가 있는 미주는 현재 whole-note 슬롯 하나를 페이지 커서에 예약한 뒤 원문/셀/번호를 함께 투영합니다. 큰 객체를 셀 안에서 나누거나 큰 노트를 여러 페이지에 분할한 것은 아닙니다. 페이지보다 큰 노트 표는 `CreatedNotePageHeightOverflow`로 빠르게 거부하고 native 값과 블록 fallback을 유지합니다.

노트 내부의 강제 쪽/단 나눔·다단·미지원 생성 옵션은 아직 거부합니다. source note owner/identity 부재·비정규 u64·중복 identity도 명시적 오류입니다. 원문 coverage에서 생성 셀을 별도 namespace로 제외하고 노트 원문 전체를 검증합니다. 출력 행 예산은 번호 레이어까지 포함합니다.

## 본문 표와 노트 표의 동시 배치

`created-body-flow-measurement.mjs`가 일반 본문과 노트 문서의 생성 표 측정·물리 페이지 투영을 함께 소유합니다. 기존 인라인 경로에서 분리한 같은 구현이며, 본문 행마다 한 높이만 예약하고 원문 행/셀/번호 레이어를 확정 위치로 투영합니다. 문단 전체를 한 객체로 묶거나 source 편집 좌표를 바꾸지 않습니다.

`note-body-page-layout.mjs`는 본문 표와 노트 표를 소유 문단으로 분리하고 전역 identity 중복을 먼저 검사합니다. 노트 측정기는 계속 노트 표만 받습니다. 본문 표가 있는 행의 원문 참조 조각은 `referenceRows`에 보존하며 `footnote-column-reservation.mjs`는 그 조각의 실제 section/paragraph/unit 범위로 각주 높이를 예약합니다. 생성 셀의 문자열/가짜 source 번호를 각주 참조로 해석하지 않습니다. 예약 후보는 이전 페이지에 캐시하지 않습니다.

HWP5 본문의 native 각주 참조는 기존 binding이 검증한 위치만 `sourceTextAnchorUnits`로 전달합니다. 번호 값을 합성하거나 HWPX XML 보고서를 만들지 않고 기존 원문 U+FFFC 표시/폭을 유지합니다. 이것은 한글 원본 번호 glyph의 완전한 표시 구현을 뜻하지 않습니다. 해당 위치와 숨김 제어가 겹치거나 위치가 잘못되면 거부합니다. 기존 그림/차트 혼합·쪽 번호 제어 등 미지원 조합을 이 경로에서 우회하지 않습니다.

실제 footnote-endnote의 HWP5/HWPX 각각에서 본문1·각주2·미주2의 생성 표5개, Canvas controller 생성/입력, 모서리 hit/원문 coverage/쪽 범위·본문과 각주 영역 비겹침,10회 undo 원본 바이트·10회 redo 저장 바이트, 저장본 재열기의5셀 문자열을 검사합니다. DOM/Canvas는 대역이고 새 브라우저·디바이스는 실행하지 않았습니다. 순수 예약 반례는 페이지/단/section/소유 문단이 다른 참조를 예약하지 않는 것과 같은 행의 참조2개 합산·입력 불변을 확인합니다. 본문/노트 사이 중복 identity와 작은 행 예산도 거부합니다.

게시 코드만 분리한 HEAD 의존성+기본 WASM에서 혼합 worker/예약/원문 제어/기존 인라인 페이지/기존 노트 worker/노트 영역6파일16/16·실패/skip/cancel0·exit0입니다. 최초 분리 환경의 parashape fixture 누락은 추출 목록을 고친 뒤 같은6파일을 다시 실행했으며, 누락 실행은 통과로 계수하지 않습니다. 후보 softline02의 HWP5/HWPX 혼합 worker2파일도 재열기까지2/2·exit0입니다. 같은 새 HWPX 혼합 테스트를 수정 전 소스에서 실행하면 첫 본문 표가 UnsupportedCreatedTableNoteOwner/블록 fallback으로 실패하여 부정 대조가 됩니다. 독립 CFB/XML 저장 보존은 앞선 네 노트 검사를 따르며 새 혼합 표 검사는 같은 엔진 저장/재열기/이력 증거와 구분합니다.

## 검증

softline02후보에서 실제 note-prefix-worker/새 area-projection/기존 note-body-bindings/automatic-number-content/HWP5 note-page-policy의 정확한5파일13/13·실패/skip/cancel0·exit0입니다. 각주2·미주2에 각각 표/셀 문자열을 생성하여 네 셀의 모서리 hit·noteListNode·pageOrdinal·page 범위, 8회 undo의 원본 바이트·8회 redo의 저장 바이트 일치를 검사했습니다. 단일 각주의 독립 Python ZIP/XML autoNum·비대상 멤버 보존 검사는 유지합니다.

순수 area 검사에서는 셀 box/clip/번호의 단일 이동·입력 불변·이전 노트 번호 레이어까지 포함한 예산·너무 넓거나 폭이 없는 box 거부를 확인합니다. oversized native 각주 표도 데이터 손실 없이 fallback하며 undo로 원본 바이트가 복원됩니다. 이후 owner 중복/null/본문 오염 반례를 더한 note-prefix-worker/area-projection2파일6/6을 재확인했습니다. 앞선13개와 중복되는 검사를 합산하지 않습니다.

Canvas는 이벤트/paint 대역이며 이번 페이지 조합의 실제 브라우저/OS 입력은 미검증입니다. 새 브라우저·디바이스를 만들지 않았습니다. native 파서/쓰기 전체 기능이나 모든 픽스쳐 편집 완료로 해석하지 않습니다.

같은 본문 행이 참조하는 두 각주 표가 각각은 페이지의60% 높이로 들어가지만 합산 예약은 불가능한 실제 파생 표본도 확인했습니다. 기존 reservation의 columnBottom을 재사용한 사전 검사로 CreatedNotePageHeightOverflow를 반환하며 PageFlowLimit까지 반복하지 않습니다. 단독 과대 노트와 다른 경계입니다. 후보의 해당 단일 반례1/1·exit0이며 앞선 native 표 회귀와 구분합니다.

게시할9파일만 HEAD 의존성과 별도 디렉터리로 추출한 뒤 기본 WASM SHA256 `cbaaf27f858229fedd01b9996ce152bd31aa6d6f346481b7887bcc510ef68346`에서 새 note-prefix-worker/area-projection·기존 inline-page/note-editor4파일12/12·실패/skip/cancel0·exit0을 확인했습니다. WASM hash는 실행 전후 같고, 사용자 title-column-roundtrip staging diff hash도 그대로입니다. 새 native 기능/다른 미커밋 page-content 변경에 의존하지 않는 게시 범위를 검사한 결과입니다.

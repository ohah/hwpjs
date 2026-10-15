# 생성 표의 각주·미주 페이지 배치

현재 실제 HWPX footnote-endnote 픽스쳐의 각주·미주 안 생성 표를 측정 페이지에 연결했습니다. 원본 한글 조판 동치나 모든 노트/객체 조합의 완료를 뜻하지 않습니다. HWP5의 새 노트 표 조합은 별도 실측이 남아 있습니다.

## 소유권과 예약

`created-note-body-measurement.mjs`는 native 생성 셀과 호스트의 인라인 측정을 노트 로컬 좌표에 결합합니다. 원문과 번호 접두사·셀 box/clip을 분리하며 기존 노트 바인딩·분리선·쪽 예약 정책을 재사용합니다. 생성 셀 주소를 원본 paragraph/list 노드로 바꾸지 않습니다. 생성 행에는 노트 목록을 `noteListNode`로 별도 보존해 cell hit가 다른 노트 목록과 섞이지 않게 합니다.

각주 표 높이는 기존 footnote reservation에 포함하며 노트 영역 확정 때 셀 box·clip·번호를 한 번만 이동합니다. 생성 표가 있는 미주는 현재 whole-note 슬롯 하나를 페이지 커서에 예약한 뒤 원문/셀/번호를 함께 투영합니다. 큰 객체를 셀 안에서 나누거나 큰 노트를 여러 페이지에 분할한 것은 아닙니다. 페이지보다 큰 노트 표는 `CreatedNotePageHeightOverflow`로 빠르게 거부하고 native 값과 블록 fallback을 유지합니다.

생성 표가 노트 밖의 본문에도 함께 있거나, 노트 내부의 강제 쪽/단 나눔·다단·미지원 생성 옵션은 아직 거부합니다. source note owner/identity 부재·비정규 u64·중복 identity도 명시적 오류입니다. 원문 coverage에서 생성 셀을 별도 namespace로 제외하고 노트 원문 전체를 검증합니다. 출력 행 예산은 번호 레이어까지 포함합니다.

## 검증

softline02후보에서 실제 note-prefix-worker/새 area-projection/기존 note-body-bindings/automatic-number-content/HWP5 note-page-policy의 정확한5파일13/13·실패/skip/cancel0·exit0입니다. 각주2·미주2에 각각 표/셀 문자열을 생성하여 네 셀의 모서리 hit·noteListNode·pageOrdinal·page 범위, 8회 undo의 원본 바이트·8회 redo의 저장 바이트 일치를 검사했습니다. 단일 각주의 독립 Python ZIP/XML autoNum·비대상 멤버 보존 검사는 유지합니다.

순수 area 검사에서는 셀 box/clip/번호의 단일 이동·입력 불변·이전 노트 번호 레이어까지 포함한 예산·너무 넓거나 폭이 없는 box 거부를 확인합니다. oversized native 각주 표도 데이터 손실 없이 fallback하며 undo로 원본 바이트가 복원됩니다. 이후 owner 중복/null/본문 오염 반례를 더한 note-prefix-worker/area-projection2파일6/6을 재확인했습니다. 앞선13개와 중복되는 검사를 합산하지 않습니다.

Canvas는 이벤트/paint 대역이며 이번 페이지 조합의 실제 브라우저/OS 입력은 미검증입니다. 새 브라우저·디바이스를 만들지 않았습니다. native 파서/쓰기 전체 기능이나 모든 픽스쳐 편집 완료로 해석하지 않습니다.

같은 본문 행이 참조하는 두 각주 표가 각각은 페이지의60% 높이로 들어가지만 합산 예약은 불가능한 실제 파생 표본도 확인했습니다. 기존 reservation의 columnBottom을 재사용한 사전 검사로 CreatedNotePageHeightOverflow를 반환하며 PageFlowLimit까지 반복하지 않습니다. 단독 과대 노트와 다른 경계입니다. 후보의 해당 단일 반례1/1·exit0이며 앞선 native 표 회귀와 구분합니다.

게시할9파일만 HEAD 의존성과 별도 디렉터리로 추출한 뒤 기본 WASM SHA256 `cbaaf27f858229fedd01b9996ce152bd31aa6d6f346481b7887bcc510ef68346`에서 새 note-prefix-worker/area-projection·기존 inline-page/note-editor4파일12/12·실패/skip/cancel0·exit0을 확인했습니다. WASM hash는 실행 전후 같고, 사용자 title-column-roundtrip staging diff hash도 그대로입니다. 새 native 기능/다른 미커밋 page-content 변경에 의존하지 않는 게시 범위를 검사한 결과입니다.

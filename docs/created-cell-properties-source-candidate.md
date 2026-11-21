# 생성 표의 셀 속성

## 현재 구현과 검증 범위

HWP5와 HWPX에서 현재 세션에 만든 표의 셀을 클릭한 뒤 **표/셀 속성**을 열면 너비·높이, 단색 배경, 바깥쪽 네 변을 적용할 수 있다. 생성 셀은 Surface가 확인한 표 식별자와 행·열로 지정하며 한 번 적용할 때 실행 취소 한 단계가 생긴다. 저장한 표를 다시 열면 해당 셀은 새 문서의 원본 셀로 조회한다. [데모 사용법](../apps/docs/docs/guide/demo.md#새로-만든-표의-셀-속성)

- HWP5는 갤러리 manifest `40fec41e6f59437719d578bbf3ad1e2ece9a6fc3776e99da234f33b762ae082a`의 실제 2×2 표에서 선택한 셀에 적용과 실행 취소·다시 실행, 저장과 새 편집기 재열기를 확인했다. HWP5 조판 재계산 거부 시 데모의 명시적 저장 허용 옵션을 사용했다.
- HWPX는 갤러리 manifest `5670cc16a55ed467715f5339d9e01f7a17fdad95c1ed272ae8efa56d55138fd2`에서 같은 편집 순서를 확인했다. 다시 연 셀의 속성 창에 63.50×31.75mm, 배경 `#123456`, 테두리 `#234567`이 나타났고 캔버스에서도 두 색을 확인했다. 앞서 만든 수정본을 그대로 열어도 두 색이 표시됐다. 배경색만 있는 최소 형식은 작성 출처와 정확한 단색 값 조건을 만족할 때 원본 셀 배경으로 읽는다.
- 두 형식 모두 독립 저장 검사에서 나머지 세 셀의 보존과 자원 복사 후 쓰기를 확인했다. 실행 취소 결과의 전체 파일은 편집 전 저장본과 일치했고, 다시 실행 결과는 편집 후 저장본과 일치했다.

이 검증은 Vanilla 데모의 단색과 바깥 테두리 범위다. 생성 셀의 채우기 없음·무늬·그라데이션·대각선과 프레임워크별 전체 편집 흐름에는 별도 검증이 필요하다.

## 초기 후보 기록

아래는 전송·저장·UI를 연결하기 전후의 단계별 기록이다. 당시의 미연결 사항은 현재 범위를 설명하는 위 절과 함께 읽는다.

공개 preimage는 commit5ecc206b8a20962813729884932ae4be853feef7/tree383fc4643328a2898be0607bfb836ddd2ea383b8이다. 당시 공개 manifest343853926bf85211c5d4909262183348350deda97a393124311c8f6ef051dddf와 WASM9235b2430324e486fe24b093f18da52e5e5e148e2540c043a68c4346ffbebec5는 Main 제공 핀이다. 이 후보에서는 새 공개 페이지를 로드하거나 WASM을 실행하지 않았다. 공식 창의 비교·자체 빈2×2 raw 근거는 [기존 관측](table-dialog-reference.md)이 소유한다. 이 작업은 외부 구현을 참조하지 않는다.

## 현재 source inventory

| 종류 | 선택 SSOT | 기존 크기/테두리/채우기 | 후보 범위 |
| --- | --- | --- | --- |
| 원본 H5/HX 셀 | 공개 SelectionTarget + 실제 tableNode/listNode/membership + 현재 token | 기존 포트와 Native size/style/diagonal 자원 COW 경로 | 크기 창에서 기존 테두리/배경 창으로 이동, stale/composition/pending/미적용 크기 draft 보존 |
| 현재 세션 생성 셀 | Surface generated identity/row/column lease, 원본 selection은 null | 생성 grid의 행·열 변경만 연결. 원본 포트/메뉴에는 생성 속성 계약 없음 | distinct native intent preparation, 공유 strict request/Core admission, modal-owned Surface capture, 생성 속성 UI 준비 |
| 저장 후 재열기된 생성 표 | 새 문서의 실제 원본 source owner | 새 원본 target을 발급해 기존 원본 경로 사용 | 이전 생성 identity나 lease 재사용 금지 |

원본 port의 original currentReference, full view, clipping/sourceOffsets, 실제 membership, preview guard, read-only/historyRecovery/capability와 전체 token/state stamp fence는 유지한다. 기존 generated grid capture 함수도 byte 동일하다. 새 property capture만 기존 단일 실제 modal 소유권 helper를 사용한다. 다른 modal·A→B→A·입력/조합·state/view 변경은 승계되지 않는다. 원본 controller의 tableNode/listNode 비교에 생성 값을 undefined로 끼워 넣지 않는다.

## 실제 소스 준비

공유 JS request는 section + canonical u64 identity string + row/column, 현재 Native snapshot의 expected width/height, sparse size/appearance를 별도 이름으로 받는다. 원본 tableNode/listNode, unknown key, getter/prototype/symbol, zero 크기, 범위 밖 값은 거부한다. 테두리 폭/공통 스타일과 fill은 기존 scalar validator를 재사용한다. 기존 셀 모양 타입/원본 쓰기 경계는 확장하지 않는다.

새 UI port는 발급한 WeakMap lease와 동일 state object/stateVersion/전체 token, Surface identity/row/column selection ticket을 재검증한다. patch는 size/appearance만 허용하므로 다른 정상 셀의 주소를 덮어쓸 수 없다. 한 번 dispatch한 lease는 재실행하지 않는다. 실제로 발견한 후보 retarget 반례 RED와 수정 후 GREEN을 격리 로그로 보존한다. 합성 capability true는 제품 capability 승인이 아니다.

공통 Native Values는 생성 table identity/row/column과 전체 Native document/generation/owner/epoch ticket, expected frame을 검증하고 새 소유 intent 배열을 준비한다. omitted border/fill 성분은 기존 border_fill_patch.merge를 따르고, byte budget/late refusal에서는 이전 values/table을 쓰지 않는다. 이 코드는 native domain preparation이며 포맷 writer에 아직 게시하지 않는다.

## 남은 실제 연결과 완료 조건

- Native H5: 생성 table Values와 property intents를 같은 checkpoint에 소유하고 grid 변화 때 주소를 재매핑한다. LIST_HEADER/common/table geometry 및 DocInfo BorderFill COW를 검증한 뒤 source/style offset과 함께 원자 게시해야 한다. unknown resource tail/원본 자원 공유/한계·ID overflow 거부는 기존 writer authority를 따른다.
- Native HX: created_table_xml의 실제 cell geometry/borderFillIDRef와 header 새 자원을 함께 준비한다. package 관계·기존 원문·pending 수식/그림/formula 의도를 보존하고 현재 save 검증 후 publish해야 한다.
- 크기: 현재 생성 Table.plan은 균일 geometry다. 선택 셀 의도와 표 common size, 공유 행/열 경계의 정확 영향 정책을 결정하고 모든 serializer/snapshot/grid rebase를 연결해야 한다. 이 후보는 일반 ragged-cell 저장을 허용했다고 주장하지 않는다.
- optional ABI/SSOT, SDK public command, Worker dispatch 및 Native producer capability는 아직 추가하지 않았다. 기존 grid/원본 cell-size export가 있다는 이유로 createdCellPropertiesAvailable을 true로 만들지 않는다. 현재 공식 엔진에서는 새 생성 창은 실제 원값을 보여주는 읽기 경로이며 쓰기는 비활성이다. 이것만으로 생성 속성 기능 완료를 주장하지 않는다.
- 실제 정상/실패/할당 실패 Native, SDK와 H5/HX 새 빈2×2의 물리 셀 클릭 → toolbar/context → 크기·테두리·단색/none/hatch/gradient → 단일 이력 → 저장·별도 재열기 → undo/redo 및 무변경/실패 시 prior redo/전체 saved bytes 보존 검증이 필요하다. 대각선은 기존 source 범위·관측/쓰기 계약을 별도 유지하며 생성 지원으로 추정하지 않는다.

## 증거 구분

이 후보의 Node 모형 검사는 shared JS/Core admission과 실제 UI port/view 함수의 통제 모형이다. Native semantic compile, 정상 SDK 빌드, public browser/실제 Canvas/독립 raw save oracle을 대신하지 않는다. 새 Native/browser/build 슬롯은 사용하지 않았다. chart geometry/수식/기존 frozen packet과 Root/shared index/WIP는 이 후보로 수정하지 않는다.


## 관리 이력 쓰기와 optional 전송 후속

별도 Native 부모35ba 후보의 합성 속성 변이9 named와 등록3은 실제12/12 통과했다. 이는 H5/HX 생성 셀의 크기·sparse appearance, 자원 COW, 저장·새 Session 재열기, undo/redo 및 거부 뒤 prior redo 보존 근거다. 원runner의 예상10 문자열 불일치 결과와 실제발견12는 별도 기록으로 보존한다. 이 근거는 다음 ABI/Worker 후보의 컴파일·SDK·화면 결과가 아니다.

후속 소스는 각 형식에 version/ticket/set/document-projection 네 개의 optional 함수를 추가한다. version은 usable 관리 V2 History에서1, 그 외0이다. ticket은 document/generation/owner/epoch 전체를 정확한 십진문자열로 반환하고, set은 최대16KiB typed JSON과 기존 생성 identity 주소만 받는다. 원본 table/list 주소, 미지 키, 중복 키는 거부한다. sparse border/fill 변환 후 기존 Session 소유권·보호·저장 검증과 하나의 관리 History 거래를 호출한다. ABI 결과1은 applied,2는 no-op,3은 uncertain,0은 거부다. 기존필수ABI6와 기존함수서명은 유지한다.

JS는 getter를 실행하지 않는 요청 복사 후 전체 ticket을 조회하고 동기 set에 전달한다. set 호출 이후 trap은 unknown이며 같은 lease로 재시도하지 않는다. Worker는 applied를 표시 재생성 전에 기록하고 uncertain이면 History를poison한다. Core 공개 EDIT_CREATED_CELL_PROPERTIES_COMMAND는 기존FIFO/token 경계를 사용하고 Surface의 발급된 생성 셀 lease만 데모port에서소비한다. 원본 셀 선택을 위조하지 않는다.

공개 쓰기 capability는 version/set만으로 켜지지 않는다. 새 document projection schema1과 관리 V2 History, full view가 함께 있어야 한다. 기존 uniform decoder 기본 검사는 유지하며 새 projection에서만 행별 prefix x, 행 최대높이 prefix y, 전체 extent를 별도 검증한다. 스타일은 실제 save의 전역 COW 준비를 한 번 수행한 뒤 Native resource ID별 유효값과 raw SHA256을 반환한다. HWPX header owner/ID중복/count 인덱스는 기존 batch SSOT와 공유하고, H5/HX observe와 digest는 공통 memo로 각 ID당 한 번만 수행한다. 100000 cell cap은 유지한다.

모든 구역의 generated cell이 없으면 prepare0이며, 있으면 한 문서 조회의 prepare1이다. SDK private cache는 Native document/generation/owner/epoch 전체에 결속하고 구역별로 분리 복사한다. 선택·커서 변경만으로 Native 전체 재준비를 하지 않는다. mutation/undo/redo는 새 ticket, 새 editor facade는 새 cache를 쓴다. read 전후 ticket이 달라지면 캐시를 발급하지 않는다. 다구역 전체 전역 자원 ID 순서를 유지하며 섹션 필터로 COW ID를 재계산하지 않는다.

새 generated geometry layout은 원본 listNode를 만들지 않고 행별 셀 너비와 개별 높이, 텍스트 최소높이를 적용한다. 스타일은 기존 table painter로 전달한다. 미지원 stroke/효과는 unavailable 진단을 유지하며 확인된 fill은 별개로 남긴다. 기존 original table 인덱스와 일반 개체 writer를 바꾸지 않는다. 이 연결은 source 및 controlled Node 근거이며 실제 Native/SDK/GUI 완료는 아니다.

별도 OOM 소스는 실제 property history.apply 직전부터 할당·resize 실패를 주입하며, 거부 시 전체 saved bytes와 유효 prior redo를 검사하고 모든 trial 해제 뒤 allocated/freed 바이트를 대조하도록 준비한다. 정규직렬명부에는 넣지 않는다. 아직 semantic compile·OOM 실행은 없다.


원시 해시는 save-materialized resource와 H5 owned-absent-profile을 구분한다. H5 resource0은 실제 DocInfo 레코드가 없으므로 명시적 새 출력 NONE/black 프로필40바이트의 해시이며 입력에 존재한 raw라고 주장하지 않는다. 나머지는 동일 save COW 준비에서 실제 출력될 자원 payload/XML의 해시다. JSON에는 항상64자리 소문자 hex를 출력한다.

새 자원 단계의 목표 비용은 header/자원 원문 바이트+셀 수에 비례하는 expected hash-map 비용이다. 기존 snapshot의 host anchor resolve, 문단/본문 직렬화 자체의 별도 비용까지 선형으로 개선했다고 주장하지 않는다. H5 기존 anchor.resolve는 table마다 paragraph를 순회하므로 전체 기존 snapshot에 별도 비용 경계가 남는다.

Native 준비 명부는 원래 저장9 named와 새 projection7 named를 단일 root에서 직접 import하여 서로 다른 probe root를 중복 등록하지 않는다. wire3 및 실제 변이 OOM2는 별도 명부다. 추가 import 익명 등록의 실제 개수는 semantic compile/discovery에서 확정해야 한다. 실제 compiled ticket/epoch와 새 문서 cache 수명, 저장 후 original 진입의 GUI 증명은 아직 남아 있다.

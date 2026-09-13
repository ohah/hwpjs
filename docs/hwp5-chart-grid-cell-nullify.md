# HWP5 차트 Grid 기존 셀 null화

## 범위와 SSOT

`nullify_grid_cell`과 `nullifyGridCell`은 null을 포함한 배열 좌표로 기존 String 또는 Double 셀을 선택해 4바이트 `0xffffffff` 슬롯으로 바꾼다. 좌표·종류 선택은 chart edit session, Number 원본 검증은 `contents_number_edit.validateNumber`, String 정의·alias 그래프 검증은 `contents_inline_fork.inspectIntroduced`의 공통 경로가 소유한다.

String object ID가 뒤에서 재참조되면 기존 inline 격리 규칙과 같이 첫 비편집 alias에 원 정의를 이동한 뒤 대상만 null화한다. Double은 target-local 의미를 위해 기존 고유 참조 검사를 유지한다. String과 Number의 null replacement는 모두 원본 좌표 batch compositor에 들어가므로 여러 대상도 바깥 HWP에 한 번만 반영된다.

## 타입 선언 소유 경계

셀을 null로 축약하면 그 셀 안의 타입 선언도 사라진다. 고정 5×4 Contents에서 첫 String `(0,1)`은 known-type wire보다 25바이트 길어 `VtString`·`VtValue` 선언을, 첫 Double `(1,1)`은 13바이트 길어 `VtDouble` 선언을 소유한다. 이 선언은 [Grid 타입 선언 이동](hwp5-chart-grid-type-relocation.md)의 공통 경로로 다음 비편집 참조에 옮긴다.

known-type String은 `19 + payload length`, Double은 26바이트의 정확한 정의 길이를 요구한다. 실제 HWP에서 `(0,2)` String과 `(1,2)` Double을 wire 역순의 한 batch로 null화하고 바깥 CFB·압축 BinData·내부 OLE·Contents를 다시 열어 두 슬롯과 뒤쪽 문서 전체를 확인한다.

null 셀 재선택, 행·열 범위 밖과 손상된 Number·타입 원본을 직접 거부한다. [타입 참조 span](hwp5-chart-type-reference-spans.md)은 다음 사용자 탐색의 원본 좌표를 보존한다. 행·열 축소, 계열 캐시·OOXML 동기화와 렌더링 의미는 아직 범위 밖이다. 기존 82개 완전 편집 batch와는 같은 셀을 동시에 수정하므로 별도 대안 시나리오로 검증한다.

## 적대적 검증

known-type 셀만 지원하던 초기 단계에서는 선언 소유 셀 오허용 두 종류, String·Double null sentinel 변조와 Number 원본 payload 검증 제거를 세 모드에서 검출했다. 최초 선언 셀을 지원하는 현재 계약의 길이·목적지·선언 복사·ID·원본 검증 변이는 [Grid 타입 선언 이동](hwp5-chart-grid-type-relocation.md)에 별도로 기록한다.

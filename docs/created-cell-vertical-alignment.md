# 생성 단일 셀 세로 정렬

## 모델과 저장 소유권

원본 셀 주소와 생성 셀 identity는 구분한다. 기존 생성 셀 속성 명령의
section/identity/row/column, 예상 크기와 전체 History ticket을 재사용한다.
한 요청은 한 셀만 편집하며 size/appearance와 같은 원자적 History publication을
사용한다. 여러 셀 setter 반복이나 새로운 batch 우회는 제공하지 않는다.

셀 속성의 nullable vertical_alignment는 format-owned 기본값에 대한 override다.
H5 기본값은 생성 옵션 LIST_HEADER attributes의 bit5–6이며 공식 HWP5 표65와
기존 list_header 파서를 따른다. 알려진0/1/2는 TOP/CENTER/BOTTOM이다.
예약값3은 null로 관측하고 정렬 편집을 거부한다. H5 보호bit17의 의미는 기존
cell_attributes를 재사용하며 정렬 요청은 보호된 셀을 거부한다.
HX 작성기의 기존 subList TOP이 기본값이다. 부재를 임의로 TOP으로 정규화하지 않는다.

현재 유효값을 다시 지정하면 no-op으로 기존 override와 prior redo를 보존한다.
알려진 기본값으로 되돌리면 override를 제거한다. clone과 grid remap은 전체
Property를 복사하므로 셀 내용·크기·appearance 및 정렬이 같은 소유 셀을 따른다.
새로 삽입한 셀은 override 없이 기본값을 따른다.

H5는 명시 spec6/observed8 배치를 유지하고 선택 셀의 속성mask0x60만 바꾼다.
HX는 선택 hp:subList의 vertAlign만 바꾸며 개체 hp:pos의 TOP은 유지한다.
정렬만 바꾸면 BorderFill 자원을 새로 만들지 않는다. H5의 기존 strict save
LayoutReflowRequired 정책은 그대로이며 저장 회귀는 allow_stale_layout을 명시한다.
이 후보가 Hancom 재조판 또는 원본 셀의 편집 범위를 확장하지는 않는다.

## Optional transport와 읽기 수명

기존 property version1과 strict v1 projection은 변경하지 않는다.
각 hwp5_edit/hwpx_edit prefix에 optional 함수 두 개를 추가한다.

- created_cell_vertical_alignment_write_version() u32: 지원값1.
- created_cell_vertical_alignment_projection() u32: 성공값1, 기존 output ptr/len/free 사용.

새 setter wire는 선택 vertical_alignment 숫자0/1/2만 받는다.
명시null·문자열·범위외 값은 거부하고 기존 size/appearance 요청은 유지한다.
읽기는 별도 schemaVersion1/format/alignments 배열을 반환하며 각 행은
section/identity/row/column/value다. value의 null은 알려진 unavailable이며 보존한다.
중복 identity와 전역 셀 수·메모리/출력 예산 초과는 오류다.

JS는 기존 v1 소유 셀 집합과 supplemental 주소 집합을 정확히 대조하고,
두 읽기 전후 full readWitness를 검증한다. shared output은 다음 호출 전에
복사하고 free한다. export 부재일 때만 구 엔진 supplemental을 생략한다.
존재하지만 오류·잘못된 JSON·소유권 불일치이면 조용히 fallback하지 않는다.
정렬 쓰기는 별도 write_version1을 확인한 뒤 ticket/commit을 진행한다.

## 등록과 검증 경계

집중 step은 test-created-cell-vertical-alignment이며 등록 probe를 공유한다.
정규 root는 probe를 한 번만 import하고 집중 실행을 정규 step에 다시 연결하지 않는다.
준비된12개 named 검사는 모델/no-op/예산/주소·ticket/clone·grid,
H5 spec6/observed8 raw mask, HX raw subList, 양식별 저장·재열기·undo/redo,
H5 authored CENTER/예약값/보호 정책, strict wire와 supplemental/optional4를 다룬다.
모델 allocation failure sweep도 별도 named 검사 하나로 포함된다.

Main은 phase1의 HX attribute_value 접근만 바로잡은 뒤 신규8개와 등록1개 PASS를
보고했다. 이는 전체 successor나 ABI/WASM/SDK/GUI 검증 결과가 아니다.
24경로 후속의 첫 WASM const 접근 실패는 부모 패킷과 Main 로그에 보존한다.
이 문서를 포함한 const 접근 수정 후속은 소스 전용이며 새 컴파일을 실행하지 않았다.
실제 테스트·독립 raw oracle·화면 검증·배포는 각 정확한 후보의 별도 종료 증거가 필요하다.

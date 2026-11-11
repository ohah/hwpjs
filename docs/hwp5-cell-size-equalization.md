# HWP5 원본 셀 크기 균등화

현재 F5 선택과 `EQUALIZE_SOURCE_TABLE_CELL_WIDTH_COMMAND`·`EQUALIZE_SOURCE_TABLE_CELL_HEIGHT_COMMAND`를 HWP5에도 연결합니다. 메뉴·Surface·opaque target·Core·Worker·Native 배치 이력은 HWPX와 같은 경로를 사용합니다. 형식별 원본 metadata 입장 검사만 분리하며 분배 계산과 내용 측정기를 복제하지 않습니다.

## 대상과 소유권

최상위 원본 표의 완전한 비병합 격자, 최대4096셀을 대상으로 합니다. 너비는 물리 시작점·폭 합이 같은 두 열 이상 직사각형, 높이는 전체 열을 포함한 연속 두 행 이상입니다. 저장된 선택 크기 합을 보존하고 HU 나머지는 왼쪽 또는 위쪽부터 배분합니다. 선택 밖 값과 비대상 원본 payload는 유지합니다.

원본 table/list identity와 행·열 수, 크기·보호/잠금·셀 속성을 확인합니다. 미해석 확장 payload·unknown attribute·비0 셀 간격·부호 비트 크기·병합 셀·생성/중첩 표는 거부합니다. 원본 높이0과 비활성 셀 여백의 raw 값은 임의 기본값으로 바꾸지 않습니다. 일반 원본의 활성 여백·텍스트·개체가 제안 높이에 들어가는지는 기존 `measureNestedTable`과 HWP5 실제 페이지 조판으로 확인합니다. NaN/Infinity/음수/문자열/누락 높이·중복 box는 반려합니다.

원본 metadata 해석의 근거는 공식 HWP5 revision1.3의 표·LIST_HEADER 구조와 [한컴 셀 속성](https://help.hancom.com/hoffice130/ko-KR/Hwp/table/tableattribute/table(cellattribute).htm)입니다. 다른 구현의 코드나 분배 알고리즘을 채택하지 않았습니다. 전체 열·비병합·합 보존 정책은 현재 제품 지원 범위이며 한컴 모든 동작과의 동치를 뜻하지 않습니다.

## 저장·이력

기존 HWP5 owned setCellSizes 배치를 한 번 실행합니다. 마지막 대상의 오류에도 앞선 변경과 history가 함께 롤백되어야 합니다. 문서·선택·lease·IME settlement 후 현재성을 재확인하며 무변경은 redo를 보존합니다. 실제 반영 후 응답 오류는 refresh-required이고 같은 변경을 재전송하지 않습니다.

HWP5 저장의 `LayoutReflowRequired`와 ‘줄 배치가 달라질 수 있는 HWP 저장 허용’ 동의는 유지합니다. 크기 편집 성공이 저장된 line segment cache 재생성 완료를 의미하지 않습니다.

## 검증

결합 후보의 Native/Worker/Core HWP5 높이17·너비15, HWPX 높이17·너비11·나누기9, 공통 격자2건이 통과했습니다. 실제 합성 원본의 활성/비활성 여백·높이0·정수 나머지·unknown metadata·no-op·stale/foreign/IME/queued·aftercommit 거부를 검사했습니다. 정확한 source closure의 타입 검사와 명시 lint·포맷을 실행합니다. 외부 참조 픽스쳐를 자동 탐색하는 전체 suite 결과로 확대하지 않습니다.

`tools/hwp5-cell-width-oracle.py`와 `tools/hwp5-cell-height-oracle.py`는 독립 CFB·원시 레코드를 주소로 해석해 지정 크기4바이트 외 uncompressed Section 전체·다른 stream payload·directory metadata를 대조합니다. Python 일반/-O와 합이 같아도 기대 크기가 틀린 반례를 모두 검사합니다. 이 합성 cohort의 LIST_HEADER schema는8이며 schema6·압축 cohort 전수 검증과 구분합니다.

실제 F5·메뉴·저장 동의·다운로드·undo/redo·재열기 결과는 `zig-out/verification/hwp5-cell-size-delivery-r1/gui-*/result.json`이 소유합니다. 브라우저 내 Core 직접 호출로 대체하지 않으며 소유 브라우저·서버 종료를 확인합니다. 긴 내용의 기존 whole-table pagination 제한과 병합/다중 구조 지원은 후속 목표로 남습니다.

최종 결합본은 Core/Worker/문맥 메뉴·필드-글머리표 교차 회귀를 포함한123건과 Node 셸 label1건이 통과했습니다. 공개 후보의 HWP5 실제 GUI10건 및 HWPX 교차 회귀2건이 모두 완료됐으며,12개 결과에서 동일 manifest·Worker·WASM 및 브라우저/서버 종료를 확인했습니다. 일반/-O 독립 원시 비교·반례와 다운로드 재열기 증거를 포함하며 서로 겹치는 이전 검사 수는 합산하지 않습니다.

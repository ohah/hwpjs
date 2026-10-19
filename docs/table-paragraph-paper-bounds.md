# 문단 기준 표의 종이 여백 경계

문단 기준은 표의 위치 기준이며 본문 단의 가로 폭이 항상 표의 잘라내기 경계인 것은 아닙니다. table-page-horizontal-placement.mjs는 기존 source rectangle·문단 여백·정렬·부호 있는 offset 계산을 유지하고, horizontal_relative=PARA의 최종 셀과 바깥 여백이 실제 종이 경계 안에 있는지 검사합니다. 다른 기준의 기존 단 폭 제한은 변경하지 않습니다.

원본 셀 폭이나 표 크기를 줄이지 않고 offset을 보정하지도 않습니다. 종이 좌표가 없으면 기존 단 경계 이상으로 지원을 확장하지 않습니다. 비유한/0/음수 셀 폭과 종이 경계 침범은 계속 TablePageWidthOverflow입니다. 결과의 horizontalOverflowBoundary=paper는 후속 캡션의 공통 가로 경계 판정에도 전달됩니다.

실제 copay_cap_tac_table_leading.hwpx의 표 node1497/host139는 원본 XML에 폭46027HU·가로 offset2421HU·좌우 바깥 여백141HU·horzRelTo=PARA를 선언합니다. 독립 ZIP/ElementTree와 Worker가 일치하며, 실제 셀 측정 후 x=127.8666667px·오른쪽 바깥 여백 끝743.44px입니다. 본문 오른쪽738.12px를5.32px 넘지만 종이 안에 있습니다. 기존 본문 경계 판정으로 합성/실제 회귀2개가 실패하는 것을 먼저 재현한 뒤 경계만 수정했습니다. 파서 원값이나 셀 폭을 잘못 읽은 원인은 아니었습니다.

tests/hwpx/table-paragraph-paper-bounds.test.mjs의4개 검사는 실제 XML/Worker/셀 측정·입력 불변·크기 유지와 왼쪽/가운데/오른쪽 정렬의123개 부호 offset 조합, 종이 누락/비유한/0폭·실제 종이 침범·다른 단 기준의 계속된 거부를 확인합니다. HWPJS_TEST_WASM으로 b59f67c7 후보를 명시해4/4·skip0입니다. 실제 캡션/머리말 편집 왕복·표 anchor 회귀도6/6·skip0입니다. 별도 추적46경로 감사는45배치·암호1거부로 이전 행/페이지 수를 유지했습니다.

참조 전체 문서는 이 가로 오류를 지난 뒤 UnsupportedPageAreaObjects입니다. 그림을 포함한 꼬리말과 여러 꼬리말의 적용 범위가 남아 있으며, 이 표 경계의 통과를 문서 전체 페이지/한글 조판 완료라고 집계하지 않습니다. 별도 native 문단 분기 후보의 전체 테스트와 기본 WASM 배포 여부도 이 변경의 근거와 구분합니다.

로컬 rhwp의 float_placement.rs와 OWPML ParaList XSD의 pos 기준·offset 선언도 비교했습니다. rhwp는 문단 기준 가로 위치를 계산하며 여기의 본문 폭 거부를 원본 포맷 유효성 오류로 강제하지 않습니다. 그 구현 전체나 임의의 원본 한글 화면과의 동치를 주장하지 않으며 타 프로젝트 코드의 전재는 없습니다.

# HWPX 마스터페이지 표 격자 구조

`Document.inspectMasterPageTableGeometry`는 [마스터페이지 파트 선택](hwpx-master-pages.md)의 정규 OPF 항목을 읽고 루트의 직접 `hp:subList` 아래에 있는 모든 `hp:tbl`을 검사합니다. 외국 namespace의 동명 `subList`·`tbl`, 루트의 다른 직접 자식 아래 표는 포함하지 않습니다. 셀 본문 안의 중첩 표는 각각 독립 표입니다. `inspectKnown`은 같은 결과를 `master_page_table_geometry`로 반환합니다.

조건부 `switch` 안에서는 현재 활성 분기를 결정하지 않고 XML 원문에 존재하는 양쪽의 표를 각각 관측합니다. 선택 분기만의 표시·쪽 적용 결과와 동일하다고 주장하지 않습니다.

호출자 capability에 따른 활성 표만 필요하면 [선택 분기 표 격자](hwpx-selected-table-geometry.md)의 별도 API를 사용합니다.

파트 선택·원문 XML 소유와 namespace는 `masterpage_parts.zig` 및 `xml_part_tree.zig`, 표·행·셀의 격자 점유와 필드 판정은 [section 표 격자 구조](hwpx-table-geometry.md)가 소유합니다. 이 모듈은 마스터페이지별 선택 범위·한도·집계만 소유하며 숫자나 테두리 ID 해석을 다시 구현하지 않습니다. 선택된 header의 `borderFill` ID 색인을 넘겨 표 자체·셀·구역의 참조를 해결합니다. 마스터페이지 보고서와 section 보고서는 별개입니다.

기본 한도는 선택 파트 4096개, 파트당 XML 32 MiB, 합계 XML 128 MiB, 합계 요소 400만 개입니다. 공통 트리와 표 격자의 세부 한도도 적용하며 파트 하나씩 임시 트리를 해제합니다. XML 바이트나 요소 합계가 한도를 넘으면 `LimitExceeded`입니다. 미등록 요소는 이 검사에서 삭제하거나 의미 해석하지 않으며, 결과 보고서는 그 원문을 소유하지 않습니다. 전 XSD 적합성, 마스터페이지의 실제 쪽 배치, 표·셀 레이아웃, 편집·저장·무손실 왕복은 판정하지 않습니다.

## 검증

`zig test src/root.zig --test-filter 'HWPX master table geometry'`는 직접 `subList` 선택·외국 namespace·중첩 표·병합 점유·테두리 ID 해결/누락·바이트/요소/표 한도·두 파트 합산·할당 실패를 검사합니다. 독립 `python3 tools/hwpx-table-oracle.py --self-test`와 인자 없는 ZIP/ElementTree 조사 결과를 제품 `HWPX known document inspections shard N` 8개와 대조합니다. 실행 방법은 [개발·검증 명령](development-commands.md)이 소유합니다. 선택 실파일은 Git에 없는 `reference/rhwp` corpus가 필요합니다.

독립 조사기는 2026-09-25 로컬 476개 허용 HWPX의 선택 마스터페이지 61개·직접 목록 61개에서 XML 578,075바이트·7,346개 요소, 표 48개, 행 72개, 셀 154개, 선언/점유 칸 각 178개를 관측했습니다. 표 테두리 참조 48개와 셀 테두리 참조 154개는 모두 header ID에 연결됐고, 16개 표에 `label`이 있었습니다. 이 분포는 해당 corpus에 한정되며 미관측 필드나 다른 버전의 호환성을 증명하지 않습니다.

선택 shard 대조는 단순 건수 외에 마스터페이지 XML 바이트·요소 수, 표 ID 합계, 표·셀 폭 합계, 셀 본문 직접 문단 수, 표 안쪽 왼쪽 여백 합계를 확인합니다. section 표 조사와 동일한 코드 경로에 마스터페이지의 선택 범위만 추가됐는지 확인하기 위한 값이며, 실제 폭·여백의 화면 배치가 맞다는 주장은 아닙니다.

8개 shard는 최종 Zig 보고서와 독립 Python 기대값을 각각 별도 ReleaseFast 프로세스에서 대조해 모두 통과했습니다. 표가 있는 shard 0·1·2·6·7뿐 아니라 표가 없는 3·4·5도 0건 경계를 확인했습니다. 합성 테스트 6개는 Debug·ReleaseSafe·ReleaseFast에서 통과했고, 공통 트리 회귀로 section 14개·header 7개를 다시 확인했습니다. 적대적 검토에서는 직접 `subList` 밖 표·외국 namespace 위장, 중첩 표, 음수 격자 값, 테두리 ID 누락, 파트별 바이트 및 여러 파트의 요소·표·격자 누적 한도와 할당 실패를 반례로 검사했습니다.

최종 소스에서 `zig build test --summary all`은 2,353/2,353, ReleaseSafe 제품 빌드·전체 audit, JS/CFB 비교 47/47, `zig fmt --check build.zig src`, staged diff 검사가 통과했습니다. 이는 현재 선택한 표 구조·필드·참조의 관측 근거일 뿐 HWPX 전체 문서 유효성, 레이아웃, 편집·저장 완료 증거는 아닙니다.

2026-09-27 현재 내용 재검증: 파트별 임시 트리·누적 예산·루트 직접 `subList` 범위와 section 표 공통 판독 코드, 독립 표 조사기의 자체 반례 및 허용 476개 실파일을 다시 대조했습니다. 마스터페이지 61개·직접 목록 61개에서 XML 578,075바이트·요소 7,346개, 표/행/셀 48/72/154개, 격자 선언/점유 각 178개입니다. 표 테두리 48개·셀 테두리 154개는 모두 header ID에 연결됐고 `label` 표는 16개입니다. 마스터 표 집중 테스트는 Debug·ReleaseSafe·ReleaseFast 각 6개, 합성 known 연결은 Debug 2개가 통과했습니다. 이전 known-inspections 8개 shard는 제품 코드가 바뀌지 않아 결과를 재사용했으며 이번에 재실행한 것으로 세지 않습니다.

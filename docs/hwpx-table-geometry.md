# HWPX 표 격자 구조 검사

`src/hwpx/table_geometry.zig`는 선택된 2011 section XML 트리에서 모든 `hp:tbl`을 순회합니다. 중첩 표도 각각 독립 표로 세며 표의 직접 `hp:tr`, 행의 직접 `hp:tc`, 셀의 직접 `hp:cellAddr`·`hp:cellSpan`만 격자 입력으로 취급합니다. XML 원문·요소·속성·숫자 어휘는 각각 `xml_part_tree.zig`와 `xml_values.zig`가 소유하며 이 모듈은 새 XML 파서를 만들지 않습니다.

근거는 한컴 공개 [TableType](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/TableType.cpp), [tr](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/tr.cpp), [tc](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/tc.cpp), [cellAddr](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/cellAddr.cpp), [cellSpan](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/cellSpan.cpp)의 고정 커밋입니다. 공개 모델의 `rowCnt`·`colCnt`, `rowAddr`·`colAddr`, `rowSpan`·`colSpan` 이름을 따르되 공개 모델의 기본값은 원본 XML의 부재와 동일시하지 않습니다.

보고서는 선언 행/열 수 부재, 선언 행 수와 직접 행 개수 불일치, 빈 행, 셀 주소/범위 자식 부재·중복, 좌표/범위 속성 부재, 행 순번과 주소 불일치, 0 범위, 격자 밖, 중첩 점유, 빈 칸을 별도로 셉니다. 숫자 값이 있으면 공통 XML 수치 어휘와 `u32` 경계를 검사합니다. 주소나 범위가 빠지거나 중복이면 격자 점유를 추정하지 않으므로 빈 칸 진단은 그 결과를 반영합니다. 하나의 중첩 점유 칸마다 `overlaps`가 증가합니다. 표당 격자는 기본 100,000칸, 문서당 격자 선언 칸은 4,000,000칸, 실제 셀 범위 방문은 8,000,000칸으로 제한하며 호출자가 표·행·셀·속성 바이트 한도를 낮출 수 있습니다. 오류나 할당 실패에서는 임시 점유 배열을 해제합니다.

이 검사는 **표의 격자 모양 관측**이지 HWPX 표 구현 완료가 아닙니다. `cellSz`·`cellMargin`의 원값은 [표 셀 필드](hwpx-table-cell-fields.md)가, 직접 `subList` 구조·공통 속성은 [표 셀 목록](hwpx-table-cell-sublists.md)이 별도로 검사합니다. 크기·여백의 실제 적용, 테두리/채우기 내용, 행 높이, 반복 머리글, 캡션, 셀 본문의 표시·편집 의미, 중첩 표 레이아웃, 조건부 분기 선택, 전 XSD 적합성, 쓰기/무손실 왕복은 미검증입니다. `Document.inspectKnown`의 성공은 격자 진단이 0이라는 뜻도 아닙니다.

[표 자체 속성 원값·테두리 ID 참조](hwpx-table-attributes.md)는 별도 보고서에서 다룹니다. 격자 선언 `rowCnt`·`colCnt`의 소유권은 이 모듈에 그대로 둡니다.
[표 안쪽 여백·셀 구역](hwpx-table-children.md)도 별도 보고서가 소유하며 선언 격자 수만 이 모듈에서 전달받습니다.
[표 상속 shape 필드·직접 자식](hwpx-table-shape.md)도 별도 보고서가 소유하며 이 모듈은 선택된 표 요소만 전달합니다.

## 검증

`zig test src/root.zig --test-filter 'HWPX table geometry'`에서 병합·중첩표·잘못된 namespace·누락·중복·충돌·빈 칸·격자 밖·숫자 경계·예산·모든 할당 실패를 검사합니다. 독립 `python3 tools/hwpx-table-oracle.py`는 로컬 두 HWPX corpus의 ZIP/XML을 ElementTree로 읽어 표·행·셀과 격자 진단을 셉니다. `python3 tools/hwpx-table-oracle.py --self-test`는 독립 조사기의 병합·충돌·격자 밖 반례를 검사합니다. `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter 'HWPX known document inspections shard N'`을 N=0..7 각각 실행해 제품 결과를 `src/hwpx_corpus_expectations.zig`의 독립 집계와 대조합니다. 로컬 `reference/rhwp`가 없으면 실파일 조사는 재현되지 않습니다.

2026-09-24 로컬 corpus의 484개 HWPX 중 ZIP 거부 6개·암호화 2개를 제외한 476개 문서, 544개 section에서 표 4,182개·직접 행 23,708개·직접 셀 106,998개를 관측했습니다. 선언 격자 칸과 실제 셀 범위 방문은 각각 187,486개였고 조사기에서 누락·충돌·격자 밖·빈 칸 진단은 모두 0이었습니다. 이는 해당 corpus의 2011 section 표 격자에 대한 수치일 뿐 다른 버전·미관측 오류·셀 서식·편집 기능의 증거가 아닙니다.

적대적 검증 중 열 주소가 없는 셀의 `rowSpan=0`과 행 주소 불일치가 기존 조기 반환에 가려지는 반례를 발견해 진단을 독립 집계하도록 고쳤습니다. 주소 또는 범위 자식 하나가 없어도 살아 있는 쪽의 숫자 어휘는 검증합니다. `rowSpan=0`과 격자 밖 좌표도 동시에 보고하도록 보강했습니다. 다수의 작은 표·겹친 병합 영역에서 순회량이 불어나는 경로에는 문서 전체 격자/셀 방문 예산을 추가했습니다. 독립 Python 조사기도 숫자에 밑줄을 허용하는 `int()` 경로를 제거하고 `u32` 경계 반례를 자체 검사합니다.

최종 코드에서 Debug 전체 테스트 2,286/2,286, 표 전용 Debug·ReleaseSafe·ReleaseFast 각 11/11, ReleaseSafe 제품 빌드·audit, JS/CFB 비교 검사 47/47, 포맷·diff 검사와 독립 Python 조사기 자체 반례가 통과했습니다. 실파일 8개 shard는 각기 별도 ReleaseFast 프로세스에서 다시 실행해 총 476개 허용 문서·544개 section의 표/행/셀/격자 칸 집계 및 0건의 격자 진단을 대조했습니다. 이 집계와 합성 반례가 전체 HWPX XSD·문서 의미·편집/저장을 증명하지는 않습니다.

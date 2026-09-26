# HWPX 표 안쪽 여백·셀 구역 검사

`src/hwpx/table_children.zig`는 [표 격자](hwpx-table-geometry.md)가 선택한 `hp:tbl`에서 **직접** `hp:inMargin`과 `hp:cellzoneList`, 그 목록의 직접 `hp:cellzone`을 검사합니다. 중첩 표·다른 namespace의 동명 요소는 부모 표의 값으로 취급하지 않습니다. `Document.inspectKnown(...).table_geometry.table_children`에 보고서를 둡니다. 표의 `rowCnt`·`colCnt`는 격자 모듈, 공통 XML 속성·정수 어휘는 `xml_part_tree.zig`·`table_xml_fields.zig`·`xml_values.zig`, header 테두리 ID 존재 판정은 `id_references.zig`가 각각 소유합니다.

한컴 공개 모델의 고정 커밋 [TableType](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/TableType.cpp), [InsideMarginType](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/InsideMarginType.cpp), [공통 margin 속성](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Core/marginAtt.cpp), [cellzoneList](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/cellzoneList.cpp), [cellzone](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/cellzone.cpp)를 필드 출처로 삼습니다. 코드는 가져오지 않고 공개 모델의 속성 이름·타입만 대조합니다.

`inMargin`은 요소 부재·중복과 네 방향의 부재·0·음수 문자열·상위 비트 양수 문자열·원값 합계를 구분합니다. 공개 모델의 저장 멤버는 unsigned지만 [셀 여백](hwpx-table-cell-fields.md)과 동일한 XML 숫자 어휘 판정을 재사용하며 부호 표기를 강제 정규화하지 않습니다. 중복 요소도 각각 읽어 살아 있는 값을 숨기지 않습니다. `cellzoneList`는 부재·중복·빈 목록·다른 직접 자식을, `cellzone`은 네 좌표의 부재와 원값 합계, 시작이 끝보다 큰 경우와 선언 격자 밖 좌표를 별도 진단합니다. 부분 좌표에서도 살아 있는 값은 검사합니다. 끝 좌표는 이 진단에서 포함 범위로 취급하지만 실제 표 배치·병합 의미는 확정하지 않습니다.

구역의 `borderFillIDRef`는 부재·0·합계를 구분하고, header 색인이 공급된 전체 문서 경로에서만 실제 `borderFill/@id`에 연결합니다. ID 0도 일반 ID입니다. header 색인이 없는 단독 검사는 `border_references_checked=false`로 남고, 목록은 있지만 테두리 표 자체가 없으면 `absent_table`을 기록합니다. 요소/목록/구역 수와 속성 바이트는 호출자 옵션으로 제한합니다. 진단값이 0이어도 테두리·구역 표시, 겹치는 구역 간 우선순위, 편집·저장의 타당성은 증명되지 않습니다.

## 실파일·적대적 검증

독립 `tools/hwpx-table-oracle.py`의 ZIP/ElementTree 조사에서 2026-09-24 로컬 허용 HWPX 476개 문서의 4,182개 표 모두 직접 `inMargin`이 있었고, 99개 표에 `cellzoneList` 99개와 `cellzone` 130개가 있었습니다. 네 여백 합계는 left/right/top/bottom 순서로 1,099,035/1,101,141/572,188/571,618입니다. 관측된 안쪽 여백에 음수·상위 비트 표기는 없었습니다. 구역 테두리 ID 130개는 모두 header ID에 있었고 합계는 5,822였습니다. 이는 해당 표본의 분포로, 다른 버전의 필수 요소·허용 구간·렌더링 의미를 보증하지 않습니다.

`zig test src/root.zig --test-filter 'HWPX table children'`는 직접 자식 선택, 속성 원값, 중복·부재·부분 좌표, 격자 밖과 역전 동시 진단, 세 가지 개수 한도 및 모든 할당 실패를 검사합니다. 독립 조사기의 반례는 `python3 tools/hwpx-table-oracle.py --self-test`, 전체 corpus 집계는 인자 없이 실행합니다. 선택 실파일은 `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter 'HWPX known document inspections shard N'`의 N=0..7을 별도 프로세스로 실행하며 `src/hwpx_corpus_expectations.zig`의 독립 분할 집계와 대조합니다. 로컬 `reference/rhwp`가 없으면 선택 실파일 검사는 재현되지 않습니다.

[표 상속 shape 필드·직접 자식](hwpx-table-shape.md)은 별도 검사로 연결됐습니다. 셀 본문 의미, 구역 간 겹침·우선순위, 전체 XSD, 레이아웃·편집·저장·무손실 왕복은 아직 미구현입니다.

2026-09-25 최종 재검증: 독립 조사기 자체 반례·전체 corpus 집계, 최종 코드의 ReleaseFast shard 0~7, Debug 전체 2,310/2,310 테스트, ReleaseSafe 제품 빌드와 전체 감사 2,349/2,349 테스트, ReleaseFast 전체 감사, Debug/ReleaseSafe/ReleaseFast 표 자식 단독 테스트, 포맷·공백 검사가 통과했습니다. 적대적 점검에서는 중복 요소 뒤의 잘못된 숫자, 부분 좌표와 선언 격자 밖 값, `u32` 최댓값, ID 0과 header 표 부재, header 없이 실행한 참조 0건, 다른 namespace의 동명 요소, 여러 표에 걸친 세 개 수 제한, 모든 할당 실패를 각각 반례로 확인했습니다. 이 결과는 원값·구조·참조 존재의 검사 범위에 한정됩니다.

2026-09-27 현재 내용 재검증: 고정 버전 모델과 직접 자식·header 참조 판정 코드를 대조하고 독립 조사기 자체 반례 및 476개 실파일 집계를 다시 실행했습니다. 표 4,182개의 직접 `inMargin`은 누락·중복 없이 각각 하나이고, `cellzoneList` 99개·`cellzone` 130개, 네 여백 합계는 1,099,035/1,101,141/572,188/571,618입니다. 여백의 음수·상위 비트 사례와 구역 역전·격자 밖 사례는 각각 0개이며 구역 테두리 참조 130개는 모두 해결됐습니다. 집중 테스트는 Debug·ReleaseSafe·ReleaseFast에서 각각 5개 통과했습니다. 기존 known-inspections 8개 shard는 제품 코드가 바뀌지 않아 이전 실행 결과를 재사용했으며 이 날짜에 다시 실행한 것으로 세지 않습니다.

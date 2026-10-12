# 필드 바깥 텍스트와 보존 객체의 범위 편집

## 계약

`field_source_outside_positions.zig`의 source `.splice` 경로는 `source_field_paragraph_positions.build`를 재사용합니다. 이 공통 계층은 로컬 문단 정책과 객체의 원문 소유 위치·한 단위 앵커 폭을 검사합니다. 필드 투영과 외부 범위 검사는 객체 단위를 포함한 동일 좌표를 사용하고, `paragraph_text_positions.validateRange`는 객체 삭제를 거부합니다. 필드 내용·경계 침범은 기존 `field_outside_range`가 거부합니다.

이 허용은 문단 전체를 일반 텍스트로 평탄화하는 것이 아닙니다. whole_plain/whole_anchored와 formula_split은 기존 엄격 정책을 유지합니다. 수식 결과가 있는 구역의 `field_source_outside_plan`도 source splice의 원본 좌표에 같은 공통 객체 투영을 사용하여 현재 표시 좌표와 원문 좌표에서 앵커 폭이 달라지는 문제를 방지합니다. 미지원 로컬 내용 오류는 외부 입력 권한의 기존 UnsupportedParagraphControl로 반환합니다.

## 재현과 검증

후속 선택 통합 회귀와 기본 검증 목록 등록·전체 gate 상태는 [필드 통합 검증](hwpx-field-integration-gates.md)이 소유합니다.

이 문서에서 남긴 계산식 세 결과의 공개 정의 편집 검증은 [규제분석 계산식](hwpx-regulatory-formula-edit.md)이 소유합니다.

실제 `reference/rhwp/samples/issue3637/regulatory_impact_nested_table_escape.hwpx`의435번 문단은 두 공백 뒤에 CLICK_HERE 시작과 표가 있고, 필드 끝은 후속 문단에 있습니다. 이전 `matched-field-end-input` 후보는 outside=false이며 실제 splice가 UnsupportedParagraphControl로 거부됐습니다. 같은 구조의 합성 회귀도 수정 전1/1 실패했습니다.

수정 후 `zig test src/field_container_regression_test.zig -O ReleaseSafe --test-filter 'before a field-owned table' --test-filter 'field exterior'`는10/10 exit0입니다. 표 앞 입력·필드 소유 객체 삭제 거부·저장/재열기와 셀 내용/표 유지, 기존 필드 외부 이력·할당 실패 회귀를 검사합니다.

`field-exterior-table-input` 후보 SHA256 `1775eeeeeb6fa26a5ee5ea67e18f75898d704c78ba6cf88a66db82e81fcb0a73`는 ReleaseSafe build6/6 exit0입니다. `field-end-exterior-reference.test.mjs`와 `field-exterior-inline-reference.test.mjs`는2/2 exit0입니다. 실제423/435/518 및 별도 원본의324/330/331/2395 각각의 입력·전체 XML/비대상 ZIP normal/-O·잘못된 기대값 거부·undo/redo·재열기·입력 파일 불변을 검사했습니다.

같은 후보의 전 문단 query-only 재조사는 plain1164/anchored52/field173·거부3으로 exit1입니다. 기존 거부6개에서423/435/518이 해소됐지만 나머지841/976/1232는 FORMULA 결과이고 UnsupportedFieldLabelRange로 남습니다. 조회 성공을 실제 편집 성공으로 계산하지 않으며, 실제 편집 증거는 위 일곱 위치뿐입니다. 최신 전체 native/public·Worker/Canvas·수식 편집 경로·제품 반영은 아직 완료하지 않았습니다.

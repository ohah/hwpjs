# 필드 바깥 텍스트와 보존 객체의 범위 편집

## 2026-10-16 공개 소스의 외부 범위 입력 복원

차트 조립 후보 `f6decd1d…`는 실제 issue3637의423/435/518번 문단에서 canEditOutsideField=false였고, 같은 공개 테스트가 기본 `cbaaf27f…`에서는 통과했습니다. BOOKMARK만 복원한 `34f99386…`도 이 회귀는 남았습니다. 원인은 범위 splice에 문자 서식용 문단 전체 정책을 적용하고, 닫힌 필드 끝 뒤의 빈 site는 투영된 span0개라는 이유로 유효한 계획을 버리던 경로입니다.

main `98780247` 기반 격리 소스 `/tmp/hwpjs-field-exterior-fix.rFzWEW`에서 source_field_paragraph_positions를 공통 필드 전용 위치 경계로 연결했습니다. known pair 진단 Lease를 재사용하되 unresolved 시작이 포함된 구조 목록/루트 범위를 별도로 보호합니다. 닫힌 end marker가 직접 속한 문단의 범위 splice만 span0개 계획을 유지하고, 객체/인라인 단위 삭제는 기존 validateRange가 거부합니다. source 수식 좌표 변환에도 같은 투영을 쓰며 whole 편집 허용으로 확대하지 않습니다. 필드 없는 외부 표의 range-target 조회는 먼저 로컬 known pair 교차가 없는지 검사해 무관한 뒤쪽 root orphan 때문에 InvalidFieldLinks가 나는 반례도 고쳤습니다.

ReleaseSafe5/5·exit0, WASM SHA256 `1ba88fcfc4a501d43a4fc27ed4425b54e109ff4b77f7c6ee1c37905f288a19ed`입니다. BOOKMARK/field-end/inline 세 공개 검사3/3·12989.266666ms·exit0은 실제 두 문서의 외부7위치와 BOOKMARK의 독립 normal/-O XML/ZIP·잘못된 기대값 거부·이력/재열기를 포함합니다. 기본 산출물은 바꾸지 않았습니다.

native8선언 바이너리 `91eaa9fc6df0039c07a8c059c7cf366535057ab6986cf6cdbe37df00df0e7392`는 미해결 셀/루트 보호·닫힌 field label·표 앞 입력/객체 삭제 금지·뒤쪽 orphan range 조회·container label 전체 실패 주입을8/8·status/logs/leaks0·guard exit0으로 통과했습니다. 기존 source 위치 전체 실패 주입/수식 경계 변환은 별도 바이너리 `92c820b896906436860863efac7839c09c9cfa494f498f746d74f1d056728e91`의 root 포함3/3·guard exit0입니다. 각 선언 별도 표준 runner/1GiB 감시이며 빠른 실행의 physical 표본0은 실제 메모리0을 의미하지 않습니다. 로그는 위 격리 소스의 native-field-exterior-eight/native-source-field-positions.jsonl·stderr입니다.

필터 없는 첫 명령은 전이 import까지501선언을 선택해 범위가 달랐습니다. 7번째 range 조회의 InvalidFieldLinks를 재현했지만86번째 부근에서 중단했으며 전체 통과로 계수하지 않습니다. RSS7189120KiB를 관측한 전용 native PID89055만TERM하고 parent88859 종료를 확인한 뒤 위8선언·분할 감시로 재검사했습니다. 이는 의도 밖 테스트 실행/할당자 자원 관측이지 제품 메모리 사용량이나 누수 원인 확정이 아닙니다. 전체180파일의 차트 후보 감사와 생성 표 저장 전후 필드 좌표 불일치·markpen 회귀는 별도 미완료 항목입니다.

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

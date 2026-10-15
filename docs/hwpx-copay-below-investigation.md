# copay 방향 수식 조사

## 확인한 원인

`reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx`의 section0에는 FORMULA5개가 있으며 모두 `=SUM(BELOW)`입니다. 원본 Command/Formula의 표현식은 일치하고 ResultFormat은 `%g,`입니다. 현재 main `e71d8e98`의 `src/model/formula_range.zig`에는 ABOVE 분기만 있습니다. BELOW는 주소 파서로 떨어져 행 숫자가 없는 참조로 거부됩니다. 따라서 기존 InvalidFormulaReference를 문서 손상으로 단정하지 않습니다.

RHWP의 `src/document_core/table_calc/tokenizer.rs`는 BELOW를 방향 토큰으로 읽으며 `evaluator.rs`는 현재 열에서 현재 행 다음부터 마지막 행까지 선택합니다. 이는 소스 대조이며 실제 RHWP 화면 실행/한글 프로그램 산술 동치 증거는 아닙니다.

## 현재 구현과 미완료 경계

작업 트리에는 공통 Range의 below 플래그·파싱·경계 해결과 기존 Iterator를 재사용하는 구현이 있습니다. 2026-10-15 `zig test src/model/formula_selection.zig -O ReleaseSafe`8/8·exit0을 확인했습니다. 소유 셀 제외, 끝 행 빈 범위, 잘못된 원점, u32 상한, 후행 문자열, 소문자 거부, ABOVE/BELOW 동시 지정 거부와 기존 명시 주소/중복·예산 검사를 포함합니다. 범위 문법만의 검사이며 실제 copay 조회/저장/편집 성공 또는 main 반영을 뜻하지 않습니다.

실제 파일의 원본 표시100과 Command/LastResult184.9가 다른 첫 수식은 별도 원본 보존 정책도 필요합니다. BELOW 지원만으로 무편집 재계산 차이가 해결됐다고 판단하지 않습니다. 다음 gate는 격리 후보에서5필드 조회, 무편집 원문 byte-exact, 실제 참조 입력 수정의 독립 XML/Decimal 재계산, undo/redo 및 저장 재열기입니다. 기본 WASM 승격과 Canvas UI는 그 뒤에도 별도입니다.

## 격리 후보 실측

후속 전체 참조 조회/무편집 저장 감사는975경로 중HWPX436개를 모두 완료해exit0·stderr0바이트입니다. 후보93bc53을 양쪽에 제공한 보존 검사이며 변경 전 후보와 조회 동치 주장이 아닙니다. 최종 집계는 matched436/incomplete0/nonExactNoOp0/saveError0/successfulQueries999입니다. InvalidFieldLinks3조회와 EncryptedDocument1열기 거부는 여전히 남아 있으므로436파일 전체 기능 지원으로 읽지 않습니다. HWP5513개/HWP326개는 이 HWPX 감사에서 제외했습니다. 로그는 `/tmp/hwpjs-note-geometry-publication.Wkoeip/below-preserved-reference-query.jsonl`입니다. 기존 copay의 InvalidFormulaReference와aift의 원문 저장 불일치는 이 후보에서 없어졌으나 전체 편집·Canvas·한글 조판·전체 native·게시 완료 증거는 아닙니다.

최종93bc53 원문 보존 후보의 전체 등록 공개 묶음도23파일54/54·fail/skip0·exit0(110106.045666ms)으로 완료했습니다. 환경변수와 격리 고정 경로는 동일 후보이며 Git metadata/work tree도 명시했습니다. 로그는 `/tmp/hwpjs-note-geometry-publication.Wkoeip/below-preserved-public-suite.log`입니다. 별도 copay 참조 회귀1개는 이54개에 포함하지 않습니다. 전체 참조 query 감사는 `below-preserved-reference-query.jsonl`에 실행 중이므로 아직 전체 성공으로 계수하지 않습니다.

최종 원문 보존 후보의 copay·grouped-integer·formula-editor·formula-average-split-policy4파일 회귀도10/10·fail/skip0·exit0(47231.129ms)으로 완료했습니다. AVG 구조 분할/빈 값, 실제48숫자 입력, 서식/현재 좌표/이력과 새 보존 경로를 함께 검사했습니다. 앞선 grouped-only 후보의23파일54/54 결과를 이 새 후보의 전체 등록 성공으로 소급하지 않습니다.

main+grouped 정수 출력+BELOW2모듈만의 격리 후보 `7d38e3a38989284a3e1c3dd8000352ebb1cd6b443ed43b5a2ceb6b2ec53b94bb`는 ReleaseSafe 제품 빌드5/5·exit0입니다. 실제 파일을512MiB RSS 관측/30초 제한의 자식에서 조회·저장했고 성공 종료·관측 peak150,306,816바이트였습니다. 문단 스냅샷과 수식 조회의 InvalidFormulaReference는 없어졌습니다. 현재 결과5개는184.9/1,749,831/23,860/1,749,831/23,860입니다. 이 실행의 exit0은 자식 완료 의미이며 보존 gate 통과가 아닙니다.

무편집 저장은757,451바이트·SHA256 `3210632c5702ecd48ec266d6d118ccd6c678e733cb99287f35958185e181b1d2`로 원본 SHA256 `fa00fae4aec5f80175898734ea4d06b82f4c80df7e32b69a7370328c770ab60f`와 달랐습니다. 독립 Python XML 비교는 section0의 같은 topology에서2차이만 확인했습니다: 첫 FORMULA id1295981349의 dirty0→1, 표시 텍스트100→184.9. Command/LastResult와 나머지 ZIP payload는 유지됐습니다. 즉 BELOW 문법 누락과 무편집 표시 재계산은 별도 원인입니다. 원문 보존 수정·실제 입력 편집·이력 gate는 아직 남아 있습니다.

별도 작업 트리 native ReleaseFast8/8·exit0에서는6집계 이름의 BELOW 범위/끝 행 반례를 추가 검증했습니다. 이 추가 단언은 위 WASM 빌드 뒤의 테스트 변경이며 runtime 의미는 같아도 source snapshot을 혼동하지 않습니다.

### 최종 flat 저장 보존 후보

격리 전용 native preservation 회귀를 전체 할당 실패 주입으로도 확장해 ReleaseSafe1/1·exit0을 확인했습니다. 원문 반환/내부 derive/편집 derive의 모든 할당 실패 지점을 표준 Zig 검사기로 순회하며 성공 경로 원본 불변 단언과 allocator 누수 검사를 유지합니다. 테스트 전용 진입점은 `/tmp/hwpjs-note-geometry-publication.Wkoeip/tree/src/hwpx_formula_preservation_test.zig`이며 정규 root 전체 gate나 저장된 제품 artifact의 source 테스트 snapshot으로 소급하지 않습니다.

후보 source inventory도 main의 추적 src/build2,497파일과 Git blob hash로 대조했습니다. 차이는 build의 신규 회귀 등록, root의 출력 모듈 직접 테스트 import, editor_session의 최종 저장 호출, formula_output, formula_section_save, 공통 formula_range/selection7파일뿐입니다. 나머지2,490파일은 main과 같습니다. 격리 전용 단독 preservation 테스트와 새 JS/Python 회귀는 이 추적 source 비교의 개수에 넣지 않습니다. 소유 범위 확인이지 전체 기능 완료 증거는 아닙니다.

격리 tree의 `formula_section_save.writeWithDefinitionsMode`에 최종 flat 저장만의 보존 플래그를 분리했습니다. 정의 변경/dirty가 없고 기존 text writer의 결과가 원본 section과 정확히 같을 때만 원문을 반환합니다. 기존 내부 writer는 기본 false로 계속 재계산합니다. 작업 트리의 result override 구현 전체를 이 후보에 가져오지 않았습니다.

ReleaseSafe 제품5/5·exit0 후보 `93bc53ba7a5722295d686cae6713dda02eb4f12638c5cebcb0c1ba4d867a6801`에서 실제 copay의 조회 뒤 무편집 저장은 원본 SHA와 일치했습니다.89번 문단30.1→40.1 입력 뒤 합계194.9, undo 원문 bytes 복원, redo 편집 bytes 복원 및 저장 재열기 후 동일 bytes를 확인했습니다. 단독 native 보존/내부 derive/입력 후 derive 검사1/1·exit0입니다. 이 결과는 실제 입력 경로 확인이며 독립 전체 XML/Decimal oracle·전체 공개/전체 native·Canvas 검증은 아직 아닙니다. 재현 공개 회귀는 `tests/hwpx/copay-below-editor.test.mjs`이며 RHWP 원본이 실제로 있어야 하고 누락을 skip하지 않습니다. 해당 참조 회귀는 기본 등록 묶음과 별도입니다.

후속 독립 검증은 `tests/hwpx/copay-below-save-oracle.py`가 소유합니다. 원본 표4의 같은 열·원점 다음8셀을 Decimal로 합산해194.9를 산출하고, 입력1곳/첫 수식의Command·LastResult·dirty·표시만 갱신한 기대 전체 XML과 저장본을 비교합니다. 원래 필드 밖 접미사`.0`, 나머지4수식, 비대상ZIP payload·메타데이터도 비교합니다. 결과 캐시/표시를 함께184.9로 되돌린 변조는 일반 Python/`-O` 모두 실제 complete XML mismatch·exit1이어야 합니다. 이 보강 후 공개 회귀1/1·skip0·exit0(2720.548375ms)을 확인했습니다. 앞선 독립 oracle 미검증 경계는 이 지정 편집에 대해서만 해소하며 전체 참조·전체 native·브라우저 완료로 확대하지 않습니다.

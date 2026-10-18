# 수식 결과 입력의 참조 감사

## Zig 0.17 후속 회귀와 산출물 결합

기존 `hwpx-manual-result-input-audit.mjs`와 독립 inventory/저장 oracle을 재사용합니다. 같은 역할의 별도 감사/원본 목록을 추가하지 않습니다. 필드 결과 행에 입력 SHA256을, 최종 summary에 WASM SHA256을 기록하고 종료 시 입력 메모리/파일과 WASM 메모리/파일의 동일성을 확인하도록 보강했습니다. 수식이 없는 파일도 입력 불변 확인을 생략하지 않습니다.

`/tmp/hwpjs-zig017-current-fixtures.xouwd1/manual-result-ssot-tests.log/.stderr`는 후보 `f4e0f396a3fea6e6354b364ff176e31d72ed00ec643fa566c4abbd8bc2f58d77`에서5/5·fail/cancel/skip0·exit0·stderr0입니다. 기존 oracle의 구역2/잘못된 인자 회귀와 신규 CLI 회귀를 포함합니다. 실제 chart13곳과 `issue6298/copay_cap_tac_table_leading.hwpx`5곳은 각각 전체 독립 XML·ZIP normal/-O, 원본 cache 불변, native target의 prefix 입력, 별도 편집기 재열기/무변경 save, undo/redo/undo를 검사했습니다. 좌표별 결과 수/중복 부재·성공 상태·입력/WASM 해시를 새 회귀에서 강제합니다.

이는 직전 일반/전용 prefix 감사의 계산 결과 거부5개를 지원 성공으로 바꾼 것이 아니라 명시적인 수동 결과 경로의 별도 증거입니다. 실제 수식 재계산·모든 참조 원본·임의 편집 위치·브라우저/조판 완료로 확대하지 않습니다. 기본 제품 WASM/테일스케일 서버는 교체하지 않았습니다.

최종 `manual-result-artifact-final.log/.stderr`는6/6·fail/cancel/skip0·exit0·stderr0입니다. 새 음성 대조는 WASM 사본을 module 로드 후 교체해 감사가 `AuditArtifactChanged`로 exit1이고 성공 summary를 출력하지 않는지 확인합니다. 원래 후보를 수정하지 않으며 자식 종료 후 자신이 만든 임시 사본만 제거합니다. 동일 JS/감사 코드를 추출한 `/tmp/hwpjs-manual-result-clean.RN6maR`에서도 main Zig0.17 후보 `afb7fdfbbc8a9c9cc45a7cdb98ade6be7a6a88b1943e1c5354c63d6715b9e05e`로6/6·fail/cancel/skip0·exit0·stderr0을 확인했습니다.

정규 HWPX gate에 새 회귀를 등록합니다. 명시적 `HWPJS_TEST_WASM`이 없을 때만 기존 설치 산출물 환경 helper로 현재 prefix의 WASM을 제공하고, 명시된 후보는 덮어쓰지 않습니다. 전체 gate 실행 완료와 이 집중 회귀/빌드 연결 변경을 구분합니다.

최종 커밋용 build/src를 위 사본에 추출한 뒤 Zig0.17 `build --help`로 build graph 컴파일을 exit0·stderr0으로 확인했습니다. 기존 artifact 환경 helper 회귀도2/2·exit0입니다. 이는 전체 HWPX/native gate 실행 결과가 아닙니다.

아래 ca351 후보의7거부는 [표시 전용 저장 후속 수정](hwpx-preserved-formula-dependencies.md)에서 원인을 좁혀 해결했습니다. 과거8파일48수식 집계는 그대로 보존하며 새 후보의 실행 범위를 별도로 읽습니다.

## 실행과 책임

`node tools/hwpx-manual-result-input-audit.mjs --wasm=/absolute/candidate/hwpjs.wasm --fixture=/absolute/document.hwpx`로 한 문서의 모든 원본 수식을 검사합니다. `--fixture`가 없으면 기존 추적 HWPX 목록을 사용합니다. 임의 root 전체 검사가 아니며 문서를 수정해 디스크에 쓰지 않습니다.

`hwpx-manual-result-inventory.py`는 Python ZIP/XML로 구역별 수식 ordinal과 문단 위치를 독립 관측합니다. Node 감사는 reader의 전체/구역별 문단 좌표와 원본 수식 개수를 대조한 뒤 native 결과 target 조회로 실제 소유권을 확인합니다. XML 관측만으로 쓰기 권한을 부여하거나 비슷한 숫자를 찾아 위치를 바꾸지 않습니다. 각 필드는 원본 상태에서 시작합니다.

성공 경로는 UTF-16 prefix 입력 → 전체 XML/ZIP 독립 비교(Python 일반/-O) → source cache 불변 → 표시·재열기·원문 저장 → undo/redo/undo byte-exact를 검사합니다. 명령이 실패하면 실패로 출력하고 exit1입니다. 명시적인 미지원도 지원 성공에 포함하지 않습니다. 실패한 명령의 이력 revision과 저장 bytes도 원본과 대조합니다. 검사기/오라클 자체 오류를 제품 지원 성공으로 바꾸지 않습니다.

기존 특수 prefix 감사는 수식 결과 API를 호출하지 않습니다. chart에서 수식13곳을 `UnsupportedFieldLabelRange`로 거부한 기존 결과를 제품의 현재 수동 결과 지원 여부로 해석하지 않습니다. 이 새 감사는 별도 경로이며 과거 검사 숫자를 수정하거나 합산하지 않습니다.

## 2026-10-16 실측

후보 WASM SHA-256은 `ca351f844db9535335578195370e81230e78a9b465d70c18c4ce9ed3bebf3b2e`입니다. 기본 데모 WASM은 바꾸지 않았습니다.

참조 `.hwpx` 경로를 ZIP/XML로 관측한 결과 수식이 있는 파일7개·수식35개를 찾았습니다. 확장자가 다른 signature-HWPX 전수나 암호 문서의 내부 전체를 조사했다는 뜻은 아닙니다. 이7파일과 레거시 chart1파일을 한 자식 프로세스씩 순차 검사한8파일48수식 결과는41성공·7실패이며 전체 명령 exit1입니다.

| 파일 (`reference/rhwp/samples/` 기준) | 수식 | 성공 | 실패 |
| --- | ---: | ---: | ---: |
| `tac-img-02.hwpx` | 4 | 4 | 0 |
| `issue1891_external_bindata_link.hwpx` | 5 | 5 | 0 |
| `issue5543_carried_anchor_ladder.hwpx` | 14 | 7 | 7 |
| `hwpx/143E433F503322BD33.hwpx` | 3 | 3 | 0 |
| `hwpx/aift.hwpx` (구역2) | 1 | 1 | 0 |
| `issue3637/regulatory_impact_nested_table_escape.hwpx` | 3 | 3 | 0 |
| `issue6298/copay_cap_tac_table_leading.hwpx` | 5 | 5 | 0 |
| 별도 `legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx` | 13 | 13 | 0 |

`issue5543`의 짝수 ordinal0·2·4·6·8·10·12가 `UnsupportedFormulaResultDependency`로 실패합니다. 조회에는 native target이 나오지만 setter의 후보 저장 검증에서 다른 수식이 해당 수동 결과를 의존값으로 읽으면 거부됩니다. 원인은 `formula_dependency_evaluation.Context.value`의 override dependency guard입니다. 표시 문자열을 숫자로 간주하거나 guard를 삭제해 자동 수식 의미를 조용히 바꾸지 않았습니다. 이7곳의 지원과 조회/명령 eligibility 정합성은 미완료입니다.

독립 오라클은 기본 구역0 외에 명시적인 비음수 정수 `section`을 받습니다. 비대상 구역/ZIP payload 보존은 그대로 확인하며 잘못된 구역을 선택하면 실패합니다. `tests/hwpx/manual-result-oracle-section.test.mjs` 2/2는 구역2, 일반/-O,5종 변조 반례, 잘못된 구역/표시/CLI를 검사합니다. 기존 공개 수동 결과 API 회귀13/13도 동일 후보에서 재실행했습니다. 브라우저·물리 IME·모든 편집 명령·원본 조판 완료 검사가 아닙니다.

# 수식 결과 입력의 참조 감사

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

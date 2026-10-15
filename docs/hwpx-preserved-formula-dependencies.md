# 의존 수식의 표시 전용 저장

## 재현과 원인

[참조 수식 감사](hwpx-manual-result-reference-audit.md)의 `issue5543_carried_anchor_ladder.hwpx`는 수식14개 중7개에서 표시 전용 수정이 `UnsupportedFormulaResultDependency`로 거부됐습니다. native target은 존재하지만 후보 저장 과정이 원본 입력/정의가 그대로인 비대상 수식까지 계산해 수동 override를 숫자 의존값으로 읽으려 했습니다. 원본 표시 보존을 결정한 뒤 결과를 쓰지 않을 계산부터 실행한 순서 문제입니다.

첫 수정(prepare의 lazy evaluation만 추가) 후보 `0b41745f473a17263b6c45dc1568cba8ad6a00e00ad48bac2d747bd88a826482`에서도7거부가 재현됐습니다. final flat 저장의 `preserve_unrelated` 증명이 prepare에 전달되지 않았기 때문입니다. native 합성 회귀2개도 같은 오류로 실패했으며 중간 후보를 완료로 게시하지 않았습니다.

## 책임과 경계

- `formula_section_save`는 final flat 저장·정의 변경 없음·dirty 없음·원본 text-site 직렬화 동일성을 확인한 경우에만 `source_display_options`를 전달합니다. 임시 구조 재구성이나 실제 입력 수정에 보존 모드를 강제하지 않습니다.
- `formula_section_prepare`는 기존 `formula_source_display.unchanged` 검사와 automatic disposition을 공유합니다. 보존이 확인된 비자동 결과는 원본 표시를 준비하고 불필요한 숫자 평가를 하지 않습니다. 새 상태 캐시나 JS 수식 파서는 추가하지 않습니다.
- 정의가 있거나 실제 site가 바뀌었거나 explicit automatic인 경우는 기존 평가를 계속합니다. `formula_dependency_evaluation`의 수동 의존값 거부를 삭제하거나 문자열을 숫자로 간주하지 않습니다. 따라서 실제 의존 수식 정의 변경 등은 여전히 별도의 미지원 경로가 있을 수 있습니다.
- 원본 Command/Formula/LastResult/dirty와 비대상 ZIP/XML은 유지합니다. 직접 수정은 본문 표시만 바꾸며 한글 프로그램의 모든 재계산 의미를 재현했다는 주장이 아닙니다.

## 집중 검증 (2026-10-16)

최종 후보 SHA-256은 `a5d28035f98a7a7f31653f8037e809b715d95ae70d09b12d2c3591bf21202a33`입니다. ReleaseSafe 제품 빌드5/5·exit0이며 기본 데모 WASM은 변경하지 않았습니다.

`src/hwpx_formula_preserved_dependency_tests.zig`의 ReleaseSafe 집중2/2는 작은 실제 ZIP의3셀 수식 체인으로 다음을 검사합니다: 표시 전용 저장/재열기·입력/캐시/비대상 결과 보존과 전체 할당 실패, 실제 의존 정의 변경의 원자적 거부, 실제 숫자 입력5 변경 후 두 결과 모두5로 재계산. root에도 등록하며 전체 native 전수 통과와 구분합니다.

새 공개 `manual-formula-dependency-preservation.test.mjs`는 이전ca351 후보에서 `UnsupportedFormulaResultDependency`로 실패한 음성 대조입니다. a5d280 후보에서는1/1 통과하며 실제14개 원본/cache·비대상 current 결과·독립 전체 XML/ZIP 양 Python 모드와5종 변조·거부 revision/저장 보존·undo/redo/재열기를 검사합니다.

동일 최종 후보의 실제 issue5543 전용 감사는14/14 성공·refusal/failure0·exit0입니다. 앞선7거부를 해결했다는 범위이며 다른 참조 파일/모든 명령/실제 Canvas 브라우저/물리 IME/조판 완료로 확대하지 않습니다.

등록 HWPX32파일을 소스 hash `1ff8b6893dcf9f77c7de15177a7a0b25d42d4d71d9c8de1576bcedc5771a31a0` 전후 동일 조건으로 실행한 최종 결과는90/90·fail/cancel/skip0·exit0(142480.456625ms)입니다. `manual-dependency-registered-32-frozen.log`에 실행 경계를 기록했습니다. 최초 실행은 분리 검증 폴더의 이미 main에 게시된 감사 CLI 파일 누락으로89/90·exit1이었습니다(`MODULE_NOT_FOUND`, `manual-dependency-registered-32-incomplete-tree.log`). 파일을 보완한 후 CLI 집중2/2와 전체32파일을 다시 실행했으며 앞선 실패를 통과로 바꾸어 집계하지 않았습니다. 전체 native 전수·기본 데모 승격은 여전히 별도입니다.

동일a5d280 후보로 참조7파일과 레거시 chart를 다시 순차 실행한 결과는8파일48수식 모두 성공·거부/실패0·exit0입니다(`manual-dependency-reference-8.log`). ca351의41성공/7실패와 대비되는 새 결과이며 모든 HWPX 편집 명령/조판의 완료로 해석하지 않습니다.

주석과 검증 등록을 마친 소스의 재빌드도 ReleaseSafe5/5·exit0입니다. 재빌드 산출물 `f1c6e52194df78b67bdd23239b71756f6f79e46ebbb56cae1046be5d4ca3e49c`는 debug/custom section 때문에 파일 해시가 다릅니다. 독립 section 경계 순회로 WASM header와 모든 non-custom section(type/function/table/memory/global/export/element/code/data)을 byte-exact 대조했고 두 파일 모두 core SHA-256 `a66d034538d1d6d3ca12b348d5aa2afb9df0f6a586899eb78493e9a89d25c9d5`로 동일합니다. 재빌드 파일 자체의 실제 의존 수식/오라클 집중3/3도 통과했습니다(1852.723291ms). 앞선90개와48수식 실행의 파일 해시는a5d280으로 유지하며 f1c6 전체 재실행이라고 소급하지 않습니다.

f1c6 재빌드 파일의 HWP5 등록18파일과 CFB6파일을 함께 실행한 교차 포맷 회귀는359/359·fail/cancel/skip0·exit0(5809.568834ms)입니다. HWPX 런타임 변경을 HWP5/CFB의 전체 참조 지원 완료로 해석하지 않습니다.

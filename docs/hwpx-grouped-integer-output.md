# HWPX grouped 정수 결과 표시

## 계약

`src/hwpx/formula_output.zig`는 HWPX `ResultFormat=%g,`의 유한 정수 결과를 공유 `calculation_result_text`의 fixed/precision0/grouping 경로로 렌더링합니다. 원본 캐시를 계산 권위로 채택하지 않습니다. 소수 결과의 기존6유효자리, `%g` 비grouped, fixed2, 명시적 HWP5 general6 정책은 바꾸지 않습니다. 모든 한글 계산 정밀도의 동치를 입증한 정책은 아닙니다.

## 실제 원인과 확인

RHWP 참조 `aift.hwpx`는 원본5,056,727바이트이며 SHA256은 `5e27ee51825d10f0f51bd04935f0f9f8fc24f930a010367d822638964fefd491`입니다. 이전 main 후보는 무편집 저장 때 section2의 계산 결과1,000,000을1e+06으로 바꾸며 dirty/Command/LastResult/표시 텍스트를 변경했습니다. ZIP의 다른 payload는 같았습니다.

격리 main 기반 ReleaseSafe 후보 `3d554510975939c26bbf6ba9566d3723c50ea298ed0966e2c78aa3b79d68625f`는 수정 후 실제 aift의 세 구역6조회 및 무편집 저장을 마쳤고 원본 크기/SHA256과 정확히 같았습니다. 관측 peak RSS200,851,456바이트, exit0입니다. 로그는 `/tmp/hwpjs-note-geometry-publication.Wkoeip/grouped-output-aift.jsonl`입니다. 후보끼리 동일 비교한 실행이며 이전 후보와 조회 동치라는 주장이 아닙니다.

## 편집 회귀와 적대적 대조

`tests/hwpx/grouped-integer-editor.test.mjs`는 추적 chart.hwpx의 실제 숫자4셀을250000으로 바꾸어1,000,000 결과,4단계 undo/redo, 저장 재열기 및 원본 파일 불변을 검사합니다. `grouped-integer-save-oracle.py`는 원본 XML에서 독립 Decimal 산술과 전체 대상 XML·비대상 ZIP payload·메타데이터를 비교합니다. 정상 Python과 `-O`에서 모두 실행하며, 캐시/표시를 함께1e+06으로 변조한 파일은 실제 XML 불일치로 거부해야 합니다.

2026-10-15 해당 공개 회귀1/1·skip0·exit0을 확인했습니다. 최초 검사기의 원본 숫자2개 기대값 오류와 변조 ZIP 메타데이터 선행 거부는 수정 후 다시 실행했습니다. 이 성공은 전체 픽스쳐 편집, Canvas/IME, 전체 native gate 또는 기본 WASM 승격 완료를 뜻하지 않습니다. copay 참조의 InvalidFormulaReference는 별도 미해결입니다.

같은 후보로 grouped-integer-editor·numeric-exact-corpus·formula-definition-corpus·formula-editor4파일을 동시성2로 실행해10/10·fail/skip0·exit0(47526.415416ms)을 확인했습니다. 실제48숫자 입력의 정확한 결과 문자열,13수식 정의 변경의 독립 XML/산술, PRODUCT/반복 주소 및 서식 합성·이력 회귀를 포함합니다. ReleaseFast native 집중도 root 포함3/3·exit0이며 ReleaseSafe3/3과 모드 중복 합산하지 않습니다. `zig fmt --check`와 소유 경로 `git diff --check`도 exit0입니다. 전체 등록 공개 묶음·전체 native·게시 gate는 아직 별도입니다.

후속 격리 main 기반 등록 공개 묶음은 신규 회귀를 포함한23파일을 정확히 선택해54/54·fail/skip0·exit0(117331.245458ms)으로 완료했습니다. 로그는 `/tmp/hwpjs-note-geometry-publication.Wkoeip/grouped-output-public-suite.log`입니다. 환경변수와 격리 tree의 고정 WASM 경로에 같은3d5545 후보를 두고 원본 Git metadata와 격리 work tree를 지정했습니다. 실제 작업 트리 기본 WASM은 교체하지 않았습니다. 이 후속 결과는 앞선 등록 묶음 미검증 상태만 갱신하며 전체 native gate·전체 참조 편집·브라우저·게시 완료로 확대하지 않습니다.

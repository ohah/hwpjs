# 수식 결과의 현재 문단 좌표

`formula_result_targets.zig`는 결과의 source 캐시가 아니라 `formula_current_snapshot`이 준비한 현재 표시로 문단 좌표를 재계산합니다. 일시적 Sites/보호 개체 segment의 소유권은 `formula_result_projection.zig`에 분리했으며 표시 텍스트도 같은 projection을 사용합니다. 원본 Sites·override·revision·source bytes는 바꾸지 않습니다. 공유 문단 정책/보호 개체 좌표/UTF-16 경계 검사와 기존 target wire를 재사용하며 문자열 일치로 필드 소유자를 추측하지 않습니다. 구조/생성 표 상태는 기존 수동 결과 setter가 거부하므로 이 조회도 권한을 제공하지 않습니다.

선택적 ABI는 `hwpx_edit_manual_formula_result_targets`, `hwpx_edit_manual_formula_result_range_target`, `hwpx_edit_manual_formula_result_display_text`이며 JS는 `manualFormulaResultTargets(section, paragraph)`, `manualFormulaResultRangeTarget(section, paragraph, start, end)`, `manualFormulaResultDisplayText(section, paragraph)`입니다. 현재 ABI 문단은 기존 native와 같은1기반입니다. 범위 선택은 유일한 결과 안에 들어가야 하고 서로게이트 중간 경계는 거부합니다. Worker 연결과 화면 검증 경계는 [Canvas 경로](canvas-formula-result-input.md)가 소유합니다.

## 검증

전용 native 진입점 `src/hwpx_formula_result_target_tests.zig`와 root import를 등록했습니다. ReleaseSafe 필터2/2·exit0으로 실제 chart의 표시 길이4→Unicode 입력 후7·범위/서로게이트 거부·저장 불변 및 합성 원본의 전체 할당 실패 지점에서 live override/저장 bytes/source 불변을 확인했습니다. 최초 컴파일은 격리 main에 없는 프로토타입 helper를 참조해 실패했습니다. 다른 프로토타입 변경을 통째로 가져오지 않고 기존 anchor 좌표를 재사용하고 공유 문단 정책 진입점만 추가한 후 통과했습니다.

ReleaseSafe 제품5/5·exit0 후보 SHA256은 `6902b399bcbb3a50f3719669c391c372be4aea5eaba0e01f12b0292335a0ae11`입니다. query/partial/full/Worker/edge5파일은26/26·fail/cancel/skip0·exit0(40354.953792ms)이며 `/tmp/hwpjs-manual-result-publication.ervxKq/manual-target-public.log`에 기록했습니다. 조회 후 revision/source/저장 불변과 undo/redo 좌표 복원, 선택적 query ABI 각각 누락 시 명시적 거부, 공유 decoder의 모든 절단 길이/개수 초과/역전/byte offset을 포함합니다. 실제13결과의 부분 입력·전체 XML/ZIP 일반/-O/변조 거부는 같은 묶음의 부분 치환 검사가 담당합니다.

이 결과는 전체 native·전체 참조 편집·Canvas/IME 완료나 기본 WASM 승격이 아닙니다. 후보는 `zig-out/manual-target-api/bin/hwpjs.wasm`이며 기본 작업 트리 산출물은 바꾸지 않았습니다.

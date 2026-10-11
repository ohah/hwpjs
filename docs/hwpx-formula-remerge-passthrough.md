# 계산식 재병합과 원본 줄 배치 보존 경계

## 재현과 원인

2026-10-12 공개 테스트 전체 실행은 WASM `7f310f37d2900794df5aeb2ec2b8df4c95e61f8b49b6e477a6209fadd2e74d26`에서 2,064개 중 2,063개 통과, 1개 실패로 종료했습니다. 실패는 `tests/hwpx/formula-split-editor.test.mjs`의 첫 테스트입니다.

실제 `chart.hwpx`의 숫자 셀을 `100`으로 바꾼 뒤 계산식 문단을 시작 또는 끝 경계에서 분할·재병합하면, 서식 없는 경우 `UnsupportedStructuralFieldEdit`가 발생했습니다. 같은 경계에 부분 서식이 있는 경우에는 병합됐습니다.

`paragraph_structure_save.zig`의 원본과 같은 단일 필드 문단 보존 경로가 계산식에도 일반 필드 검증을 적용했습니다. 이를 계산식 검증으로만 바꾼 중간 후보 `011e07f87416e1e674085c6d4709e59f4864b727e67e4a83dd2681f2e7b7ce19`는 명령 거부를 없앴지만 독립 XML 비교에서 실패했습니다. 실측 차이는 계산식 컨트롤이 아니라 분할 때 제거된 원본 `linesegarray`가 재병합 때 되살아난 것입니다.

## 수정 책임

현재 문단의 소유 마커를 기존 `formula_marker_kind.owned`로 판정합니다. 계산식 소유 문단은 구조 저장의 기존 계산식 재작성 경로를 사용하며, 무관한 일반 필드는 metadata-only 원본 보존 경로를 유지합니다. 마커 검증·계산식 평가·XML writer를 새로 복제하거나 독립 비교기의 요구를 완화하지 않습니다.

## 검증 상태

- 줄 배치 복원을 막은 중간 후보 `65a686c20ee8808d78cf38e12b66a24caeba29584f992e649bbfb18bc5f39dd8`: ReleaseSafe 빌드 6/6, 실패했던 재병합 테스트 1/1 통과. 테스트는 독립 Python 및 `-O` ZIP/XML 비교, 문자별 서식, undo/redo, 재분할, 숫자 재계산, 정의 변경, 재열기를 포함합니다.
- 문단별 소유권으로 범위를 한정한 현재 후보 `77a805aacf1cb3e1fed530ac946154916ce8b6eac6b71d801bc7dcf663e87584`: 포맷 검사 및 ReleaseSafe 빌드 6/6 통과. 계산식 분할, 구조 편집, Worker, 숫자 셀 분할의 결합 회귀는 **72/72 통과, 실패·skip 0, exit 0**으로 종료했습니다(382840.899083ms). 네 테스트 파일은 `formula-split-editor.test.mjs`, `structure-editor.test.mjs`, `structure-worker.test.mjs`, `formula-numeric-split-editor.test.mjs`입니다. 표 비의존 셀 169개 경계, 숫자 셀 157개 경계의 허용 108·보호 거부 49, 계산식 13개 문단의 양쪽 경계 및 독립 XML/ZIP·이력·재열기 비교를 포함합니다.
- 이전 전체 native 실행은 수정 전 소스 기준으로 정확한 소유 프로세스 확인 후 종료했으며 exit 143입니다. 통과·실패 결과로 집계하지 않습니다. 수정 후 전체 native와 공개 테스트를 새로 시작했으며 최종 결과는 아직 없습니다.

이 기록은 전체 픽스쳐 편집·파서·UI 또는 원본 한글 조판의 완료를 의미하지 않습니다. 기본 WASM·외부 데모도 이 후보로 교체하지 않았습니다.

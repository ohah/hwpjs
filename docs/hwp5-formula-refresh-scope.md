# HWP5 일반 입력과 표 계산식 갱신 범위

일반 텍스트 splice가 실제로 내용을 바꾸면 `formula_splice`는 기존 `formula_recalculate.applyDraftForParagraph`를 호출합니다. 변경 문단의 원본 소유권과 표 셀 범위의 교차 여부는 기존 `formula_dependency_scope.affected`가 단일 출처입니다. 이 판정과 무관한 별도 캐시·허용 목록을 만들지 않습니다.

종전에는 일반 입력 후 구역 전체의 지원 계산식을 평가했습니다. 따라서 변경 문단과 무관한 원본 계산식에 비숫자 입력이나 지원하지 않는 병합 셀이 있으면 정상 본문 입력까지 원자적으로 거부했습니다. 변경된 입력에 의존하는 계산식의 평가·오류·원자적 롤백은 그대로 유지하고, 무관한 계산식은 원본 상태를 보존합니다. 식 구문이나 소유권을 안전하게 판정할 수 없는 경우를 단순히 무시하는 변경이 아닙니다.

## 실제 파일 재현

| 파일 | 무관한 본문 입력·저장·재열기 | 의존 문단 입력의 오류 |
|---|---|---|
| issue6023/30269_reform_recommendation.hwp | 통과 | 문단215: InvalidFormulaNumber |
| task2430/1382000_domestic_violence_survey.hwp | 통과 | 문단842: InvalidFormulaNumber |
| loading-fail-01.hwp | 통과 | 문단228: UnsupportedMergedFormulaCell |

위 의존 문단 번호는 집중 Native 검사의0기반 모델 인덱스입니다. GUI의 페이지·문단 번호와 혼합하지 않습니다. 독립적인 임의 오류 삼키기나 숫자 문법 확대는 하지 않았습니다.

## 검증과 제한

`src/formula_unrelated_refresh_probe.zig`의 ReleaseSafe 집중 실행은 등록1개와 기능4개가 통과했습니다. 실제 세 파일의 계산식 control-header 보존, 저장·재열기, 의존 문단 오류 시 원본 바이트로 롤백을 검사했습니다. 기존 PRODUCT 의존성과 중첩 표 셀, 클릭 필드/계산식 혼합 트랜잭션도 포함합니다. 로그는 `zig-out/verification/asset-landscape/formula-native-focused.log`입니다.

새 ReleaseSafe WASM 빌드에서 동일한 세 원본의 공개 typed 편집·저장·undo/redo·재열기·재저장과 독립 CFB 전체 Section/다른 스트림 검사도 모두 통과했습니다. 근거는 `zig-out/verification/headless-edit-formula-scope-corrections`이며 후보 WASM SHA256은 `fbaff9b7d1e6683061157504a2c4be1030c8ba123120484947824c1bdf91d750`입니다. 전체 Native gate는 별도 실행 상태를 확인해야 하며, 집중 검사 결과를 그 통과로 대신하지 않습니다.

집중 실행 명령:

```sh
nice -n19 mise exec -- zig test src/formula_unrelated_refresh_probe.zig -O ReleaseSafe \
  --test-filter 'unrelated formula refresh' \
  --test-filter 'known table local formula scope' \
  --test-filter 'formula dependency scope includes' \
  --test-filter 'mixed field transaction preserves formula'
```

참조 픽스쳐가 필요한 선택적 집중 진입점입니다. 모든 수식 종류·전체 픽스쳐의 모든 편집 위치 지원을 의미하지 않습니다.

전체 작업 트리의 `zig build test -j1 -Doptimize=ReleaseSafe -Dnative-stack-traces=false`도 종료 코드0으로 완료했습니다. 실행 종료 뒤 표준 test metadata 프로토콜만 조회해 주 테스트 바이너리에4,669개 등록이 있음을 확인했습니다. 이 조회는 테스트를 재실행하지 않았고 스킵 개수를 집계하지 않으므로4,669개 모두 실행·통과했다고 별도로 단정하지 않습니다. 명령 로그와 바이너리 SHA·목록은 `zig-out/verification/asset-landscape/native-full-tests.log`, `native-full-metadata.json`에 남겼습니다. 새 배치 조회/필드 보호 prototype 모듈은 아직 이 등록 gate에 연결하지 않았으며 이 결과로 그 통합을 완료 처리하지 않습니다.

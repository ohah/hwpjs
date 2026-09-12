# Plot·배열·광원 경계 조사

## 범위와 근거

이 단계는 읽기 전용 조사이며 제품 Zig 파서 구현 완료가 아닙니다. [Legend](hwp5-chart-legend.md) 독립 조사기가 순차 계산한 끝에서 시작합니다. `tests/hwp5/chart-plot-evidence.mjs`는 선택한 배치 가설을 검사하고 원시 값을 복사된 hex 문자열로 반환하며, `chart-plot-survey.mjs`가 corpus 순회·SHA-256 기록을 담당합니다. 문자열 검색으로 객체 끝을 찾지 않습니다. corpus 선별의 VtChart 검색은 일반 형식 인식기가 아닙니다.

공식 [차트 revision 1.2](https://cdn.hancom.com/link/docs/%ED%95%9C%EA%B8%80%EB%AC%B8%EC%84%9C%ED%8C%8C%EC%9D%BC%ED%98%95%EC%8B%9D_%EC%B0%A8%ED%8A%B8_revision1.2.pdf)의 3.44 Plot 및 3.36~3.38 Light/LightSources/LightSource 표를 확인했습니다. 이 API 속성 표에는 직렬화 순서·두 배열 word의 관계가 명시되어 있지 않습니다. API Count의 Long을 근거로 wire 값을 u32 하나로 읽지 않습니다. 격자의 행/열 계열 방향을 결정하는 속성도 아직 원시 바이트 위치와 대응시키지 않았습니다.

## 실측

43개 Contents에서 다음 선택 배치가 모두 다음 Axis 선언까지 맞았습니다. 결과는 `/tmp/hwpjs-chart-plot-survey.json`에 각 입력 SHA-256과 절대 위치로 기록했습니다.

| 구간 | 관측 결과 |
|---|---|
| Plot | 새 객체 + VtChartPlot v4 선언 |
| 첫 배열 | 새 객체 + VtArray v1, u16 0, VtCollection v1 참조, u16 0, VtObject v1 참조 |
| 미해석 영역 | 136바이트, 8가지 원시 값; 의미나 소유 하위 객체 미확정 |
| Light | Plot 시작 +192에서 새 객체 + VtLight3 v1 선언 |
| 광원 배열 | VtArray 재참조, u16 n, VtCollection 참조, u16 n, VtObject 참조 |
| 광원 원소 | n번의 새 VtInfLight3 v1 객체, 원시 16바이트, VtObject 참조 |
| 광원 후속 | 원시 10바이트, VtObject 참조 |
| 다음 경계 | 새 VtAxis v3 선언; Axis 본문은 읽지 않음 |

n=1은 5개, n=2는 38개입니다. 첫 광원만 타입을 선언하고 다음 광원은 타입 ID만 소비합니다. Axis 객체 시작은 Plot 기준 +291/+319로, 원소 추가 시 차이는 28바이트입니다. 16바이트를 위치·세기 float 네 개로 해석할 가능성은 있지만 이 조사에서는 비트 그대로 보존합니다.

첫 표본 SHA-256은 `2e56516aabde4ff7cb73f946860e83c345d0944b0c11e0322f09b739cac1d56a`입니다. 136바이트 길이와 두 word 동일성은 관측 배치의 전제이지 모든 버전의 규칙으로 확정한 것이 아닙니다. 조사기는 첫 배열이 비어 있지 않거나 두 word가 다르면 명시적으로 미지원 오류를 냅니다. 이를 유효하지 않은 HWP라고 판정하지 않습니다. 두 word 중 하나가 용량/원소 수일 가능성 등은 추가 표본으로 검증해야 합니다.

## 적대적 검증

- 독립 합성 입력의 Node 테스트 8개 통과: 광원 0/1/2/3/65,535개, offset 0/1/17/256, 불연속 타입 ID와 FFFFFFFF 타입 ID, 객체 ID 0, 최초 선언/재참조, 원시 바이트 보존과 입력 변경 후 결과 수명.
- 모든 잘림, 클래스/버전/기존 잘못된 타입, 두 word 불일치와 첫 비어 있지 않은 배열, null/중복 객체, 외부 타입 목록 상태 보존, 잘못된 호출자 offset의 명시적 오류를 검사했습니다. 원시 FF 값도 숫자 정규화 없이 보존합니다.
- 실제 43개 입력에서는 다음 Axis 선언 끝까지 14,394개 잘림과 버전 변경 215개를 기대한 일반 Error로 거부했습니다. 거부 후 원본 결과도 재확인했습니다. 이는 Plot 전체 끝까지 검사한 횟수가 아닙니다.
- `/tmp/hwpjs-chart-plot-mutants.7gVOz2`의 여섯 소스 변형(원소 수 2 강제, 원시 값 삭제, offset 0 강제, 두 word 비교 생략, 버전 검사 생략, 객체 중복 검사 생략)을 모두 실제 런타임 테스트 실패·종료 코드 1로 검출했습니다. 원소 수 강제는 정상 입력의 IncompletePlotObservation으로, 나머지는 assertion 등의 실패로 검출하며 구문 오류를 검출로 세지 않습니다.

제품 코드·정규 audit는 변경하지 않았습니다. 이번 조사에 대해 Zig 세 모드 전체 회귀를 재실행했다고 주장하지 않습니다. 합성 최대 개수의 통과도 실제 파일에서 그 개수가 지원됨을 입증하지 않습니다.

```sh
node --test tests/hwp5/chart-plot-evidence.test.mjs
node tests/hwp5/chart-plot-survey.mjs
```

후속 Zig 구현은 [배열 헤더](hwp5-chart-array-header.md)와 [광원 객체](hwp5-chart-light.md)로 책임을 분리했습니다. 소유권·할당 실패·한도·실파일 대조 결과는 해당 계약이 소유하며, 이 조사 기록과 구분합니다. Plot 전체, Axis, 일반 객체 재참조, 비어 있지 않은 첫 배열과 다른 버전은 여전히 남아 있습니다.

# Axis 제목·선택적 배율 객체 조사

## 범위와 근거

이 단계는 `tests/hwp5/chart-axis-prefix-evidence.mjs`의 읽기 전용 배치 조사입니다. [광원 구현](hwp5-chart-light.md) 이후 Axis 시작 위치를 앞선 독립 조사로 계산하며, 그 이후 문자열 검색으로 경계를 찾지 않습니다. `chart-axis-prefix-survey.mjs`는 corpus 순회·타입/문자열 사전 준비·입력 SHA-256·집계를 담당합니다. 제품 Zig 파서나 정규 audit는 변경하지 않았습니다.

공식 차트 revision 1.2의 3.7~3.10 Axis/AxisGrid/AxisScale/AxisTitle 표를 읽었습니다. API 속성 표만으로 wire 순서나 원시 영역의 의미를 확정하지 않습니다. 특히 제목의 Backdrop과 글꼴을 설명하는 API 표는 참고 근거이며, 아래 바이트 배치는 실측 근거입니다. 원문 링크는 [Plot 조사](hwp5-chart-plot-evidence.md)에 둡니다.

## 43개 실측

각 입력의 첫 Axis만 대상으로 다음 위치까지 순차 대조했습니다. 재현 출력은 `/tmp/hwpjs-chart-axis-prefix-survey.json`입니다.

| 구간 | 관측 |
|---|---|
| Axis 시작 | inline VtAxis v3 선언 뒤 원시 82바이트 |
| 제목 | inline VtTextBlock v2 + 원시 12바이트 |
| 보조 참조 | 43/43 null이 아닌 inline Backdrop·Fill·빈 Picture |
| 글꼴 | inline VtFont v1, 이름은 43/43 이전 String ID 재참조 |
| 제목 나머지 | 기존 TextBlock의 raw14·기반 타입·raw24·String·raw26·기반 타입 배치 |
| 제목 총 길이 | 첫 제목은 43/43에서 278바이트 |
| 다음 배열 | 34개는 두 word 1/1, 9개는 0/0 |
| 1/1의 원소 | VtAxisScaleBlock v1 + 다음 VtArray 헤더 |
| 내부 배열 | 34/34에서 두 word **5/0**; 원소/후속 본문은 아직 읽지 않음 |

두 배열 값이 같아야 한다는 조건을 일반 배열 규칙으로 삼을 수 없다는 실제 반례입니다. [배열 헤더](hwp5-chart-array-header.md)가 두 값을 독립 보존하고 [Light](hwp5-chart-light.md) 소비자에서만 관측 동일값 조건을 선택하도록 분리한 구조를 유지합니다. 5/0을 capacity/count 또는 빈 배열로 확정하지 않으며, 해당 두 필드의 의미는 여전히 미확정입니다.

제목 앞 raw 길이를 처음 80/81로 잡은 시도는 실패했습니다. 첫 입력의 Axis 상대 +101에서 제목 객체 ID, +105에서 TextBlock 타입 ID가 시작하는 것을 u32 단위로 확인했고, Axis 선언 끝 +19에서 제목까지 **82바이트**로 정정한 후 전체 43개를 통과했습니다. 이 길이는 모든 Axis 버전의 일반 규칙이 아닙니다.

타입 목록도 읽기 시작 위치 직전 상태여야 합니다. 앞선 Plot 조사기는 경계 확인용 Axis 선언까지 관찰하므로, 그 마지막 선언을 사전에 먼저 등록하면 실제 Axis 입력을 재등장 참조로 잘못 읽습니다. survey는 Axis 시작보다 앞선 선언만 등록합니다. 미래 선언을 미리 등록하는 것은 버전 차이가 아니라 조사기 상태 준비 오류로 구분했습니다.

## 적대적 검증

독립 합성 입력의 Node 테스트 4개가 통과했습니다. null/Backdrop 보조 값, 기존 문자열을 이름/본문에서 함께 참조, 배율 있음/없음, 5/0 보존, offset 0/1/17/257, 원시 값 복사·입력 변경 후 결과 수명, 최초 선언/타입 재사용, 모든 잘림·클래스/버전, null/중복·잘못된 종류, 명시적 offset 오류, 끝 뒤 불필요한 데이터 무시를 검사했습니다.

실제 43개에서는 조사 끝까지의 잘림 **18,823건**, 새 타입 선언의 버전 변형 **77건**을 기대한 일반 Error로 거부했습니다. 오류 후 원본을 다시 읽은 결과도 같았습니다. 이것은 전체 Axis 끝까지의 검사가 아니며, 배율이 있으면 그 내부 배열 헤더 끝까지만 검사한 결과입니다.

`/tmp/hwpjs-chart-axis-mutants.HyQECC`에서 offset 0 강제, raw 삭제, 둘째 word를 첫째 값으로 덮어쓰기, raw 길이 80 강제, 버전 검사 생략, 문자열 참조 처리 무력화, 배율 객체 존재 강제의 7종을 실제 런타임 테스트 실패와 종료 코드 1로 검출했습니다. 구문 오류를 검출로 세지 않았습니다.

조사기의 객체 목록은 이전 String과 현재 구간의 새 객체만 추적합니다. 앞선 모든 비문자열 객체와의 전역 충돌 검증을 완료했다고 주장하지 않습니다. 제품 통합에서는 기존 공통 객체 목록을 사용해야 합니다. 또한 미지원 선택 배열 배치는 조사기의 미지원 오류이지 HWP 파일 자체가 잘못됐다는 판정이 아닙니다.

```sh
node --test tests/hwp5/chart-axis-prefix-evidence.test.mjs
node tests/hwp5/chart-axis-prefix-survey.mjs --verify
```

## 다음 구현 경계

기존 TextBlock의 readObservedV2는 보조 값 null과 inline String 이름만 지원합니다. 이번 실제 Axis 제목에는 Backdrop 보조 객체와 이름 재참조가 있어 그대로 연결하면 UnsupportedChartTextReference가 납니다. 후속 [TextBlock 확장 경로](hwp5-chart-text-block-objects.md)는 기존 진입점 계약을 유지하면서 Backdrop 소비와 객체 목록 기반 Font/String 해석을 재사용합니다. Axis와 선택적 배율 객체의 전체 조립은 아직 남아 있습니다.

후속 정규 대조와 타입/문자열 사전 준비를 중복하지 않도록 `chart-axis-context.mjs`를 공유합니다. 관측 결과에는 문자열 정의/참조 위치, Backdrop 끝, 타입 참조·객체 위치 메타데이터를 추가했으며 기존 원시 값과 경계 계약은 유지합니다.

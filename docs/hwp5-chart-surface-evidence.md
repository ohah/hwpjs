# Axis 이후 SurfaceDesc 접두부 조사

## 범위와 명세

공식 차트 revision 1.2의 3.55 Surface Object 및 4.46~4.49 상수 표를 확인했습니다. Base·Brush·Wireframe 등 API 속성은 내부 직렬화 순서/폭을 제공하지 않으므로 이번 원시 필드를 해당 속성으로 확정하지 않습니다. 원문 출처는 [Plot 조사](hwp5-chart-plot-evidence.md)에 있습니다.

`chart-surface-evidence.mjs`는 기존 네 축의 정확한 끝부터 raw30, 객체 ID와 VtSurfaceDesc v1, raw46, 후속 VtArray/VtCollection/VtObject v1의 0/0 배열 헤더까지만 관찰합니다. 타입 ID는 사전으로 해석하며 새 선언과 기존 참조를 구분합니다. 위치 후보를 재시도하거나 타입 문자열을 검색하지 않습니다. 원시 바이트는 hex로 복사하고 호출자의 타입 Map을 복제합니다.

SurfaceDesc와 후속 배열의 두 ID는 null/중복을 거부하지만 전체 이전 객체 ID 그래프를 검증하는 관측기는 아닙니다. 배열이 SurfaceDesc 소유인지, raw46 안의 필드 의미가 무엇인지, SurfaceDesc 및 Plot의 완전한 끝이 어디인지는 아직 확정하지 않았습니다. 제품 Zig 파서나 정규 audit 경로는 변경하지 않습니다.

## 실측과 검사

선택된 실제 차트 43개에서 모두 이 접두부를 읽었습니다. raw46은 이 표본에서는 동일했으나 이를 상수로 강제하지 않습니다. 실제 접두부의 모든 잘림 5,246건과 새 타입 버전 변형 43건을 정확한 일반 Error 및 기대 오류명으로 거부했습니다. 정확한 끝에서 자르기, 이후 데이터 FF 변경, 원본 재관측 결과도 일치했습니다. 로그는 `/tmp/hwpjs-chart-surface-survey.json`입니다.

합성 테스트 두 개는 offset 0/1/17/257, 희소 타입 ID, 모두 새 선언/모두 기존 참조, raw30/46 보존 및 복사 수명, 모든 잘림, 클래스/버전 변형, null·중복 ID, 배열 양쪽 word 변형, 호출자 Map 보존과 잘못된 offset 오류를 확인합니다.

`/tmp/hwpjs-surface-mutants.kcbdOV`의 offset 0 강제, raw 삭제, raw46을 45로 변경, 버전 검사 누락, 호출자 Map 직접 변경, ID 중복 검사 누락, 배열 검사 누락의 7종은 구문 검사를 통과한 뒤 런타임 테스트 실패(종료 코드 1)로 검출했습니다.

## 후속 구간의 반례

후속 배열 끝에서 기존 Axis 관측기로 이어 읽는 별도 진단은 43개 모두 UnsupportedAxisObservationObject로 실패했습니다. 첫 표본에서는 시작 5,056, 오류 위치 5,228(상대 +172)에서 FFFFFFFF가 관측됐습니다. 타입 이름이 같다는 이유만으로 기존 첫 네 축의 필드 필수 여부를 적용할 수 없습니다. null이 허용되는 다른 배치인지 등은 다음 조사 대상이며, 이 단계에서는 기존 제품 Axis 계약을 변경하지 않았습니다.

후속 [nullable 제목 조사](hwp5-chart-axis-null-title.md)는 실패 위치가 제목 텍스트임을 확인하고, 기존 필수 제목 경로와 별도의 명시적 관측 경로로 구분합니다.

```sh
node --test tests/hwp5/chart-surface-evidence.test.mjs
node tests/hwp5/chart-surface-survey.mjs --verify
```

조사에는 기존 제품 WASM 빌드가 필요합니다. 이번 변경은 독립 조사 코드와 문서뿐이며 이전 Axis 전체 회귀 결과를 이번 조사에서 재실행한 결과로 주장하지 않습니다.

후속 [Plot·Surface 접두부 코어](hwp5-chart-plot-surface-prefix.md)의 구현·직접 WASM 대조·전체 회귀 상태는 별도 문서에서 관리합니다. 조사기에 추가된 타입 참조·word 위치 메타데이터도 해당 직접 대조에서 사용합니다.

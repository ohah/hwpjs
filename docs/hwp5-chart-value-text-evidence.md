# 배율 값의 TextBlock 기반 클래스 조사

## 확인한 경계

[첫 값 블록 라벨 조사](hwp5-chart-value-prefix-evidence.md) 이후를 실제 34개에서 순차 대조했습니다. 라벨 끝 뒤 **원시 3바이트**, VtTextBlock v2 타입 참조, 기존 TextBlock 본문, VtObject v1까지 연결됩니다. 별도 TextBlock 객체 ID 네 바이트를 소비하지 않습니다. 기반 클래스 직렬화로 해석하는 선택 배치이며 모든 버전의 일반 규칙이나 ValueBlock 전체 끝을 입증한 것은 아닙니다.

원시 3바이트는 첫 표본에서 `2e0000`, 나머지에서 `000000`입니다. 의미나 개별 필드 폭을 추측해 정규화하지 않습니다. TextBlock 내부에는 Backdrop·Font·문자열·원시 영역이 이어집니다. **본문 String은 33개 null, 1개 비-null**이었습니다. 기존 Axis 제목의 필수 String과 다르므로 기반 클래스 조사 진입점에만 null을 허용합니다.

## SSOT와 지원 경계

- `chart-axis-prefix-evidence.mjs`의 같은 본문 읽기를 Axis 제목과 새 observeTextBlockBase가 공유합니다. 제목의 ID 소비와 필수 본문 계약은 유지합니다.
- `chart-value-text-evidence.mjs`는 앞선 값 블록 조사 결과에서 타입/문자열 사전을 이어 받고, 원시 3바이트와 TextBlock 기반 클래스를 조립합니다. String/Backdrop 본문을 다시 구현하지 않습니다.
- `chart-value-text-survey.mjs`는 corpus와 검증 집계를 담당합니다. 결과에 입력 SHA-256을 남깁니다.

입력/사전은 복사하고 결과 문자열·원시 값도 복사합니다. 전체 비문자열 객체 목록, 임베디드 객체 ID, 모든 ValueBlock/AxisScaleBlock/Axis 꼬리 및 의미 해석은 아직 미확인입니다. 제품 Zig TextBlock의 null 본문 지원을 추가한 단계는 아닙니다.

## 적대적 검증

실제 34개에서 라벨 이전부터 TextBlock 기반 클래스 끝까지 **12,855개 잘림**, **51개 새 타입 버전 변형**을 명시적 일반 Error로 거부했습니다. 원본 재관측 결과도 동일합니다. 부족한 입력에 따른 IncompleteValueObservation/IncompleteAxisObservation과 타입 불일치 오류를 구분하며 임의 trap을 성공으로 세지 않습니다.

합성 테스트는 별도 객체 ID가 없는 배치, null/기존 String 본문, 앞서 새로 정의한 라벨을 Font/본문에서 재참조하는 경우, offset 0/1/17/257, 비영 원시 3바이트, 전체 잘림, 이전 타입 버전 변형, 정확한 끝 이후 데이터, 입력/사전 변경 후 결과 수명을 검사합니다. 기존 Axis·값 접두부 테스트와 합쳐 **9개 테스트**입니다.

`/tmp/hwpjs-chart-value-text-mutants.2L3FVv`에서 원시 3바이트 삭제, 다음 위치 +1 오류, 앞선 문자열 사전 전달 누락, 최종 끝 위치를 라벨 끝으로 반환, 새 타입 사전 전달 누락의 5종이 구문 검사 후 런타임 테스트 실패로 검출됐습니다. 문자열 전달 누락은 기존 문자열만 가진 합성 입력으로는 검출되지 않아, 새 라벨을 후속 Font가 참조하는 입력을 추가하고 실제 실패를 확인했습니다. 타입 전달도 앞서 선언한 String/Value 타입을 후속 새 String이 재사용하는 독립 합성 입력으로 확인했습니다.

```sh
node --test tests/hwp5/chart-value-text-evidence.test.mjs tests/hwp5/chart-axis-prefix-evidence.test.mjs tests/hwp5/chart-value-prefix-evidence.test.mjs
node tests/hwp5/chart-value-text-survey.mjs --verify
node tests/hwp5/chart-axis-prefix-survey.mjs --verify
```

정규 oracle도 사용하는 공통 Axis 조사 본문을 변경했으므로 기존 정규 audit의 회귀도 확인합니다. 최신 실행 결과는 아래에 기록합니다.

- Debug: 종료 코드 0, 27/27 steps, 1,033/1,033 native tests, 8,064,596 HWP/WASM checks. 로그: `/tmp/hwpjs-value-text-Debug-audit.log`.
- ReleaseSafe: 종료 코드 0, 27/27 steps, 1,033/1,033 native tests, 8,064,596 HWP/WASM checks. 로그: `/tmp/hwpjs-value-text-ReleaseSafe-audit.log`.
- ReleaseFast: 종료 코드 0, 27/27 steps, 1,033/1,033 native tests, 8,064,596 HWP/WASM checks. 로그: `/tmp/hwpjs-value-text-ReleaseFast-audit.log`.

세 모드 audit 이후 기본 `zig build test --summary all`도 1,033/1,033 tests, 제품 `zig build -Doptimize=ReleaseSafe --summary all`도 5/5 steps로 통과했습니다. 변경 JS 구문 검사·문서 링크·diff 공백 검사도 통과했습니다. 이 회귀 결과는 제품 배율 파서나 전체 차트 의미 해석의 완성을 뜻하지 않습니다.

## 후속 꼬리 조사 방향

아래는 후보 탐색 당시의 이력입니다. 후속 [Axis 연속 경계 검증](hwp5-chart-axis-evidence.md)은 +6 관측 선택 값으로 한 번만 길이를 계산해 172개 축을 연결합니다. 의미 필드와 다른 선택 값은 여전히 미확인입니다.

아래 두 번째 Axis의 String/Double 반례는 후속 [선택 필드 조사](hwp5-chart-value-number-evidence.md)에서 해당 위치를 확인하고 확장했습니다. 가변 꼬리와 전체 축 경계는 여전히 별도 과제입니다.

별도 진단에서 기반 클래스 끝 이후 다음 Axis의 타입 참조 후보를 찾고, 앞서 관측한 타입/String 사전을 이어 후보 위치에서 기존 Axis 조사기를 실행했습니다. 29개는 +54바이트, 5개는 +78바이트에서 다음 Axis 제목과 배율 배열 헤더까지 읽혔습니다. 두 후보 길이 중 각 입력에서 성공한 것은 하나였습니다.

이는 **진단용 후보 탐색**이며 구조적으로 다음 위치를 계산하는 파서가 아닙니다. 24바이트 차이를 결정하는 필드, 꼬리 내 객체 경계와 소유권은 아직 확인하지 못했습니다. 두 길이 재시도나 타입 검색을 제품 파싱 규칙으로 채택하지 않습니다. 후속 작업은 이 가변 구간을 필드 순서로 설명하고 독립 입력으로 반증하는 것입니다.

추가 진단에서 첫 Axis 원시 영역의 +6 u16은 긴 꼬리 5개에서 1, 짧은 꼬리 29개에서 0이었습니다. 상관관계일 뿐 조건 필드의 의미나 일반 규칙이 입증된 것은 아닙니다. 공식 DateScale(3.23)/ValueScale(3.59) API 표도 확인했지만 wire 순서를 제공하지 않아 24바이트를 날짜 속성으로 확정하지 않았습니다.

후보 다음의 **두 번째 Axis**로 조사 범위를 확장하면 기존 값/String 전제는 33개에서 통과하고 1개에서 실패합니다. 해당 표본의 Contents 절대 위치 3275까지 읽은 타입은 ID 7, `VtDouble v1`인데 조사기는 `VtString v1`을 기대했습니다. 첫 Axis 34개 통과를 모든 축 지원으로 확대할 수 없는 반례입니다. 다음 구현 전 해당 값 위치의 String/Double 변형과 참조 규칙을 확인해야 하며, 이를 손상 파일이라고 분류하거나 String으로 강제 변환하지 않습니다.

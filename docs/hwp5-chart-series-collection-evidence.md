# Series 반복과 Title 헤더 경계 조사

## 확인한 범위

읽기 전용 조사이며 제품 파서·WASM ABI 변경이 아닙니다. 기존 Series 접두부 → Point/Label → TextBlock/TextFormat → 빈 Picture 뒤에 **106바이트를 원문 그대로 보존**하면, 선택한 모든 계열이 다음 Series 접두부 또는 `VtChartTitle` v1 헤더로 연속 연결됩니다. 실패 후 검색·재동기화하지 않습니다.

584개 HWP에서 얻은 43개 차트 `/Contents`를 조사했습니다. 1개는 Series 3개(각 Point 4개), 42개는 Series 5개이며, 후자 중 1개에 Point 4개가 있습니다. 합계 Series 213개, Point 16개입니다. 선행 배열의 두 word는 이 표본에서 3/3 또는 5/5이며 관측한 계열 수와 일치합니다. 이를 모든 배열의 일반 규칙으로 승격하지 않습니다.

모든 차트에서 마지막 계열 바로 다음은 신규 `VtChartTitle` v1 선언이며 헤더는 25바이트입니다. 헤더 이후에는 표본에 따라 440/430/396바이트가 남습니다. Title 본문이나 전체 Chart 끝을 해석한 것이 아닙니다.

106바이트 내부의 필드 의미는 미확정입니다. [Picture 조사에서 폐기한 기반 타입 가설](hwp5-chart-series-picture-evidence.md)을 복원하지 않습니다. 숫자가 타입 ID와 같다는 이유만으로 타입 참조로 해석하지 않으며, 공식 API 속성 표를 직렬화 순서의 증거로 사용하지 않습니다.

## 책임과 상태

- `tests/hwp5/chart-series-label-section-evidence.mjs`: 기존 첫 계열 oracle과 새 반복 조사에서 Point/Label 조립 순서를 공유합니다. Point 수 0/1/4만 선택하며 두 배열 word 일치를 요구합니다. 일반 파서 지원 범위가 아닙니다.
- `chart-series-evidence.mjs`: 기존 구간 조사기를 조립하고 Picture 뒤 raw106을 보존합니다.
- `chart-series-collection-evidence.mjs`: 호출자가 지정한 계열 수만 순차 소비하고 다음 Title 헤더를 검사합니다. 최대 16은 조사 작업량 제한이며 제품 배열 정책이 아닙니다.
- `chart-title-header-evidence.mjs`: inline 객체 ID와 클래스·버전만 검사합니다. 신규/기존 타입, 전체 선행 객체 범위의 중복·null ID를 검사합니다.
- `chart-series-collection-errors.mjs`: 잘림 판정의 오류명과 정확한 Error 생성자 검사를 테스트·실파일 조사에서 공유합니다.

계열 간 타입·객체·문자열 상태를 전달합니다. 입력 Map/Set을 복사하고 원시 바이트를 hex로 보존하되, Map 값까지 깊은 불변 복사를 보장하지는 않습니다. 제품 구현과 독립된 조사 코드이며 제품 serializer로 기대값을 생성하지 않습니다.

## 검증 기록

`chart-series-collection-survey.mjs --verify` 종료 코드 0:

- 계열 시작부터 Title 헤더 끝까지 모든 잘림 147,396건
- 중복 객체 ID 256건, Title 클래스/버전 변형 86건
- raw106 변형 213건, 계열 수 불일치 86건
- 정확한 끝, 뒤쪽 바이트 무관성, 원본 재파싱 대조

독립 fixture는 offset 0/1/17/257, 계열 수 0/1/2, Point 수 0/1/4, 신규/기존 Title 타입, ID 0, 희소 타입 ID, null/별칭 문자열, 원시 바이트 소유권과 순차 상태를 검사합니다. 신규 3개를 포함한 `chart-*evidence.test.mjs` 테스트 50개가 통과했습니다.

적대적 변형 11종(raw106 길이 105/107, 원문 삭제, 계열 반복 누락, 상태 전달 삭제, Point 반복 누락, Title 클래스·버전·중복 ID 검사 삭제, 입력 타입 Map 직접 변경, 호스트 예외 오인)을 구문 검사 후 실행했습니다. 모두 실제 테스트 실패·종료 코드 1로 검출했으며 SyntaxError/ReferenceError는 검출로 세지 않았습니다. 임시 로그는 `/tmp/hwpjs-series-collection-mutants.swnpdt`입니다.

실파일 조사 결과는 `/tmp/hwpjs-chart-series-collection-survey.json`에 기록했습니다. 임시 로그는 재현의 필수 입력이 아닙니다.

Point/Label 조립 공통화 후 기존 Debug·ReleaseSafe·ReleaseFast 테스트 WASM과 각각 대조했습니다. 세 모드 모두 Picture(성공 172/거부 3,010), Backdrop(129/8,944), suffix(426/9,004), TextFormat(200/3,749), Axis(344/106,570), SeriesLabel/Point(182/11,304), Series 접두부(215/4,988)가 통과하고 종료 코드 0입니다. 기존 경로의 회귀 검증이며 새 계열 반복의 제품 지원 검증은 아닙니다. 제품 코드를 변경하거나 이번 단계에서 전체 audit를 재실행하지 않았습니다.

```sh
node --test tests/hwp5/chart-*evidence.test.mjs
node tests/hwp5/chart-series-collection-survey.mjs --verify
```

## 남은 범위

제품 코어의 전체 계열 조립·WASM 연결, raw106의 필드 의미, Title 본문과 나머지 Chart, 표본 밖 버전·배열 형태는 미완료입니다. 이번 조사 결과를 전체 차트 지원·렌더링·무손실 저장 완료로 해석하지 않습니다.

위 내용은 조사 단계의 이력입니다. 후속 제품 조립과 검증의 현재 범위는 [Series 조립·Title 헤더 코어](hwp5-chart-series-collection.md)가 소유합니다.

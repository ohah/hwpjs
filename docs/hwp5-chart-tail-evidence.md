# Contents 끝의 List·Window 타입 구간 조사

## 확인한 경계

[Title 코어](hwp5-chart-title.md) 다음의 78바이트를 읽기 전용으로 조사했습니다. 43개 차트 모두 다음 순서로 Contents 끝에 도달합니다.

- inline List ID·VtList v1·VtCollection v1·word·VtObject v1: 29바이트
- 의미·소유 관계를 해석하지 않는 원시 영역: 26바이트
- VtWindow v2 타입·VtObject v1·word: 23바이트

두 word는 표본에서 모두 0입니다. 일반적인 개수·예약값 규칙으로 승격하지 않고 u16 값 그대로 보존합니다. List 요소가 없는 선택된 배치를 관측한 것이며 임의의 List 요소나 모든 버전의 List를 파싱하는 구현은 아닙니다.

EOF 일치는 이 실파일 조사의 외부 검증 조건입니다. 부분 구간 조사기 자체는 EOF를 요구하지 않아, 같은 구간 뒤에 다른 바이트가 있더라도 해당 경계에서 멈춥니다. 이름을 검색해 실패 후 재동기화하거나 오프셋을 재시도하지 않습니다.

## Window 앞의 미확정 4바이트

원시 26바이트의 마지막 DWORD는 모든 표본에서 0입니다. 확인된 선행 객체 범위에 ID 0이 없으므로, `raw26 + Window 타입 구간`과 `raw22 + ID 후보 0 + Window 타입 구간`을 현재 표본의 중복 검사만으로 구분할 수 없습니다. 선행 원시 필드에 아직 식별되지 않은 ID가 있을 가능성도 배제하지 않습니다.

따라서 0을 새 Window 객체 ID로 임의 등록하지 않습니다. Window 조사기는 **타입이 시작하는 위치부터만** 읽으며 전체 Window 객체의 시작이나 기반 클래스 여부를 확정하지 않습니다. 보고서의 `registeredObjects: 1`은 확인한 List ID 한 개의 등록 수이지, 새 객체가 실제로 한 개뿐이라는 증거가 아닙니다. 후보 값과 기존 범위 포함 여부를 별도 필드로 기록합니다.

로컬 `reference/rhwp/src/ole_chart/parser.rs`의 `extract_chart_title`은 다음 객체 명칭 또는 VtList 명칭을 찾아 제목 문자열 후보를 선택합니다. 이 경로는 위 Window 직렬화 경계나 ID 후보를 확정하는 근거가 아닙니다.

## 책임과 SSOT

코드 경로는 `tests/hwp5/` 기준입니다.

- `chart-collection-fields-evidence.mjs`: VtCollection·word·VtObject 필드 순서만 소유합니다. 기존 PostLine/Series의 Array 관측과 새 List 관측이 공유하며, 개수 의미를 판단하지 않습니다.
- `chart-list-prefix-evidence.mjs`: 확인된 List ID와 클래스·버전·Collection 접두부를 읽고 범위/위치 메타데이터를 반환합니다.
- `chart-window-evidence.mjs`: 선택한 Window 타입 위치부터 버전 2·Object 버전 1·원시 word를 읽습니다. 객체 ID를 소비하지 않습니다.
- `chart-tail-evidence.mjs`: List 접두부·raw26·Window 타입 구간을 조립합니다. raw26을 hex로 복사합니다.
- `chart-tail-errors.mjs`: 잘림의 정확한 Error 생성자와 오류명 판정을 공유합니다.

입력 Map/Set은 복사하며 Window에서 새로 읽은 타입이 이전 List 범위로 역전파되지 않습니다. 타입 ID와 객체 ID는 별도 이름 공간입니다. Map 안의 값까지 깊은 불변 복사라고 주장하지 않습니다.

## 실측·적대적 검증

584개 HWP의 52개 OLE 컨테이너에서 차트 Contents 43개를 조사했습니다. `chart-tail-survey.mjs --verify` 종료 코드 0: 모든 잘림 3,354건, null/중복 List ID 86건, 새 선언의 이름·버전 변형 172건, 각 타입 참조의 클래스 변형 215건, raw26·두 word 변형 43건을 검사했습니다. 정확한 끝·뒤쪽 바이트 무관성·원본 재파싱도 대조했습니다.

독립 fixture는 offset 0/1/17/257, 신규/기존/실파일형 혼합 타입, 희소·상위 비트 타입 ID와 객체 ID 0, 서로 다른 원시 바이트, word 0/1/2/65,535, 입력 범위 분리·결과 수명, 선언 길이 과다, 클래스·버전·ID 오류를 검사합니다. Window 부분만의 모든 잘림도 따로 확인합니다. 신규 3개를 포함한 조사 테스트 56개가 통과했습니다.

원시 구간 길이 변경·삭제, 두 word 강제 0, 두 기반 타입 소비 누락, List 중복 검사 삭제, List/Window 버전 검사 삭제, Window 타입/List 객체 범위 별칭, 호스트 오류 오인의 12종을 주입했습니다. 모두 구문 검사 후 실제 테스트 실패·종료 코드 1로 검출했으며 SyntaxError/ReferenceError는 검출로 세지 않았습니다. 로그는 `/tmp/hwpjs-chart-tail-mutants.2iumZ7`입니다.

공통 Collection 추출 전후 PostLine·Series 접두부의 전체 반환값(Map·위치 메타데이터 포함)이 43개 차트에서 일치했습니다. 기존 세 모드 WASM의 PostLine(성공 215/거부 9,718), Series 접두부(215/4,988), Footnote(301/21,199), Legend(258/11,211), Light(173/6,720), Picture(172/3,010), Backdrop(129/8,944), suffix(426/9,004), TextFormat(200/3,749), Axis(344/106,570), SeriesLabel/Point(182/11,304) 회귀 대조도 각각 종료 코드 0입니다.

이번 단계는 조사 코드·독립 oracle 변경입니다. 제품 파서·WASM ABI를 변경하거나 전체 audit를 재실행한 단계가 아니며, List·Window의 제품 지원 검증도 아닙니다.

```sh
node --test tests/hwp5/chart-*evidence.test.mjs
node tests/hwp5/chart-tail-survey.mjs --verify
```

실측은 `/tmp/hwpjs-chart-tail-survey.json`에 남겼습니다. 임시 로그는 재현에 필수인 저장소 입력이 아닙니다.

## 다음 범위

Collection 접두부 읽기를 Zig Array/List에서 공유하고, 확인된 타입 위치·원시 구간만 보존하는 코어를 연결해야 합니다. Window 앞의 ID 후보, raw26·계열 raw106의 필드 의미, 표본 밖 List 요소·버전, 전체 그래프의 의미 해석은 별도로 남아 있습니다. 스트림 끝까지 위치가 연결된 사실을 전체 필드 지원 완료로 해석하지 않습니다.

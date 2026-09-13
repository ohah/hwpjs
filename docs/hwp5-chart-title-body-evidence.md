# Title의 ChartText·ChartSection 구간 조사

## 관측 범위

[계열 반복 코어](hwp5-chart-series-collection.md)가 검증한 `VtChartTitle` v1 헤더 다음 구간을 읽기 전용으로 조사했습니다. 선택한 순서는 `VtChartText` v1 기반 타입 → inline TextBlock ID → 기존 TextBlock v2 본문 → `VtChartSection` v1 기반 본문입니다. ChartText·ChartSection 앞에 별도 객체 ID를 만들지 않습니다.

43개 차트 모두 ChartText는 이미 알려진 타입입니다. 그 뒤 TextBlock 본문 길이는 190/180/146바이트(각 1/1/41개)이고 ChartSection은 모두 164바이트입니다. 이 구간은 각 차트에서 객체 7개와 String 2개를 새로 도입합니다. 실제 Title text는 모두 non-null이며 TextBlock의 보조 Backdrop은 없습니다.

ChartSection은 기반 타입·raw26 다음에 Backdrop·Fill·빈 Picture를 포함합니다. Picture의 데이터 참조는 모두 null, Fill 뒤 원시 word는 모두 0입니다. raw26/50/34/4와 word에 API 속성 의미나 예약값 제약을 부여하지 않습니다. 실제 그림을 가진 Picture는 아직 지원하지 않습니다.

관측 구간 다음에는 모든 표본에서 78바이트가 남습니다. 앞서 이름이 보인 VtList·VtWindow의 필드·소유 관계는 미확정입니다. 이 결과를 전체 Title·Chart 해석 완료 또는 공식 API 속성 표의 직렬화 순서 증명으로 해석하지 않습니다.

## 책임과 SSOT

아래 경로는 `tests/hwp5/` 기준입니다.

- `chart-section-fields-evidence.mjs`: ChartSection의 선택된 필드 순서를 소유합니다. 기존 Footnote oracle과 새 Section 조사기가 같은 함수를 호출합니다. 빈 Picture는 기존 `chart-empty-picture-fields-evidence.mjs`를 재사용합니다.
- `chart-section-evidence.mjs`: Section의 범위·타입·전체 객체 ID 검증과 원시 바이트·위치 메타데이터를 소유합니다.
- `chart-title-body-evidence.mjs`: 검증된 Title 헤더 뒤에서 ChartText 타입과 TextBlock ID를 검사하고 공통 본문·Section 조사기를 조립합니다.
- `chart-title-body-errors.mjs`: 잘림의 정확한 오류명과 Error 생성자 검사를 공유합니다. 호스트 예외를 정상 거부로 세지 않습니다.

타입·객체·문자열 범위를 계승하며 입력 Map/Set은 복사합니다. 본문 범위의 스냅샷에 이후 Section의 객체·타입이 역으로 추가되지 않습니다. 원시 바이트는 hex로 복사하되 Map 안의 값까지 깊은 불변 복사라고 주장하지 않습니다.

Title 본문은 기존 nullable TextBlock 조사기를 사용합니다. 실제 표본의 non-null/보조 Backdrop 없음과, 합성 입력으로 검사한 null·빈 String·별칭·보조 Backdrop 변형을 구분합니다. nullable 참조를 null로 만드는 테스트는 그 inline 본문도 제거한 입력을 사용합니다. 기존 본문을 남긴 채 sentinel만 바꾸면 읽는 경로가 바뀌므로, 이를 단순한 필수 inline ID 오류로 기대하지 않습니다.

## 검증 결과

584개 HWP 중 52개 OLE 컨테이너에서 차트 Contents 43개를 확인했습니다. `chart-title-body-survey.mjs --verify` 종료 코드 0:

- 관측 구간의 모든 잘림 13,752건
- 선행 Title 객체와 충돌하는 ID 301건
- 각 타입 참조의 클래스 변형 817건
- non-null Picture 데이터 172건
- Section의 모든 raw와 word 변형 43건
- 정확한 끝·뒤쪽 바이트 무관성·원본 재파싱 대조

독립 fixture는 offset 0/1/17/257, 신규/기존 타입, 희소 타입 ID, 객체 ID 0, 새/기존 Font name, null/빈/새/이전 String/Font name 별칭 text, 보조 Backdrop 유무를 조합합니다. 모든 Title 잘림 외에 standalone Section의 모든 잘림도 별도로 검사합니다. 신규 3개를 포함한 관련 조사 테스트 53개가 통과했습니다.

길이 축소, raw50 삭제, 기반 타입 하나 누락, word 강제 0, Title/Section 중복 검사 삭제, 두 버전 검사 삭제, Section 타입/객체 범위 별칭, TextBlock ID 등록 누락, 호스트 오류 오인의 12종 결함을 주입했습니다. 모두 구문 검사 후 실제 테스트 실패·종료 코드 1로 검출했습니다. SyntaxError/ReferenceError는 검출로 세지 않았습니다. 로그는 `/tmp/hwpjs-title-body-mutants.GoAuU5`입니다.

공통 필드 순서 추출 전후 Footnote oracle의 전체 반환값(Map·위치 메타데이터 포함)이 실제 43개에서 일치했습니다. 기존 Debug·ReleaseSafe·ReleaseFast WASM과 각각 Footnote(성공 301/거부 21,199), Legend(258/11,211), Light(173/6,720), Picture(172/3,010), Backdrop(129/8,944), suffix(426/9,004), TextFormat(200/3,749), Axis(344/106,570), SeriesLabel/Point(182/11,304), Series 접두부(215/4,988)를 대조했고 모두 종료 코드 0입니다.

이는 기존 경로의 회귀 검증입니다. 이번 파트에서 제품 코드·WASM ABI는 변경하지 않았으며 전체 audit를 재실행하거나 Title 본문의 제품 실행을 검증했다고 주장하지 않습니다.

```sh
node --test tests/hwp5/chart-*evidence.test.mjs
node tests/hwp5/chart-title-body-survey.mjs --verify
```

실측은 `/tmp/hwpjs-chart-title-body-survey.json`에 남겼습니다. 임시 로그는 저장소의 필수 입력이 아닙니다.

## 다음 단계

기존 ChartSection/Backdrop 코어의 전체 객체 범위 검사와 필드 읽기를 공유하여 선택된 Title 구간을 Zig·WASM에 연결해야 합니다. 이어 남은 78바이트와 미해석 계열 raw106을 조사합니다. 자동 형식 선택·전체 Chart 모델·렌더링·편집·저장은 여전히 미완료입니다.

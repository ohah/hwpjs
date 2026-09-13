# Series 뒤쪽 TextBlock·TextFormat 조사

## 확인한 경계와 예외

[SeriesLabel·Point 코어](hwp5-chart-series-label.md) 다음에서 첫 Series의 inline TextBlock → raw u16 → TextFormat 두 개까지 조사했습니다. 43개 표본 모두 inline TextBlock은 112바이트이고 텍스트는 기존 String 참조였습니다. 중간 word는 모두 1이지만, 두 TextFormat의 개수라고 해석하지 않습니다. 조사 함수는 선택된 두 객체만 읽으며 뒤에 남는 바이트를 Series 끝으로 오인하지 않습니다.

TextFormat의 code는 42개 표본에서 두 개 모두 신규 String이었지만, 나머지 1개는 두 개 모두 null 표식이었습니다. 기존 Axis 조사·코어의 필수 code 경로를 적용한 최초 실행은 이 null에서 실패했습니다. 새 조사 경로만 명시적으로 nullable을 선택하며, 기존 필수 문자열 경로를 전체적으로 완화하지 않습니다.

신규 첫 code는 4바이트 `00000000`, 두 번째는 10바이트 `30250000300025000000`입니다. 빈 String이나 디코딩된 문자로 정규화하지 않고 원시 바이트로 보존합니다. 첫 TextFormat 길이는 신규 타입 여부와 code에 따라 35/37/54바이트, 두 번째는 18/43바이트였습니다. 두 raw word는 실제로 0이지만 예약값 의미는 확정하지 않습니다.

## 책임과 SSOT

- `chart-text-body-scope-evidence.mjs`: 기존 TextBlock 기반 관측기에 전체 선행 객체 범위 검사를 더합니다. 기존 Label 조사 진입점은 이 함수를 별칭으로 내보냅니다. 기존 오류 이름 `UnsupportedSeriesLabelObservationObject`도 호환성을 위해 유지합니다.
- `chart-text-format-fields-evidence.mjs`: TextFormat의 필드 순서만 소유합니다. 기존 ValueBlock 조사와 새 범위 조사기가 함께 사용합니다. 바이트 경계·타입·객체·nullable 정책은 호출자가 제공합니다.
- `chart-text-format-scope-evidence.mjs`: 전체 객체 범위와 타입/String 상태를 복사해 한 TextFormat을 읽습니다. null code는 opt-in이며 null/빈 신규 String/신규 값/별칭을 구별합니다.
- `chart-series-suffix-evidence.mjs`: inline TextBlock·raw word·선택된 두 TextFormat을 조립합니다. 본문과 첫 Format의 중간 Map/Set이 뒤쪽 파싱으로 변경되지 않도록 각 범위를 복사합니다. Map 안의 메타데이터까지 깊은 불변 복사라고 주장하지 않습니다.

제품 파서를 기대값 생성에 사용하지 않습니다. 기존 필드 순서를 복제하지 않고 조사 코드 내부에서 재사용하되, 제품 코드와의 독립성은 유지합니다.

## 실제 파일·적대적 검증

584개 HWP 조사 중 52개 OLE 컨테이너를 읽고 `/Contents` 차트 43개를 대상으로 했습니다. `chart-series-suffix-survey.mjs --verify` 결과는 모든 잘림 8,468건, null/중복 ID 258건, 신규/기존 타입·버전 오류 266건, raw word/본문 변형 129건입니다. 정확한 소비 끝, 뒤쪽 데이터 무관성, 원본 재파싱도 대조했습니다. 검사에는 정확한 Error 생성자와 기대 오류명을 사용합니다.

독립 fixture는 offset 0/1/17/257, 신규/기존 타입, null/별칭/신규/빈 code, 첫 Format이 도입한 String의 두 번째 참조, 전역 중복과 자기 참조, 누락된 사전 상태, 중간 범위 분리, 문자열 원시값 수명, 모든 잘림을 검사합니다. 새 3개를 포함한 관련 테스트 29개가 통과했습니다.

`/tmp/hwpjs-series-suffix-mutants.5JJ3yQ`에서 nullable 해제, 두 번째 객체 누락, raw word 삭제, 객체 Set 직접 변경, 타입 Map 직접 변경, 선행 String 사전 삭제, 중복 검사 삭제, 버전 검사 삭제, 새 String 전파 삭제, 공통 Format raw word 삭제의 10종을 만들었습니다. 전부 구문 검사 후 실제 테스트 실패·종료 코드 1로 검출했습니다. SyntaxError/ReferenceError를 검출로 세지 않았습니다.

공통 조사 코드 분리 후 기존 테스트 WASM의 Debug·ReleaseSafe·ReleaseFast를 각각 실행해 TextFormat 50개(성공 200/거부 3,749), Axis 172개(344/106,570), SeriesLabel·Point(182/11,304), Series 접두부(215/4,988)를 다시 대조했습니다. 모두 종료 코드 0입니다. 이는 기존 경로 회귀 검사이지 새 suffix 제품 WASM 지원 검증이 아닙니다. 제품 코드·ABI는 변경하지 않았으며 이번 파트에서 전체 audit를 재실행했다고 기록하지 않습니다.

```sh
node --test tests/hwp5/chart-series-suffix-evidence.test.mjs
node tests/hwp5/chart-series-suffix-survey.mjs --verify
```

실측 로그는 `/tmp/hwpjs-chart-series-suffix-survey.json`입니다. 임시 경로는 실행 증거 위치이며 저장소 필수 입력이 아닙니다.

## 다음 범위

기존 필수 TextFormat API를 보존한 nullable code 코어 연결과 새 실제 WASM 대조가 필요합니다. 그 뒤의 원시 꼬리, 계열 끝·반복·일반 배열 의미, 전체 Chart 조립·렌더링·저장은 미완료입니다. 공식 차트 API 속성 표만으로 이 바이트 순서나 의미를 확정하지 않습니다.

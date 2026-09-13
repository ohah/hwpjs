# Series 뒤쪽 빈 Picture 조사

## 확인한 구간

[nullable TextFormat 구간](hwp5-chart-nullable-format.md) 다음에서 raw40 → inline VtPicture v1 → raw4 → null 데이터 참조 → VtObject v1까지 조사했습니다. 실제 차트 43개 모두 총 60바이트이고 Picture 자체는 20바이트였습니다. Picture의 raw4는 1개에서 `01000000`, 나머지 42개에서 `01000100`입니다. raw40·raw4에 API 속성 의미를 부여하거나 예약값을 임의로 제한하지 않습니다.

데이터 참조는 모두 null이므로 선택된 **빈 Picture**만 조사합니다. non-null 참조는 명시적으로 거부하며 실제 이미지 데이터 해석을 구현한 것이 아닙니다. 선행 전체 객체 범위와의 중복·null 객체 ID를 거부하고, 정상 ID 0은 허용합니다. 입력 Map/Set은 복사하고 원시 바이트는 hex로 보존합니다.

`chart-empty-picture-fields-evidence.mjs`가 빈 Picture 필드 순서를 소유합니다. 기존 Axis/TextBlock 보조 Backdrop 조사와 새 `chart-series-picture-evidence.mjs`가 같은 함수를 사용합니다. 범위·타입 사전·바이트 경계·오류 이름은 호출자가 제공하므로 기존 Axis 오류 계약을 유지합니다. 제품 파서 코드로 기대값을 만들지는 않습니다.

## 폐기한 뒤쪽 기반 타입 가설

초안은 Picture 다음 raw4와 알려진 Object 타입처럼 보이는 DWORD를 더 읽었습니다. 그러나 표본 모두에서 Picture 끝 +4의 DWORD는 4이고, 같은 위치의 WORD도 4이며 +6의 float 해석은 1.0입니다. 즉 `raw4 + 타입 ID` 후보와 `raw4 + u16 + float` 후보를 이 표본만으로 구별할 수 없습니다. 후자의 필드 의미도 확인된 사실이 아닙니다.

따라서 초안의 추가 기반 타입 검사와 8바이트 소비를 제거했습니다. 현재 조사기는 Picture 끝까지만 읽고, 그 뒤가 전부 FF여도 같은 결과를 반환해야 합니다. 알려진 타입 ID와 숫자가 같다는 이유만으로 원시 필드를 타입 선언/참조로 승격하지 않습니다. 이 초안은 제품 코드에 반영하거나 커밋한 구현이 아닙니다.

## 실파일·적대적 검증

584개 HWP 중 52개 OLE 컨테이너에서 `/Contents` 차트 43개를 확인했습니다. `chart-series-picture-survey.mjs --verify`는 잘림 2,580건, null/중복 ID 86건, 기존 타입 버전 오류 86건, non-null 데이터 참조 172건, raw 변형 43건을 검사했습니다. 정확한 끝, 뒤쪽 데이터 무관성, 원본 재파싱도 대조했습니다. 예외는 정확한 Error 생성자와 기대 오류명으로 확인합니다.

독립 fixture는 offset 0/1/17/257, 신규/기존 타입, 희소 타입 ID, ID 0, 전체 객체 범위, 서로 다른 원시 바이트 패턴, 모든 잘림·클래스/버전/참조 오류, 입력 사전 분리와 결과 수명을 검사합니다. 신규 2개를 포함한 관련 조사 테스트 21개가 통과했습니다.

`/tmp/hwpjs-series-picture-mutants.hNuJtw`에서 raw40 길이 축소, raw 삭제, null 데이터 검사 삭제, Picture 기반 타입 소비 삭제, 버전 검사 삭제, 중복 검사 삭제, 입력 타입 Map/객체 Set 직접 변경, Picture 뒤 raw4/기반 타입 과소비의 9종을 만들었습니다. 모두 구문 검사 후 실제 테스트 실패·종료 코드 1로 검출했습니다. SyntaxError/ReferenceError를 검출로 세지 않았습니다.

공통 Picture 조사 코드 분리 후 기존 Debug·ReleaseSafe·ReleaseFast 테스트 WASM으로 suffix 86개(성공 426/거부 9,004), 필수 TextFormat 50개(200/3,749), Axis 172개(344/106,570), SeriesLabel·Point(182/11,304), Series 접두부(215/4,988)를 각각 대조했습니다. 세 모드 모두 종료 코드 0입니다. 이는 기존 경로 회귀이며 새 Picture 구간의 제품 WASM 지원 검증은 아닙니다. 제품 코드·ABI는 변경하지 않았고 이번 파트에서 전체 audit를 재실행했다고 기록하지 않습니다.

```sh
node --test tests/hwp5/chart-series-picture-evidence.test.mjs
node tests/hwp5/chart-series-picture-survey.mjs --verify
```

실측은 `/tmp/hwpjs-chart-series-picture-survey.json`에 남겼습니다. 각 행의 `next`는 소비하지 않은 뒤쪽 원문이며 위 가설 비교의 바이트 근거입니다. 임시 로그는 저장소의 필수 입력이 아닙니다.

## 다음 범위

기존 Backdrop의 빈 Picture 코어와 필드 읽기를 공유해 새 구간을 실제 WASM으로 대조해야 합니다. Picture 뒤의 불명확한 바이트·계열 끝·반복·일반 배열 규칙, 전체 Chart 조립·렌더링·저장은 미완료입니다. 공식 API 속성 표만으로 바이트 순서나 소유 관계를 확정하지 않습니다.

후속 구현·WASM 연결의 현재 범위는 [빈 Picture 공통 코어](hwp5-chart-picture.md)가 소유합니다. 위 조사 수치를 제품 실행 수치로 해석하지 않습니다.

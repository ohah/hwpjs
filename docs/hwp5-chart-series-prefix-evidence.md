# VtSeries v2 접두부 조사

## 근거와 범위

차트 revision 1.2 문서 3.49 SeriesCollection·3.50 Series의 공개 속성을 확인했습니다. 계열의 Pen/LegendText/DataPoints/SeriesLabel 등 API 속성은 설명하지만 이 목록 순서를 내부 raw 바이트 순서로 채택하지 않았습니다. CLineItem 뒤의 [raw·배열 코어](hwp5-chart-post-line.md)가 소비한 정확한 다음 위치에서 조사를 시작합니다.

초기 읽기 전용 진단에서는 알려진 Array/Collection/Object 참조 조합으로 후보 위치를 찾았습니다. 최종 `chart-series-prefix-evidence.mjs`는 검색 없이 Series 객체 ID → VtSeries v2 타입 → raw66 → 배열 객체 ID → VtArray v1 → 첫 u16 → VtCollection v1 → 둘째 u16 → VtObject v1을 순서대로 읽습니다. 새 선언과 기존 타입 참조를 모두 지원합니다. 두 객체 ID는 전체 선행 범위와 서로 중복될 수 없고, null은 거부하되 ID 0은 허용합니다.

타입 Map과 객체 Set을 복사해 이어 사용하고 raw는 hex 문자열로 반환합니다. 배열 두 값은 원값이며 일치·개수·용량 규칙을 적용하지 않습니다. Series 전체 본문이나 배열 원소를 소비하지 않으며 이 배열이 어느 API 속성에 대응하는지도 아직 확정하지 않습니다.

## 실제 파일 실측

584개 HWP corpus의 첫 Series 43개 모두 새 VtSeries v2 선언을 포함한 107바이트 접두부였습니다. 헤더 21바이트, raw66, 기존 타입 참조를 사용하는 배열 헤더 20바이트입니다. raw66은 두 종류였고 배열 값은 0/0이 41개, 1/1·4/4가 각각 1개였습니다. 표본 분포를 일반 유효값 범위로 제한하지 않습니다.

`--verify`는 모든 잘림 4,601건, 새 타입명/버전·기존 타입 버전 오류 215건, null·선행/동일 접두부 중복 ID 215건, raw 전체 0xff 및 두 값 65535/0 변형 86건을 통과했습니다. 정확한 소비 끝, 뒤쪽 바이트 변조 무관성도 대조했습니다. 오류는 정확한 Error 생성자와 기대 오류명으로 검사합니다. 결과는 `/tmp/hwpjs-chart-series-prefix-survey.json`에 남겼습니다.

```sh
node --test tests/hwp5/chart-series-prefix-evidence.test.mjs
node tests/hwp5/chart-series-prefix-survey.mjs --verify
```

기존 `zig-out/bin/hwpjs.wasm`은 조사 시 CFB 읽기에만 사용합니다. Series 제품 WASM 검증이 아닙니다.

## 적대적 검증

독립 fixture는 offset 0/1/17/257, 새/기존 타입과 희소 ID, Series v2와 기반 v1의 구별, 객체 ID 0, raw 보존·수명, 독립 배열 값 0/0·1/1·4/4·5/0·65535/65535, 모든 잘림, 각 클래스/버전 및 null/중복, 호출 위치 오류를 검사합니다. 신규 2개를 포함한 관련 조사 테스트는 16/16으로 통과했습니다.

`/tmp/hwpjs-series-prefix-mutants.JWvS8N`에서 offset 0 고정, raw 폭 65로 축소, raw 삭제, Series 기대 버전 1로 변경, 버전 검사 삭제, 둘째 값 덮기, 중복 검사 삭제, null 검사 삭제, 입력 타입 Map 별칭 반환, 입력 객체 Set 직접 변경의 10종을 만들었습니다. 모두 구문 검사 후 실제 테스트 실패·종료 코드 1로 검출했습니다. SyntaxError/ReferenceError를 검출로 세지 않았습니다.

제품 코드·기존 실행 경로는 변경하지 않았으므로 이번에는 세 모드 전체 audit를 다시 실행하지 않았습니다. 앞선 코어의 audit 결과와 이번 조사 결과를 구분합니다.

## 남은 범위

다음은 이 접두부의 코어·WASM 대조와 뒤쪽 배열/Series 본문 검증입니다. 두 1/1·4/4 표본에서는 접두부 끝의 다음 헤더가 VtSeriesPoint v1(26바이트)로 관측됐습니다. 본문이나 원소 수를 검증한 것은 아니며 41개 0/0 표본의 뒤쪽 경로와 구별해 조사해야 합니다. 첫 Series만 대상으로 했으므로 나머지 계열·배열 소유권·raw 의미·전체 Chart 조립·렌더링·저장은 미완료입니다.

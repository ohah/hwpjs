# Series 본문의 두 분기 조사

## 범위와 책임

[Series 접두부](hwp5-chart-series-prefix.md)의 정확한 소비 끝에서 두 관측 경로를 조사했습니다. `chart-series-branch-evidence.mjs`의 호출자가 `tail` 또는 `point`를 명시합니다. 배열 값을 일반적인 개수·분기 규칙으로 해석하거나, 실패하면 다른 경로를 재시도하지 않습니다.

- `tail`: raw66 → 필수 String(신규 정의/기존 별칭) → SeriesLabel 객체 ID·VtSeriesLabel v1 헤더.
- `point`: SeriesPoint 객체 ID·VtSeriesPoint v1 헤더 → SeriesLabel 객체 ID·VtSeriesLabel v1 헤더.

두 경로에서 읽는 것은 SeriesLabel 헤더까지입니다. Point의 전체 본문이나 원소 수, Label 본문, 두 Label의 상위 소유권이 같다는 사실을 증명한 것은 아닙니다. raw66과 String을 공개 API 속성명으로 단정하지 않습니다.

타입·객체 ID·String 사전을 이어 받아 Map/Set을 복사해 사용합니다. String은 원시 bytes의 hex·trailer·위치를 보존하고 새 객체/기존 참조를 구별합니다. null은 거부하며 빈 신규 String과 별칭은 별도로 유지합니다. 알려진 비-String 객체를 String으로 재등록하지 않고, SeriesLabel 및 SeriesPoint의 선행/서로 중복 ID도 거부합니다.

앞선 `postLineOracle`과 `seriesPrefixOracle`에는 이미 관측된 String 사전을 반환하는 필드만 추가했습니다. wire를 바꾸거나 앞선 파서를 다시 구현하지 않았습니다. 조사기는 타입명 검색·재동기화·다른 길이 재시도를 사용하지 않습니다.

## 실제 파일과 반례

584개 HWP corpus의 첫 Series 43개 중 0/0 표본 41개는 tail 경로로, 1/1·4/4 표본 2개는 point 경로로 SeriesLabel v1 헤더까지 도달했습니다. 이는 명시적으로 선택한 표본 경로이며 임의 배열 값에 적용할 제품 라우팅 규칙이 아닙니다.

`--verify`는 모든 잘림 5,316건, 새 타입명/버전·기존 타입 버전 오류 213건, null·현재 분기 내 중복 ID 129건을 통과했습니다. raw66 전체 변조 및 실제 신규 String을 선행 String 별칭으로 치환한 82건도 통과했습니다. 별칭은 4바이트만 소비하고 도입 여부·객체 수·소비 끝이 바뀌는 것을 대조했습니다. 정확한 끝, 이후 바이트 변조 무관성, 원본 재파싱도 확인하며 정확한 Error 생성자와 오류명을 검사합니다.

```sh
node --test tests/hwp5/chart-series-branch-evidence.test.mjs
node tests/hwp5/chart-series-branch-survey.mjs --verify
```

결과는 `/tmp/hwpjs-chart-series-branch-survey.json`에 기록했습니다. 기존 `zig-out/bin/hwpjs.wasm` 사용은 CFB 읽기용이며 새 분기 제품 WASM 검증이라는 뜻은 아닙니다.

## 적대적 검증·회귀

독립 fixture는 offset 0/1/17/257, 새/기존 타입, 두 경로, 신규/빈/별칭 String, 객체 ID 0, raw/trailer·사전 수명, 잘림·타입/ID 오류·잘못된 경로/호출 위치를 검사합니다. 관련 조사 테스트와 합쳐 18/18로 통과했습니다.

`/tmp/hwpjs-series-branch-mutants.ecrDmj`에서 raw 폭 65로 축소, raw 삭제, 버전 검사 삭제, 선행 String 사전 삭제, 입력 String Map 직접 변경, 입력 객체 Set 직접 변경, point를 tail로 강제 처리, 별칭 도입 여부 오류, 중복 검사 삭제, 빈 String을 null로 삭제의 10종을 만들었습니다. 모두 구문 검사 통과 후 실제 테스트 실패·종료 코드 1로 검출했습니다. SyntaxError/ReferenceError를 검출로 세지 않았습니다.

String 사전 반환 추가 후 기존 ReleaseSafe 테스트 WASM으로 Series 접두부 43개/정상 215건/오류 4,988건, post-line 43개/정상 215건/오류 9,718건을 다시 대조해 통과했습니다. 출력 변조·동일 메시지 trap도 검출했습니다. 제품 코드 변경이 없는 조사 파트이므로 세 모드 전체 audit를 이번에 재실행하지 않았습니다.

## 남은 범위

다음은 이 두 경로를 코어로 연결하고 SeriesLabel 본문을 검증하는 작업입니다. SeriesPoint 원소의 끝과 반복, SeriesLabel의 실제 소유 관계, 뒤쪽 계열·raw 의미·전체 Chart 조립·렌더링·저장은 미완료입니다. 0/0 표본만으로 나머지 두 경로를 완료했다고 판단하지 않습니다.

후속 [SeriesLabel 본문·Point 반복 조사](hwp5-chart-series-label-evidence.md)에서 공통 TextBlock 본문과 5개 Point의 끝·반복을 검증했습니다. 현재 확인 범위는 해당 문서가 소유하며 일반 소유 관계·전체 Series 완료를 뜻하지 않습니다.

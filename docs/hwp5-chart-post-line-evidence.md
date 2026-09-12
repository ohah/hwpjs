# CLineItem 이후 raw·배열 경계 조사

## 관측 범위

[CLineItem 코어](hwp5-chart-line-item.md) 뒤에서 발견한 후보를 독립 JS 조사기로 확인했습니다. `chart-post-line-evidence.mjs`는 호출자가 지정한 위치에서 raw194 → 알려진 VtObject v1 참조 → 배열 객체 ID → 알려진 VtArray v1 참조 → 첫 u16 → 알려진 VtCollection v1 참조 → 둘째 u16 → 알려진 VtObject v1 참조를 읽습니다. 새로운 타입 선언은 이 선택된 조사 경로에서 지원하지 않으며 미등록 타입을 명시적 오류로 거부합니다.

배열의 두 값은 독립적인 원값입니다. 일치 여부를 강제하거나 개수/용량 의미를 지정하지 않습니다. 배열 원소와 뒤쪽 Series 본문은 읽지 않으며, raw194가 어느 상위 개체의 필드인지도 확정하지 않습니다. raw의 의미·폭을 공개 API 속성 목록으로부터 추정하지 않았습니다.

이 모듈은 CLineItem이나 앞선 축을 다시 구현하지 않습니다. 기존 oracle의 소비 끝·타입 사전·전체 선행 객체 ID 집합을 받아 이어 읽습니다. 사전 Map/Set을 복사하며 raw는 hex 문자열로 반환합니다. null과 선행 ID 중복은 거부하고 객체 ID 0은 허용합니다. 타입명 검색·재동기화·다른 길이 재시도는 없습니다.

## 실제 파일과 반례

584개 HWP corpus의 차트 Contents 43개 모두 소비 길이 218바이트였습니다. 배열의 두 값은 3/3 또는 5/5였으며 raw194는 15종이었습니다. 이것은 표본 분포이며 일반 유효값 제약이 아닙니다.

`chart-post-line-survey.mjs --verify`로 모든 잘림 9,374건, 미등록/다른 클래스/다른 버전의 타입 사전 387건, null·선행 중복 ID 86건을 검사했습니다. raw 전체 0xff 변조와 불일치 배열 값 65535/0을 합쳐 86건 대조했고, 정확한 소비 끝·뒤쪽 데이터 변조 무관성·원본 재파싱도 확인했습니다. 의도된 실패는 정확한 Error 생성자와 오류명으로 판정합니다. 결과는 `/tmp/hwpjs-chart-post-line-survey.json`에 기록했습니다.

```sh
node --test tests/hwp5/chart-post-line-evidence.test.mjs
node tests/hwp5/chart-post-line-survey.mjs --verify
```

조사 명령의 기존 `zig-out/bin/hwpjs.wasm` 사용은 CFB 읽기 용도입니다. 이 raw/배열 구간의 제품 WASM 파서 검증은 아직 아닙니다.

## 적대적 검증

신규 단위 테스트 2개는 offset 0/1/17/257, 희소 타입 ID, 독립 배열 값 0/0·3/3·5/5·5/0·65535/65535, 객체 ID 0, raw·사전 수명, 모든 잘림, 타입/ID 오류와 잘못된 호출 위치를 검사합니다. 관련 CLineItem/Axis/Surface/ValueText 조사 테스트와 합쳐 14/14로 통과했습니다.

`/tmp/hwpjs-post-line-mutants.WZRcXr`에서 시작 위치 0 고정, raw 폭 193으로 축소, raw 0 삭제, 버전 검사 삭제, 중복 검사 삭제, null 검사 삭제, 둘째 값을 첫째 값으로 덮기, 입력 타입 Map 별칭 반환, 입력 객체 Set 직접 변경의 9종을 만들었습니다. 모두 구문 검사 통과 후 실제 테스트 실패·종료 코드 1로 검출했습니다. SyntaxError/ReferenceError를 검출로 세지 않았습니다.

제품 코드와 기존 테스트 경로는 변경하지 않은 읽기 전용 조사 파트입니다. 세 모드 전체 제품 audit를 이번에 재실행한 것으로 기록하지 않습니다.

## 다음 작업과 미완료 범위

다음은 이 raw/기반 타입 구간의 코어 및 공통 배열 헤더 조립을 구현하고 실제 WASM으로 대조하는 작업입니다. 제품 구현에서는 공통 타입 사전 규칙을 사용하고 새 선언 경로도 별도로 검증해야 합니다. Series 원소·배열 소유권·raw 의미·전체 Chart 조립과 렌더링·저장은 미완료입니다.

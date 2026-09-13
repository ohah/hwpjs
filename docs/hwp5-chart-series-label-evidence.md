# SeriesLabel 본문·SeriesPoint 반복 조사

## 공통 본문 재사용

[Series 두 분기](hwp5-chart-series-branch-evidence.md)의 SeriesLabel 헤더 다음은 기존 TextBlock v2 기반 본문으로 읽힙니다. `chart-series-label-evidence.mjs`는 `observeTextBlockBase`를 재사용하며 원시 필드·Font·String·보조 Backdrop 읽기를 재구현하지 않습니다. 추가 역할은 전체 선행 객체 ID 집합과 새 본문 객체 ID의 중복 검사, 새 타입/도입된 String의 상태 전파입니다.

객체 사전은 Point/Label 등 앞선 비-String ID도 포함합니다. 기존 TextBlock 조사기의 로컬 문자열 범위 검사를 전체 그래프 검사로 오인하지 않습니다. 래퍼가 추가 객체 ID를 확인하고 Map/Set을 복사해 이어 사용합니다. null 텍스트, 빈 신규 String, 신규/기존 참조는 공통 본문 계약을 유지합니다.

후속 suffix 조사에서 이 범위 처리 구현을 `chart-text-body-scope-evidence.mjs`로 분리했습니다. 기존 Label 함수는 호환 별칭이며 검사·오류명은 유지합니다. 분리 근거는 [suffix 조사](hwp5-chart-series-suffix-evidence.md)가 소유합니다.

## Point와 계열 Label 조립

`chart-series-point-evidence.mjs`는 기존 point 분기 헤더 → 공통 Label 본문 → raw20 → 알려진 VtObject v1 참조를 한 Point 후보로 읽습니다. 마지막 기반 타입의 새 선언은 이 선택된 조사 경로에서 지원하지 않습니다. raw20은 의미를 부여하지 않고 보존합니다.

`chart-series-label-context.mjs`는 표본의 배열 값 0/0·1/1·4/4를 명시적으로 선택해 해당 수의 Point를 읽고, tail 분기와 일반 계열 Label 본문으로 이어 갑니다. 이는 관측된 반복 가설을 실파일에서 검증하는 조사 조립이며 임의 배열 값에 적용할 제품 규칙은 아닙니다. 두 배열 값의 일반적인 개수/용량 의미와 Label의 상위 소유 관계를 확정하지 않습니다.

## 실제 파일 결과

43개 차트의 첫 Series에서 Point 5개(4개+1개)와 일반 계열 Label 43개를 읽었습니다. 총 Label 본문 48개는 모두 108바이트였으며 Point Label 5개는 text null, 일반 계열 Label은 앞선 String 참조였습니다. Point를 건너뛰지 않고 4개·1개 반복 후 실제 tail String과 일반 Label까지 연결했습니다.

`chart-series-label-survey.mjs --verify`는 Point 모든 잘림 812건, Label 모든 잘림 5,184건, Label Font ID의 전체 선행 범위 중복 48건, raw 변형 53건, 타입/버전 오류 149건을 통과했습니다. 각 소비 끝과 뒤쪽 바이트 무관성, 원본 재파싱도 대조했습니다. 의도한 오류는 정확한 Error 생성자·오류명으로 검사합니다. 결과는 `/tmp/hwpjs-chart-series-label-survey.json`입니다.

최초 재파싱 비교는 oracle의 새 요청 생성 함수까지 동일 객체인지 비교해 실패했습니다. 해당 함수만 제외하는 명시적 비교 뷰로 고쳤고 Map/Set·raw·ID·타입·String·소비 위치는 모두 유지해 비교했습니다. JSON 변환으로 사전을 제거하지 않았습니다.

```sh
node --test tests/hwp5/chart-series-label-evidence.test.mjs
node tests/hwp5/chart-series-label-survey.mjs --verify
```

기존 `zig-out/bin/hwpjs.wasm`은 CFB 읽기용이며 새 Label/Point 제품 WASM 검증이 아닙니다.

## 적대적 검증

독립 fixture는 offset 0/1/17/257, null/별칭/신규/빈 텍스트, 새 Font명, 본문 타입 신규 선언, 전역 객체 충돌, 타입 전파·String 전파, raw 수명, 모든 잘림과 마지막 기반 타입 불일치를 검사합니다. 신규 3개를 포함한 관련 조사 테스트 21/21이 통과했습니다.

`/tmp/hwpjs-series-label-mutants.wg0E0V`에서 전역 중복 검사 삭제, 새 타입 전파 삭제, String 전파 삭제, 입력 객체 Set 직접 변경, 입력 String Map 직접 변경, Point raw 삭제, 소비 끝 1바이트 축소, 마지막 기반 타입 버전 검사 삭제의 8종을 만들었습니다. 모두 구문 검사 후 실제 테스트 실패·종료 코드 1로 검출했습니다. SyntaxError/ReferenceError를 검출로 세지 않았습니다.

제품 코드와 기존 실행 경로는 변경하지 않았습니다. 이번 조사에서 세 모드 전체 제품 audit를 재실행했다고 기록하지 않습니다.

## 남은 범위

다음은 이미 검증한 분기·공통 Label 본문·Point 꼬리를 코어에 연결하고 실제 WASM으로 대조하는 작업입니다. 일반 계열 Label 다음에도 별도 inline TextBlock으로 보이는 데이터가 남습니다. 이후 계열의 끝·다른 계열 반복·일반 배열 규칙·raw 의미·Chart 조립·렌더링·저장은 미완료입니다.

후속 코어 연결과 WASM 검증 범위는 [SeriesLabel·SeriesPoint 코어](hwp5-chart-series-label.md)가 소유합니다. 위 조사 수치를 제품 실행 수치로 해석하지 않습니다.

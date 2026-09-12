# Surface 이후 nullable 제목 축 조사

## 실패 원인과 선택 경로

[Surface 접두부 조사](hwp5-chart-surface-evidence.md) 이후 기존 Axis 관측기가 실패한 FFFFFFFF는 글꼴명이 아닌 제목 텍스트 자리였습니다. 읽기 전용 진단으로 String 읽기 단계, 직전 VtObject 기반 타입, 상대 위치 +172를 43개 모두 확인했습니다. 제목 앞 24바이트 raw의 바로 다음 위치이며 문자열 검색으로 찾지 않았습니다.

기존 필수 제목 경로를 바꾸지 않고 `observeAxisPrefixNullableTitle`과 `observeAxisNullableTitle`을 추가했습니다. 기존 private 읽기 경로를 공유하되 제목 null 허용만 명시적으로 선택합니다. 글꼴명은 여전히 필수 String이며 null은 빈 String·새 String·기존 String 참조와 구별합니다. 제품 Zig TextBlock/Axis 파서는 아직 변경하지 않았습니다.

## 실제 결과

`chart-axis-null-title-survey.mjs`는 기존 네 축·Surface 후보 구간 다음부터 새 경로로 관찰합니다. 실제 43개 모두 제목 null, 배율 없음, 길이 276바이트였습니다. 기존 필수 제목 경로는 여전히 같은 입력을 UnsupportedAxisObservationObject로 거부합니다. 이후에는 원시 2바이트와 VtCLineItem으로 보이는 새 선언이 관측되지만, 이 조사에서는 해당 본문을 소비하지 않습니다.

모든 잘림 11,868건·사용된 타입의 버전 변형 258건을 정확한 일반 Error 및 기대 오류명으로 검사했습니다. 정확한 끝에서 자르기·이후 FF 변경·원본 재관측도 일치했습니다. null을 제목 글꼴명 String 재참조로 바꾼 43건과 새 빈 String으로 바꾼 43건은 텍스트 종류·도입 여부·끝 위치를 구분해 검증했습니다. 로그는 `/tmp/hwpjs-chart-axis-null-title-survey.json`입니다.

## 합성 및 적대적 검증

새 테스트 두 개는 offset 0/1/17/257, null/빈/신규/기존 제목 String, 필수 제목 경로와의 호환, 필수 글꼴명 유지, 타입 버전, 모든 잘림, 사전 보존 및 바이트 복사 수명을 확인합니다. 기존 접두부 테스트 네 개도 함께 통과했습니다.

`/tmp/hwpjs-axis-null-title-mutants.HADQCE`에서 nullable 경로 비활성화, 기존 필수 경로의 무조건 null 허용, 빈 String을 null로 합침, raw26을 25로 변경, 이전 String 사전 전달 누락, 제목 신규 String 등록 누락의 6종은 구문 검사 후 실제 테스트 실패(종료 코드 1)로 검출했습니다.

```sh
node --test tests/hwp5/chart-axis-null-title.test.mjs tests/hwp5/chart-axis-prefix-evidence.test.mjs
node tests/hwp5/chart-axis-null-title-survey.mjs --verify
```

정규 Debug·ReleaseSafe·ReleaseFast audit는 각 종료 코드 0, 27/27 steps, 1,048/1,048 native tests, 8,420,698 HWP/WASM checks로 통과했습니다. 로그는 `/tmp/hwpjs-axis-null-title-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 새 nullable 조사 테스트의 개수를 이 기존 정규 WASM 검사 수에 더해 계산하지 않습니다.

최종 기본 테스트도 1,048/1,048 tests, 5/5 steps로 통과했고 ReleaseSafe 제품 빌드는 5/5 steps로 통과했습니다. 변경 JS 문법·문서 링크·diff 공백 검사도 통과했습니다.

이 단계는 조사이며 제품의 nullable 제목 지원 완료를 의미하지 않습니다. 다음 제품 구현에서는 기존 필수 제목 계약을 유지하며 nullable 반환 타입·합계 제한·실패 경로를 검증해야 합니다.

## 다음 CLineItem 배치 후보

전체 회귀 대기 중 추가 읽기 전용 진단에서 nullable 축 끝의 raw u16 다음에 CLineItem 두 개를 순서대로 확인했습니다. 각 후보는 객체 ID·VtCLineItem v1·raw52·VtObject v1이며 선택된 43개에서 총 86개가 이 배치에 맞았습니다. 앞선 raw u16은 43개 모두 1, raw52는 두 종류였습니다. 타입 사전으로 새 선언/기존 참조를 구분한 결과이며 문자열 검색으로 위치를 선택하지 않았습니다.

이 결과는 다음 파트의 가설입니다. u16 값 1을 개수 2로 해석하는 규칙을 만들거나, 일반 파일에 CLineItem 두 개만 있다고 가정하지 않습니다. raw52의 의미, 소유권, 이후 데이터와의 연결 및 잘림/변형 검증은 아직 남아 있습니다.

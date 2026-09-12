# Axis v3 조립

## 책임 분리

- `chart/axis.zig`: 하나의 Axis v3, 원시 82바이트, 제목 TextBlock, 배율 선택 배열, 선택 AxisScaleBlock, 꼬리를 조립합니다. 축 개수를 4개로 제한하는 반복문은 포함하지 않습니다.
- `chart/axis_scale.zig`: AxisScaleBlock v1의 객체 등록, 5/0 배열 헤더, 다섯 null 슬롯과 ValueBlock을 읽습니다. 두 배열 word의 의미를 일반적인 용량/개수로 확정하지 않습니다.
- `chart/axis_tail.zig`: 원시 36바이트, 선택 24바이트, 원시 14바이트와 VtObject v1 기반 타입을 읽습니다. 다른 길이 후보로 재시도하지 않습니다.

배치 근거는 [연속 Axis 조사](hwp5-chart-axis-evidence.md)입니다. 원시 82바이트의 +6 u16이 0/1일 때만 선택된 꼬리를 읽으며 다른 값은 UnsupportedChartAxisTailLayout입니다. API의 배율 enum과 동일시하지 않습니다. 바깥 배열 0/0은 배율 없음, 1/1은 선택된 단일 배율 블록이며 다른 조합은 UnsupportedChartAxisScaleLayout입니다.

제목·배율 값·문자열·타입·배열은 기존 공통 파서를 사용합니다. 축 전체 문자열 합계는 제목 글꼴명/텍스트 두 필드와 ValueBlock의 다섯 필드를 계산하며 별칭도 필드마다 차감합니다. 사전 고유 저장량과는 별개입니다. 원시 데이터는 복사하고 String은 호출자가 유지하는 입력을 빌립니다. 실패 시 Reader 위치는 유지하지만 타입/객체 사전은 폐기해야 합니다.

## 검증 진행

독립 테스트 입력은 `axis_test_fixture.zig`, 검증은 `axis_tests.zig`에 분리했습니다. 배율 유무와 짧은/긴 꼬리의 네 조합, offset 0/1/17/257, 정확한 소비 끝, 제목 String 별칭, NaN 원시 비트를 가진 배율 값, 정확한 객체/고유 저장량/필드 합계 제한을 검사합니다. 모든 잘림·외부 타입 클래스/버전·미지원 선택 값·바깥 배열 2/2·배열 word 변형·다섯 null 슬롯 각각의 변형·합계 한도 부족, 전체 OOM 주입 및 정상/후기 오류의 safety=true 할당자 해제 회계를 추가했습니다.

꼬리 파서 직접 호출에서도 모든 잘림의 Reader 위치 보존과 입력 변경 후 원시 필드 복사 수명을 검사했습니다. AxisScale 단독 호출은 이전 타입 선언만 주입하고 모든 잘림 및 정상/후기 OOM 경로에서 위치 보존을 검사했습니다. 상위 Axis의 Reader 롤백으로 하위 함수 오류가 가려지지 않도록 분리한 테스트입니다. Debug·ReleaseSafe·ReleaseFast 각각 새 테스트 네 개와 루트 테스트가 5/5으로 통과했습니다.

`/tmp/hwpjs-axis-mutants.hXz2cv`에서 제목 예산 차감 누락, 바깥/안쪽 배열 배치 검사 누락 각각, null 슬롯 값 검사 누락, 긴 꼬리 누락, 꼬리의 Reader 조기 반영, 꼬리 원시 값 삭제, Axis ID 등록 누락, 사전 해제 누락, AxisScale의 Reader 조기 반영 등 10종을 만들었습니다. 세 모드 모두 런타임 FAIL과 종료 코드 1로 검출했습니다(30회). 컴파일 오류는 검출로 세지 않았습니다. 마지막 변형은 AxisScale 직접 호출 테스트로 검출했습니다.

## 연속 축 WASM 검사 구조

테스트 전용 mode 323은 기존 그리드·Backdrop·Footnote·Legend·Plot 접두부·Light를 읽은 동일 객체 사전으로 요청한 수의 축을 읽습니다. 요청 개수 32 제한은 테스트 bridge의 자원 한도이며 제품 Axis의 고정 축 개수 규칙이 아닙니다. corpus에서는 0~4개를 각각 요청합니다. 기존 chart-legend-prefix의 숫자 셀은 Other 대신 Number로 등록하도록 바꿨으며, mode 323에서 ID만으로 다시 조회한 숫자 비트와 trailer를 독립 그리드 값과 대조합니다.

`chart-axes-oracle.mjs`는 독립 접두부·Axis 관측기를 사용해 이전 비문자열 ID까지 순차 등록하고, 각 축의 신규 ID 충돌과 String 고유 저장량·필드별 합계를 계산합니다. Title과 ValueBlock 응답은 기존 테스트 직렬화/독립 기대 응답 함수를 각각 공유합니다. 원시 필드, 제목, 선택 배율, 꼬리, 각 소비 끝과 객체/타입 개수·저장량을 대조합니다. 원시 82바이트의 선택 값은 유지하면서 다른 원시 값들을 FF로 바꾸는 변형도 포함합니다.

숫자 사전 재조회와 원시 필드 변형을 포함한 Debug·ReleaseSafe·ReleaseFast WASM 검사에서 차트 43개·축 172개·배율 있음 69개·긴 꼬리 6개, 각 모드 정상/변형 344건·거부 106,570건이 통과했습니다. 전체 축 구간의 모든 잘림, 각 축의 미지원 선택 값 및 이전 축 ID와 제목 ID 충돌, 개별/합계 String·객체·저장량·입력 크기 제한, 정확한 끝과 뒤 데이터 변경을 검사합니다. 오류는 정확한 일반 Error와 예상 오류명으로 검증하고 매 오류 후 원본도 다시 대조합니다. 응답 첫 바이트 변조, 숫자 사전 재조회 결과의 첫 숫자 비트만 변조, 정상 오류의 동일 메시지 WebAssembly.RuntimeError 치환은 세 모드 모두 AssertionError로 검출했습니다. 기존 ValueBlock도 각 모드 정상/변형 276건·거부 25,326건으로 통과했습니다.

정규 Debug·ReleaseSafe·ReleaseFast audit는 각 종료 코드 0, 27/27 steps, 1,048/1,048 native tests, 8,420,698 HWP/WASM checks로 통과했습니다. 로그는 `/tmp/hwpjs-axes-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

최종 기본 테스트도 1,048/1,048 tests, 5/5 steps로 통과했고 ReleaseSafe 제품 빌드는 5/5 steps로 통과했습니다. 변경 Zig 포맷·JS 문법·문서 링크·diff 공백 검사도 통과했습니다.

이 결과는 선택된 Axis v3 배치의 조립·범위 검증입니다. 전체 Axis 필드 의미나 Plot 이후 데이터·전체 차트 지원 완료를 뜻하지 않습니다.

## 다음 미해석 구간의 경계 후보

전체 회귀 대기 중 읽기 전용 추가 점검에서 마지막 Axis 끝 +30 위치를 후속 객체 시작 후보로 조사했습니다. 선택된 43개 모두 후보의 u32 뒤 타입이 VtSurfaceDesc v1이었으며 타입 ID는 21/22/24/25로 달랐습니다. 후보 객체 ID 범위는 58~105였습니다. `axesOracle(contents).end`와 마지막 결과의 타입 사전을 사용해 알려진 타입 참조 또는 새 선언을 구분한 결과입니다. 중간 타입 문자열 검색으로 위치를 고르지 않았습니다.

앞선 30바이트에도 표본 간 값 차이가 있으므로 상수 문자열로 검사하지 않습니다. 이 결과는 다음 파트의 배치 가설이며 30바이트의 필드 의미·SurfaceDesc 본문·전체 Plot 끝을 검증한 것이 아닙니다. 제품 Axis 파서는 이 구간을 소비하지 않습니다.

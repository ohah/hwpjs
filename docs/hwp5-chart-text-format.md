# TextFormat v1 구현과 검증

## 책임과 범위

`chart/text_format.zig`는 선택된 구형 Contents의 inline TextFormat v1을 읽습니다. 순서는 객체 ID, VtTextFormat v1, VtObject v1, 원시 u16, 코드 String입니다. 기반 타입이 자체 필드보다 먼저 나타나는 배치를 그대로 검사합니다. 근거는 [값 블록 조사](hwp5-chart-value-prefix-evidence.md)이며, API 속성 표를 바이너리 필드 배치로 간주하지 않습니다.

객체 ID는 공통 객체 사전에 Other로 등록하고 코드 String은 공통 String resolver가 정의/재참조·바이트 예산을 처리합니다. 원시 u16은 의미를 추정하지 않고 복사합니다. 코드 바이트는 입력을 빌립니다. 실패 시 Reader 위치는 유지되지만 타입/객체 사전은 호출자가 폐기해야 합니다. 전체 객체 사전의 트랜잭션을 제공하지 않습니다. null/서식 객체 자체의 재참조와 ValueBlock 조립은 이 함수의 범위 밖입니다.

`code_start`와 `code_end`는 코드 String이 원본에서 차지한 반개방 구간입니다. alias는 object ID 4바이트이고 inline 정의는 ID부터 마지막 기반 type 참조까지입니다. 객체 resolver의 `Reference.start/end`를 그대로 전달하며 별도 바이트 검색이나 값 기반 위치 추정을 하지 않습니다.

위 계약은 기존 필수 code API의 계약입니다. 후속 [nullable code 코어](hwp5-chart-nullable-format.md)는 별도 진입점으로 null code를 지원하며, 필수 API와 서식 객체 자체의 null 거부는 유지합니다.

## 현재 확인한 결과

새 네이티브 테스트 두 개와 루트 테스트가 Debug·ReleaseSafe·ReleaseFast 각각 3/3으로 통과했습니다. offset 0/1/17/257, 희소 타입 ID, 비-UTF8 원시 코드, 비영 원시 u16, 코드 재참조의 추가 저장량 0, 정확한 소비 끝, 모든 잘림, 네 타입의 클래스/버전 변형, 객체/문자열 한도, 자기 ID와 코드 ID 충돌을 검사했습니다. 전체 할당 실패 주입과 정상/후기 오류 경로의 safety=true 할당자 해제 회계도 확인했습니다.

`node tests/hwp5/chart-axis-survey.mjs` 재실행 결과 43개 차트의 서식 50개는 모두 코드 String 신규 정의였고, 원시 u16은 모두 0이었습니다. 한 차트 내 서식 ID끼리 중복은 없었습니다. 이는 전체 객체 그래프 ID 무충돌 증명이 아니며 제품 파서의 실제 WASM 대조 결과도 아닙니다. 비영 u16·String 재참조는 합성 테스트로 별도 검사합니다.

고의 오류 검증은 `/tmp/hwpjs-text-format-mutants.m88HvD`의 별도 소스 복사본에서 기반 타입 소비 생략, 원시 u16 삭제, 문자열 파싱 전에 Reader 반영, 서식 객체 등록 생략의 네 종류를 만들었습니다. Debug·ReleaseSafe·ReleaseFast 모두 런타임 FAIL 및 종료 코드 1로 검출했습니다(12회). 컴파일 실패는 검출로 세지 않았습니다.

span 추가 후에는 Reference 시작+1·끝-1, null 끝-1·시작+1, 최종 반환 끝을 시작으로 변경한 다섯 변이를 세 모드에서 검증했습니다. 고정 9,876바이트 Contents는 format code가 null인 배치라 null/반환 변이 9개만 검출하고 Reference 변이 6개가 생존했습니다. 이를 숨기지 않고 합성 nullable-format fixture가 포함된 제품 루트 테스트로 생존 변이를 다시 실행했으며 6개 모두 컴파일 성공 후 assertion 실패로 검출했습니다. 최종 유효 결과는 15/15이고, 좁은 실제 표본 하나만으로 non-null 경계를 검증했다고 주장하지 않습니다.

## 실제 WASM 대조

테스트 전용 mode 321은 이전 타입 선언과 선택적 코드 String seed를 받은 뒤 독립된 서식 구간을 제품 함수로 읽습니다. 전체 차트의 비문자열 ID 그래프를 주입하거나 검사하는 공개 ABI가 아닙니다. `chart-text-format-oracle.mjs`가 독립 Axis 관측값에서 구간과 기대 응답을 만들고 `chart-text-formats.mjs`가 corpus·변형 검사를 소유합니다. 타입 선언은 서식 시작 이전 것만 seed에 넣어 서식 자체의 새 선언을 건너뛰지 않습니다.

Debug·ReleaseSafe·ReleaseFast 각각 실제 43개 차트의 서식 50개를 대조했습니다. 각 모드 정상/변형 200건과 거부 3,749건이 통과했습니다. 원본, 끝 이후 FF 데이터, 원시 u16 비영 값, 코드 String ID만의 재참조를 대조하고 모든 구간 잘림·객체/개별 및 저장 문자열/입력 제한·자기 ID 충돌·새 타입 버전을 검사했습니다. 각 거부 후 원본도 재검사합니다. 예상 오류는 정확한 일반 Error 종류와 오류명으로 검사합니다.

세 모드 모두 응답 첫 바이트 변조와 예상 오류의 동일 메시지 WebAssembly.RuntimeError 치환이 AssertionError로 검출됐습니다. 실제 파싱 성공·실패를 제품 serializer에서 만든 기대값으로 자체 검증하지 않습니다. 이 검사는 정규 audit에도 연결했습니다.

정규 Debug·ReleaseSafe·ReleaseFast audit는 각 종료 코드 0, 27/27 steps, 1,042/1,042 native tests, 8,156,286 HWP/WASM checks로 통과했습니다. 로그는 `/tmp/hwpjs-text-format-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

최종 기본 테스트도 1,042/1,042 tests, 5/5 steps로 통과했고 ReleaseSafe 제품 빌드는 5/5 steps로 통과했습니다. 변경 Zig 포맷·JS 문법·문서 링크와 diff 공백 검사도 통과했습니다.

이 검증은 선택된 TextFormat v1 범위의 결과이며 전체 차트 구현 완료를 뜻하지 않습니다. 다음 작업은 ValueBlock 및 Axis 조립입니다.

현재 span 추가 상태에서는 필수 TextFormat probe, ValueBlock, Series suffix, 전체 Series collection wire와 각 독립 JS oracle이 `code_start/code_end`를 함께 대조합니다. SHA-256 고정 9,876바이트 Contents에서는 axis ValueBlock format과 모든 series nullable format의 ID 또는 null sentinel을 원본 span에 직접 확인합니다.

현재 정규 audit는 Debug·ReleaseSafe·ReleaseFast 모두 32/32 단계, native 1,102/1,102개, Contents 16/16개, HWP/WASM 8,905,815회, imports 0으로 통과했습니다. 전체 기본 Zig 테스트는 1,086/1,086개입니다. 위의 과거 단계별 수치는 당시 범위의 기록이고 이 문단이 span 추가 후 통합 수치입니다.

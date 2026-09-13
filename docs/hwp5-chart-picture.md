# 빈 Picture 공통 코어와 Series 연결

## 책임과 계약

[실파일 조사](hwp5-chart-series-picture-evidence.md)에서 확인한 빈 Picture를 `chart/picture.zig`로 분리했습니다. `readEmptyBodyObservedV1`은 VtPicture v1 → raw4 → null 데이터 참조 → VtObject v1을 읽습니다. 호출자가 이미 inline ID를 읽고 검사한 상태에서 사용합니다. `readEmptyObservedV1`은 ID를 읽고 전체 객체 사전에 등록한 뒤 같은 본문 함수를 호출합니다.

기존 `backdrop.zig`는 세 번째 객체 ID를 읽고 앞선 두 ID와 중복인지 검사한 다음 공통 Picture 본문을 호출합니다. 중복 검사를 본문 뒤로 미루지 않으므로 잘린 중복 객체에서도 기존 오류 우선순위를 유지합니다. 기존 Backdrop의 `raw_picture` 반환 필드는 그대로입니다.

`series_picture.zig`는 선택된 raw40과 inline 빈 Picture를 조립합니다. 원시 값은 복사하며 예약 비트나 API 속성 의미를 추정하지 않습니다. 입력 객체 ID 0은 허용하고 null/중복 객체 ID를 거부합니다. non-null 데이터 참조는 `UnsupportedChartPictureData`로 거부하며 비어 있지 않은 이미지 해석을 구현한 것은 아닙니다.

모든 진입점은 실패 시 자신의 Reader를 보존합니다. 타입·객체 테이블은 변경될 수 있으므로 호출자가 폐기해야 합니다. Picture 뒤의 불명확한 바이트는 읽지 않으며, 이 함수의 끝을 Series 끝으로 간주하지 않습니다. 추가 할당은 공통 타입·객체 테이블이 소유합니다.

## 네이티브·호환성 검증

별도 fixture로 신규/기존 타입, offset 0/1/17/257, Body 단독·Picture 단독·Series 조립, raw 복사, ID 0, 정확한 소비 끝, 객체 한도와 문자열 저장량 0을 검사했습니다. 모든 잘림·클래스/버전·null/중복 ID·non-null 데이터 참조를 검사하며 정상·실패 경로 OOM과 safety=true 할당 회계도 확인합니다.

각 단독 진입점의 실패 위치와 후기 OOM은 별도 테스트로 검증합니다. Backdrop은 Picture ID를 첫째/둘째 ID와 같게 만든 뒤 바로 자른 입력과 완전한 입력 모두에서 기존 `UnsupportedChartObjectReference`가 나오는지 추가로 확인했습니다.

새 Picture 테스트 3개와 루트 테스트는 세 모드 각각 4/4로 통과했습니다. 기존 Backdrop 테스트도 통과했습니다.

## 실제 WASM과 SSOT

기존 mode 329의 조립·wire 생성은 `chart-series-suffix-prefix.zig`가 소유합니다. 기존 호출은 wire를 반환하고 상태를 해제하며, 새 mode 330은 동일한 상태를 이어 사용하고 wire와 상태를 모두 해제합니다. 접두부를 중복 스캔하거나 전역 객체/타입 ID를 임의로 다시 만들지 않습니다. 중간 wire 생성은 테스트 전용 비용이며 제품 공개 API에 추가하지 않았습니다.

mode 330은 새 Series Picture 코어를 호출하고 Picture ID·본문 끝·객체 끝·구간 끝·타입/객체 수·raw40/raw4를 반환합니다. 독립 `chart-series-picture-oracle.mjs`의 기대 바이트와 비교하며 제품 serializer로 기대값을 생성하지 않습니다.

Debug·ReleaseSafe·ReleaseFast 단독 실행에서 각각 실제 차트 43개, 정상/변형 172건, 의도한 오류 3,010건을 확인했습니다. 정확한 끝, 뒤쪽 FF 무관성, 모든 잘림, raw 변형, ID/데이터 참조/클래스/한도 오류와 각 오류 후 원본 복구를 대조합니다. 일반 Error의 생성자와 정확한 오류명을 요구합니다.

같은 실행에서 기존 Backdrop(성공 129/거부 8,944), suffix(426/9,004), 필수 TextFormat(200/3,749), Axis(344/106,570), SeriesLabel·Point(182/11,304), Series 접두부(215/4,988)도 통과했습니다. 새 검증은 정규 audit에 연결했습니다.

## 적대적 검증

`/tmp/hwpjs-picture-core-mutants.G5Ei02`에서 본문/Series 각각 Reader 반영 누락, raw4 손상, null 데이터 검사 삭제, 객체 등록 삭제, Picture 버전 변경, 불명확한 뒤쪽 8바이트 과소비, 객체 테이블 해제 삭제, Backdrop 중복 검사를 본문 뒤로 이동한 9종을 만들었습니다. 세 모드 각각 컴파일 완료 후 실제 테스트 실패·종료 코드 1로 검출했습니다(27회). 컴파일 오류는 검출로 세지 않았고 ReleaseFast 해제 누락도 `MemoryLeakDetected`로 확인했습니다.

ReleaseSafe 검사기에서 응답 첫 바이트 변조와 파서 오류를 같은 메시지의 WebAssembly.RuntimeError·TypeError·RangeError로 바꾼 4종도 AssertionError로 검출했습니다.

Debug·ReleaseSafe·ReleaseFast 전체 audit가 모두 종료 코드 0으로 완료됐습니다. 각 모드 27/27 단계, 네이티브 1,064/1,064개, 검사 8,536,656건, WASM imports 0개입니다. 검사 횟수는 전체 HWP/차트 지원률을 뜻하지 않습니다.

최종 기본 테스트도 1,064/1,064개, ReleaseSafe 제품 빌드도 5/5 단계로 통과했습니다. 관련 독립 조사 테스트 9개, 변경 Zig 포맷·JS 문법·문서 링크·diff 공백 검사도 확인했습니다.

재현은 `zig test src/root.zig --test-filter 'chart picture'`, `zig test src/root.zig --test-filter 'chart backdrop'` 및 [세 모드 audit](development-commands.md)의 순차 실행을 사용합니다. 단독 WASM은 `/tmp/hwpjs-series-picture-{Debug,ReleaseSafe,ReleaseFast}.wasm`, 전체 로그는 `/tmp/hwpjs-picture-core-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

## 남은 범위

실파일의 Picture 자체는 비어 있는 형태만 확인했습니다. Picture 뒤의 타입처럼 보이는 숫자와 다른 필드 해석의 모호성은 해결되지 않았습니다. 이후 경계·필드 의미·계열 반복·일반 배열 규칙, 전체 Chart 조립·렌더링·저장은 미완료이며 제품 JS API도 변경하지 않았습니다.

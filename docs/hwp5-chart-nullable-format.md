# TextFormat nullable code 코어

## 기존 API를 유지한 별도 진입점

[Series 뒤쪽 조사](hwp5-chart-series-suffix-evidence.md)에서 43개 중 1개 차트의 TextFormat 두 개에 null code가 확인됐습니다. `chart/text_format.zig`의 기존 `Format`과 `readObservedV1`은 필수 String 계약을 유지합니다. 새 `NullableFormat`과 `readNullableObservedV1`만 nullable code를 명시적으로 선택합니다.

필드 구조는 컴파일 타임 타입 함수가, 읽기 순서는 같은 private 함수가 소유합니다. 객체 ID·타입·기반 타입·raw u16·String resolver를 다시 구현하지 않습니다. non-null code 읽기도 하나의 공통 호출 경로입니다. null 표식은 4바이트만 소비하며 String을 등록하지 않고 `code_introduced=false`입니다. 빈 신규 String은 별도 ID와 `code_introduced=true`, 별칭은 기존 ID와 `false`를 유지합니다.

객체 자체의 null/재참조는 허용하지 않습니다. ID 0은 정상이고 중복 ID는 거부합니다. 코드 raw 바이트는 입력을 빌리며 Unicode 변환이나 NUL 제거를 하지 않습니다. 실패 시 Reader는 유지하지만 변경 가능성이 있는 타입·객체 테이블은 폐기해야 합니다. 문자열별 크기와 전체 고유 문자열 저장량 제한은 기존 resolver가 검사합니다. null은 0바이트 제한에서도 허용되며 빈 문자열과 혼동하지 않습니다.

## 네이티브 검증

별도 fixture와 테스트는 신규/기존 타입, offset 0/1/17/257, null/빈 String/신규 String/별칭, 원시 u16, 문자열 차용, 정확한 소비 끝, 필수 API의 null 거부를 검사합니다. 모든 잘림, 각 타입의 클래스·버전 오류, null/중복 객체 ID와 코드의 자기 참조, 객체·문자열별/저장량 제한도 포함합니다. 정상·실패 경로 OOM과 safety=true 할당 해제 회계를 검사합니다.

신규 테스트 2개와 루트 테스트는 세 모드 각각 3/3 통과했습니다. 기존 필수 TextFormat 테스트도 통과했습니다.

## 실제 파일 연결과 SSOT

`chart-series-label-prefix.zig`는 기존 mode 328의 선행 조립·직렬화를 소유합니다. mode 328은 생성된 wire 소유권만 반환하고 선행 상태를 해제하며, 새 mode 329는 같은 상태를 이어 사용한 뒤 wire와 상태를 함께 해제합니다. 앞부분을 다시 스캔하거나 객체/타입 사전을 새로 추정하지 않습니다. 공통 prefix의 중간 wire 생성은 테스트 전용 비용이며 제품 공개 ABI에 추가한 비용이 아닙니다.

mode 329는 기존 nullable inline TextBlock, raw u16, nullable TextFormat 두 개를 조립합니다. 중간 u16을 원소 개수로 해석하지 않으며 두 개는 선택된 조사 경로입니다. 제품 Series suffix 파서나 전체 Chart 진입점을 새로 제공한 것은 아닙니다.

`chart-series-suffix-oracle.mjs`는 독립 조사 상태와 공통 `textBodyWire`로 기대값을 만들고, 제품 serializer에서 기대값을 생성하지 않습니다. ID·소비 끝·텍스트 본문 raw·code 존재 여부/바이트/길이/trailer/도입 여부·객체/타입 수·문자열 저장량을 비교합니다.

Debug·ReleaseSafe·ReleaseFast 단독 WASM에서 각각 차트 43개·TextFormat 86개·실제 null code 2개를 대조했습니다. 각 모드 정상/변형 426건, 의도한 오류 9,004건입니다. 정확한 끝, 뒤쪽 바이트 무관성, 모든 잘림, raw 변형, 원본 복구 대조, ID/타입/제한 오류와 함께 실제 code를 null·빈 String·기존 별칭으로 바꾸는 변형도 포함합니다. 일반 Error와 정확한 오류명을 확인하며 호스트 trap을 정상 거부로 세지 않습니다.

같은 실행에서 기존 필수 TextFormat 50개(성공 200/거부 3,749), Axis 172개(344/106,570), SeriesLabel·Point(182/11,304), Series 접두부(215/4,988)도 통과했습니다. 새 검증은 정규 audit에 연결했습니다.

## 적대적 검증

`/tmp/hwpjs-nullable-format-mutants.xfExcM`에서 nullable 분기 삭제, null을 도입된 String으로 표시, null 표식 소비 누락, Format 객체 등록 삭제, raw u16 손상, 개별 문자열 한도 완화, 별칭을 신규 도입으로 표시, 객체 테이블 해제 삭제의 8종을 만들었습니다. 세 모드 각각 컴파일 완료 후 실제 테스트 실패·종료 코드 1로 검출했습니다(24회). 컴파일 오류는 검출로 세지 않았고 ReleaseFast 해제 누락도 `MemoryLeakDetected`로 확인했습니다.

ReleaseSafe 검증기에서 응답 첫 바이트 변조와 의도한 파서 오류를 같은 메시지의 WebAssembly.RuntimeError·TypeError·RangeError로 바꾼 4종 모두 AssertionError로 검출했습니다. 거부 통계에 호스트 예외를 숨기지 않습니다.

Debug·ReleaseSafe·ReleaseFast 전체 audit가 모두 종료 코드 0으로 완료됐습니다. 각 모드 27/27 단계, 네이티브 1,061/1,061개, 검사 8,530,464건, WASM imports 0개입니다. 검사 횟수를 구현 완료율이나 전체 HWP 지원 범위로 해석하지 않습니다.

최종 기본 테스트도 1,061/1,061개, ReleaseSafe 제품 빌드도 5/5 단계로 통과했습니다. 관련 독립 조사 테스트 9개, 변경 Zig 포맷·JS 문법·문서 링크·diff 공백 검사를 확인했습니다.

재현은 `zig test src/root.zig --test-filter 'chart nullable format'` 및 [세 모드 정규 audit](development-commands.md)의 순차 실행을 사용합니다. 단독 WASM은 `/tmp/hwpjs-series-suffix-{Debug,ReleaseSafe,ReleaseFast}.wasm`, 전체 로그는 `/tmp/hwpjs-nullable-format-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

## 남은 범위

새 nullable 경로는 기존 필수 API를 대체하지 않습니다. 뒤쪽 raw 꼬리의 경계·의미, Series 전체 조립·계열 반복·일반 배열 규칙, 전체 Chart 조립·렌더링·저장은 미완료입니다. 공식 API 속성 표를 바이너리 저장 순서로 해석하지 않습니다.

후속 [빈 Picture 조사](hwp5-chart-series-picture-evidence.md)에서 다음 Picture의 끝과 그 뒤 기반 타입 가설의 모호성을 검증했습니다. 조사 결과와 제품 지원 범위는 구분합니다.

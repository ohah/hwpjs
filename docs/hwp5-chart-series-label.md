# SeriesLabel·SeriesPoint 코어

## 계약과 책임

[실파일 조사](hwp5-chart-series-label-evidence.md)에서 확인한 순서를 코어로 연결했습니다. `series_label.zig`는 inline ID 등록 → VtSeriesLabel v1 → 공통 `text_block_body.readObservedV2`를 조립합니다. TextBlock 기반 본문 앞에 두 번째 객체 ID를 읽지 않습니다. Label의 Font·String·보조 Backdrop·원시 필드·문자열 제한은 공통 본문이 소유하며 복제하지 않습니다.

`series_point.zig`는 inline ID 등록 → VtSeriesPoint v1 → SeriesLabel → raw20 → VtObject v1을 읽습니다. raw20의 필드 의미는 정하지 않습니다. 두 모듈은 배열 개수나 상위 Series 소유 관계를 추론하지 않습니다.

타입 읽기는 기존 공통 계약대로 신규 선언·기존 참조를 모두 처리합니다. 특히 마지막 VtObject의 신규 선언은 합성 테스트로 확인한 공통 문법 확장입니다. 실파일에서 신규 선언을 발견했다는 뜻이 아닙니다. 독립 Point 조사기의 마지막 기반 타입은 알려진 참조만 읽는 더 좁은 관측 경로입니다.

두 모듈은 성공할 때만 Reader 위치를 반영합니다. 실패 후에는 변경 가능성이 있는 타입·객체 테이블을 호출자가 폐기해야 합니다. 반환 raw 배열은 복사되며 문자열은 원본 버퍼를 빌립니다. null·빈 문자열·기존 별칭은 구별합니다. 객체 ID 0은 허용하고 null ID와 전역 중복을 거부합니다. 문자열 위치의 기존 비-문자열 참조는 중복 오류가 아니라 `UnsupportedChartObjectReference`입니다.

## 네이티브 검증

독립 fixture는 책임별 파일로 분리했습니다. 신규/기존 타입, offset 0/1/17/257, Label 단독·Point 조립, null/별칭/신규/빈 텍스트, 정확한 소비 끝, 원시 바이트 복사와 문자열 차용, 객체·문자열 제한을 검사합니다. 모든 잘림, 클래스·버전 불일치, null/중복 ID, 잘못된 마지막 기반 타입, 정상·실패 경로 OOM 및 safety=true 할당 회계를 포함합니다.

마지막 기반 타입의 신규 선언을 별도로 만들고 버전 1 성공·99 실패와 Reader 원자성을 검사합니다. 앞선 VtObject의 버전을 바꾸어 먼저 실패하는 테스트로 이를 대신하지 않습니다.

## 실제 WASM 대조

테스트 mode 328은 기존 접두부 코어 뒤에서 호출자가 지정한 수의 Point를 읽고, tail raw66·String 다음 Label까지 조립합니다. 요청 개수 상한 32는 테스트 어댑터 제한이며 제품의 배열 의미가 아닙니다. tail 부분은 테스트 연결 코드이고 제품 Series 본문 파서로 승격하지 않았습니다.

기대값은 `chart-series-label-oracle.mjs`에서 독립 관측 결과와 기존 `textBodyWire`를 재사용합니다. 제품 serializer의 결과로 기대값을 생성하지 않습니다. 실제 차트 43개·Point 5개에서 Label·Point ID, 모든 반환 본문 필드·raw·String, 각 소비 끝, 객체/타입 수와 문자열 저장량을 비교합니다.

Debug·ReleaseSafe·ReleaseFast 단독 실행에서 각각 정상·변형 182건, 의도한 오류 11,304건을 확인했습니다. 기존 Series 접두부 215건 성공·4,988건 거부도 함께 통과했습니다. 정상 원본 재파싱, 모든 잘림, 정확한 끝, 뒤쪽 데이터 무관성, raw 변형, 타입·버전·ID·제한 오류를 검사하며 Error 생성자와 정확한 메시지를 요구합니다. WebAssembly.RuntimeError를 정상 거부로 세지 않습니다.

검증 코드는 정규 audit에 연결했습니다. 의도한 파서 오류를 발생시키는 경로에서 같은 메시지의 WebAssembly.RuntimeError·TypeError·RangeError로 교체한 3종도 검사기 자체의 실패로 검출했습니다.

## 결함 주입

`/tmp/hwpjs-series-label-core-mutants.avqDwK`에서 Point/Label 각각 Reader 반영 삭제, raw20 손상, Point/Label 각각 객체 등록 삭제, 마지막 기반 타입의 클래스·버전 검사 삭제, 객체 테이블 해제 삭제의 7종을 검사했습니다. 세 모드 각각 컴파일 완료 후 실제 테스트 실패·종료 코드 1을 확인했습니다(21회). 컴파일 오류를 검출로 세지 않았습니다. ReleaseFast의 해제 누락도 safety=true 회계의 `MemoryLeakDetected`로 검출했습니다.

Debug·ReleaseSafe·ReleaseFast 전체 audit가 모두 종료 코드 0으로 완료됐습니다. 각 모드 27/27 단계, 네이티브 1,059/1,059개, 검사 8,512,030건, WASM imports 0개입니다. 검사 횟수는 지원 필드 비율이나 전체 HWP 구현 완료율이 아닙니다.

마지막 기본 `zig build test`도 1,059/1,059개, ReleaseSafe 제품 빌드도 5/5 단계로 통과했습니다. 변경 Zig 포맷·JS 문법·문서 링크·diff 공백 검사를 확인했습니다.

재현은 루트에서 `zig test src/root.zig --test-filter 'chart series label point'` 및 [세 모드 정규 audit](development-commands.md)의 순차 실행을 사용합니다. 단독 테스트 WASM은 `/tmp/hwpjs-series-label-{Debug,ReleaseSafe,ReleaseFast}.wasm`, 전체 실행 로그는 `/tmp/hwpjs-series-label-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 임시 경로는 이번 실행의 증거 위치이며 저장소의 필수 입력이 아닙니다.

## 남은 범위

제품 JS API는 변경하지 않았습니다. 일반 Series 배열 규칙·tail 전체 코어·Label 이후 inline TextBlock·계열 끝과 반복·raw 의미·전체 Chart 조립·렌더링·저장은 여전히 미완료입니다. 본 파트 통과는 전체 차트나 HWP 문서 지원 완료가 아닙니다.

# Nullable 제목의 제품 파서 경로

## SSOT와 기존 API 유지

`text_block.zig`는 공통 BlockType과 하나의 private 읽기 경로를 사용합니다. 기존 Block과 필수 제목 함수는 String 반환 및 기존 오류 계약을 유지합니다. 새 NullableBlock과 readNullableObservedWithObjects만 text를 선택 값으로 반환합니다. 객체 ID 등록·기반 본문 읽기·결과 필드 매핑을 별도로 복제하지 않습니다.

`axis.zig`도 공통 AxisType과 private 조립 경로를 공유합니다. 기존 Axis/readObservedV3는 제목 String이 필수이며, NullableTitleAxis/readNullableTitleObservedV3는 null 제목을 지원합니다. 제목 글꼴명은 여전히 필수 String이고, 축 전체 문자열 예산에서 null은 0바이트, 빈/신규/기존 참조는 실제 길이를 차감합니다. 객체 사전의 고유 저장량과 필드별 합계는 구별합니다.

두 nullable 경로 모두 실패 시 Reader 위치를 유지하지만 호출자는 변경될 수 있는 타입·객체 사전을 폐기해야 합니다. String은 원본 버퍼를 빌리고 원시 필드는 복사합니다. 기존 레거시 비사전 경로의 중복 ID 검사 순서는 유지합니다. 근거와 실제 반례는 [nullable 제목 조사](hwp5-chart-axis-null-title.md)에 있습니다.

## 네이티브·적대적 검증

기존 Axis 테스트 입력 생성기에 null·빈·신규·별칭 제목을 추가하되 기존 make 함수는 원래 별칭 입력을 그대로 생성합니다. `nullable_title_tests.zig`에서 inline TextBlock 단독 및 전체 Axis, 배율 유무, offset 0/1/17/257을 검사합니다. 정확한 소비 끝·String 종류/도입 여부·객체 수·고유 저장량/필드 합계 한도, 모든 잘림, 한도 미달, null 글꼴명 거부, 기존 필수 경로의 null 거부, 전체 OOM 주입과 정상/후기 오류의 safety=true 할당자 해제 회계를 검사합니다.

Debug·ReleaseSafe·ReleaseFast의 차트 관련 테스트는 각 61/61으로 통과했습니다.

`/tmp/hwpjs-nullable-title-mutants.xgeVht`에서 nullable 경로를 필수 본문 읽기로 변경, 모든 nullable 텍스트를 null로 삭제, TextBlock Reader 조기 반영, 신규 String 도입 여부 삭제, 축의 제목 텍스트 예산 차감 누락, 사전 해제 누락의 6종을 만들었습니다. 세 모드 모두 실제 런타임 FAIL과 종료 코드 1로 검출했습니다(18회). 컴파일 실패를 검출로 세지 않았으며, ReleaseFast의 해제 누락도 MemoryLeakDetected로 실패했습니다.

## 실제 파일의 WASM 대조

테스트 mode 324는 앞선 Grid/Legend/Plot/Light와 첫 4개 축의 객체 사전을 유지하고, 관측된 Surface 접두사 뒤의 nullable 축을 코어로 읽습니다. Surface의 raw 30/46바이트와 빈 배열을 지나가는 코드는 테스트 전용입니다. 제품 Surface 파서·일반적인 축 개수 규칙·전체 Chart 지원으로 승격하지 않습니다. 제품 JS 공개 API도 변경하지 않습니다.

독립 JS `chart-nullable-title-oracle.mjs`는 기존 관측기의 타입·String·Number 상태와 앞선 객체 ID 집합을 이어 받고 새 객체 중복도 검사합니다. 기존/nullable 축의 테스트 wire는 Zig와 JS 각각의 공통 serializer로 분리했으며, JS 기대 바이트를 Zig 출력으로 생성하지 않습니다.

Debug·ReleaseSafe·ReleaseFast에서 각각 실제 차트 43개를 대상으로 정상/변형 301건, 오류 12,298건을 통과했습니다. 원본 null 제목, 정확한 소비 끝, 뒤쪽 바이트 변조, 원시 필드 보존, 모든 11,868개 축 잘림, 문자열/객체/입력 한도, 중복 ID, 별칭·빈 신규 String·비 UTF-8 신규 String을 대조합니다. 오류마다 원본 재파싱을 확인하고 정상 Error와 정확한 오류명을 요구합니다.

공유 serializer를 사용하는 기존 필수 제목 경로도 43개 차트의 축 172개(배율 69개, 긴 꼬리 6개), 정상 344건/오류 106,570건으로 회귀 확인했습니다. 출력 바이트 변조 및 같은 메시지의 WebAssembly.RuntimeError 주입은 각각 AssertionError로 검출됐습니다.

## 정규 회귀 결과와 남은 범위

세 모드 전체 `zig build audit --summary all`(최적화 모드는 `-Doptimize=ReleaseSafe`/`ReleaseFast`)가 각각 종료 코드 0, 27/27 단계, 네이티브 1,050/1,050 테스트, WASM 검사 8,445,595건으로 통과했습니다. mode 324 대조는 정규 audit에 포함됩니다. 로그는 `/tmp/hwpjs-nullable-title-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 관련 독립 조사 테스트 10개도 통과했습니다. 이전 조사 단계의 성공을 이번 결과로 대신하지 않았습니다.

최종 `zig build test --summary all`은 1,050/1,050, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다. 변경 Zig 포맷·JS 구문·diff 공백 검사도 통과했습니다.

이번 범위는 nullable 제목의 inline TextBlock과 Axis 코어입니다. 실제 43개는 제목 null·배율 없음이며, 빈/신규/별칭 및 배율 조합은 변형 입력·네이티브 fixture로 별도 검증했습니다. Surface 필드 의미, 이후 CLineItem과 전체 Chart 조립·렌더링·저장은 아직 미완료입니다. 다음 작업은 nullable 축 다음의 CLineItem 경계 검증입니다.

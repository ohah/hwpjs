# ICC v2 문자열 구조

후속 [명시적 UTF-16BE 내용 검사](icc-v2-unicode.md)는 별도 모듈에서 진행합니다. 이 원시 파서의 보존·보류 계약과 구분합니다.

## 근거와 책임

[ICC.1:2001-04 §6.5.17–18, 표 68–70](https://www.color.org/specification/ICC.1-2001-04.pdf)을 대조했습니다. `text_type.zig`는 textType의 ASCII와 종료 NUL을 검사합니다. `text_description.zig`는 desc의 ASCII·Unicode·ScriptCode 영역을 길이 기반으로 읽습니다. ASCII 공통 검사는 `ascii_terminated.zig`, 경계 검사는 기존 binary.Reader가 소유합니다.

문자열 view는 입력을 빌리며 종료 문자도 보존합니다. ASCII는 7비트와 마지막 NUL을 검사하지만 내부 NUL을 삭제하지 않습니다. Unicode 길이는 2바이트 단위 수이며 빈 영역을 허용하고, 비어 있지 않으면 끝의 2바이트 NUL을 확인합니다. ScriptCode count는 최대 67이며 고정 저장 영역 전체가 필요합니다. ASCII 길이에 따라 뒤 필드가 비정렬일 수 있어 정렬 보정이나 포인터 캐스팅을 하지 않습니다. count 곱셈은 남은 길이와 나눗셈 비교 이후 수행합니다.

Unicode 문자 유효성·언어 코드 의미·ScriptCode 인코딩은 보류합니다. 미사용 ScriptCode 바이트와 후행 바이트도 보존하되 유효하다고 인증하지 않습니다.

## 태그·PNG 연결

`localized_kind`가 desc/cprt 이름과 종류의 단일 출처이며 기존 v4 localized_tag와 통합 tag_payload가 공유합니다. v4 전용 API는 유지하고, 통합 분기에서 v2 desc는 description_v2, cprt는 copyright_v2로 반환합니다. 알려진 잘못된 타입은 미지원 상태로 숨기지 않습니다. v2 chad는 여전히 미지원입니다.

집계 보고서는 v2_description/v2_copyright와 v2_unicode_bytes_deferred/v2_script_bytes_deferred/v2_trailing_bytes_deferred를 별도 집계합니다. 미사용 영역을 포함한 ScriptCode 저장 67바이트 전체가 미검증입니다. 기본 설정에서는 v2 Unicode 내용을 스캔하지 않으므로 공통 unicode_bytes에 넣지 않습니다. 명시적으로 선택한 내용 검사는 위 후속 문서에서 관리합니다. 모든 v2 태그 바이트는 기존 프로파일 전체 max_payload_bytes에 차감됩니다. 언어 의미와 전체 의미 보류도 해제하지 않습니다.

네이티브 PNG 테스트는 고립 surrogate를 의도적으로 넣고 구조 파싱과 Unicode 검증을 혼동하지 않는지 확인합니다. 입력을 빌리는 분기 결과, 프로파일 정리 후 스칼라 보고서, 모든 할당 실패 지점, ancillary/색 의미 보류를 확인했고 전체 Debug 707/707로 통과했습니다.

## 실제 파일 조사

초기 조사에서는 macOS v2 프로파일 8개의 desc/cprt 원본 16개를 JS로 읽기 전용 조사했습니다. desc의 ASCII 길이와 ScriptCode 유무가 달랐고, Generic Lab/RGB/XYZ의 desc에는 정의된 구조 뒤 1바이트가 있었습니다. 이 관측만으로 후행 바이트의 의미나 명세 적합성을 확정하지 않습니다. 이후 WASM 대조 결과는 아래에 별도로 기록합니다.

## 검증 진행

신규 네이티브 테스트는 ASCII 길이 1–8의 모든 내부 정렬, Unicode 개수 0/1/2/3, ScriptCode 개수 0/1/66/67, 원본 포인터·코드 보존, 전체 잘림, u32 최대 개수, 잘못된 종료 문자·ASCII·ScriptCode 개수, 미사용/후행 바이트 보존을 확인합니다. 첫 전체 Debug 네이티브 실행은 5/5 단계, 706/706 테스트로 통과했습니다.

WASM mode242는 mode241과 입력·검사·기본 보고서 직렬화를 공유하며 뒤에 v2 보고서 5개 u32 LE를 붙입니다(총 92바이트). mode241의 기존 72바이트는 유지합니다. 독립 JS fixture와 고정 기대값으로 165비교/107거부가 통과했고 기존 통합 검사도 6비교/266거부로 통과했습니다. v2에 mluc를 넣던 이전 입력은 이제 알려진 타입 오류 거부로 검사합니다. 신규 검사는 정규 audit에 연결했습니다.

실제 v2 프로파일 8개의 desc/cprt 16개 원시 태그를 추출해 합성 RGB 컨테이너에 넣고 WASM과 JS 원본 필드 집계를 대조했습니다. 모두 통과했고 Generic Lab/RGB/XYZ의 후행 1바이트도 미검증으로 보고했습니다. 원래 프로파일의 색 공간·전체 태그 검증이나 문자열 렌더링 대조가 아니며, 수동 8건은 정규 audit 건수에 합산하지 않습니다.

v2 설명/저작권 집계와 Unicode/ScriptCode/후행 미검증 바이트를 각각 지우는 출력 변형 5종을 모두 ERR_ASSERTION으로 검출했습니다. 소스 변형 결과는 별도 절에서 구분하며 전체 감사 결과와 혼동하지 않습니다.

전체 감사는 `/tmp/hwpjs-v2-text-{Debug,ReleaseSafe,ReleaseFast}.log`로 순차 실행하여 모두 완료했습니다.

세 모드 전체 감사가 모두 20/20 단계, 네이티브 707/707, WASM checks=6,993,900으로 완료했고 순차 실행 상위 프로세스도 종료 코드 0입니다. 신규 272사례 중 163사례는 mode241/242를 각각 호출해 기본 wire 일치를 확인하므로 정규 감사 호출 수는 이전 6,993,465보다 435건 늘었습니다. ReleaseSafe·ReleaseFast 감사용 산출물에서도 신규/기존 직접 대조·출력 변형 5종 검출·실제 파일 8개에서 추출한 태그 대조가 통과했습니다.

## 소스 변형 검사

제품 소스를 `/tmp/hwpjs-v2-text-mutant.tvcyVy/terminator`와 `count`에 복사해 각각 Unicode 종료 문자 검사 삭제, Unicode 단위 수를 바이트 수로 잘못 사용하는 결함을 넣었습니다. 종료 문자 변형은 세 모드 모두 TestExpectedError로 검출됐고 필터 결과는 루트·기존 v2 수치 테스트 포함 6통과/1실패였습니다.

개수 변형은 길이 1바이트를 만들어 제품 원본에서는 성립하지 않는 종료 문자 인덱스 조건을 깨뜨렸습니다. Debug·ReleaseSafe는 integer overflow panic/ABRT, ReleaseFast는 InvalidIccTextTerminator 및 TestUnexpectedError(5통과/2실패)로 검출했습니다. 제품 원본의 입력 실패나 테스트 통과로 보고하지 않습니다. 로그는 `/tmp/hwpjs-v2-text-mutant-{terminator,count}-{Debug,ReleaseSafe,ReleaseFast}.log`입니다.

## 최종 재검토

커밋 전 마지막 `zig build test --summary all`이 707/707, 이어서 `zig build -Doptimize=ReleaseSafe --summary all`이 5/5 단계로 통과했습니다.

종료 문자·7비트 ASCII 규칙의 재사용, 태그 이름 판별 SSOT, 비정렬 읽기·단위 개수의 곱셈 선검사, 원시 Unicode/ScriptCode/후행 정보 보존, 전체 처리량 한도와 미검증 집계, 소유권 정리 후 보고서 수명 및 기존 v4/wire 계약 보존을 확인했습니다. 이번 범위에서 추가 제품 결함은 발견하지 못했습니다. Zig 포맷·JS 문법·diff 공백·문서 로컬 링크 4개를 검사했습니다. Unicode 내용·언어 코드·ScriptCode 의미, 전체 ICC 모델 및 HWP/HWPX 전체 문서 검증은 여전히 미완료입니다.

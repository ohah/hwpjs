# v2 설명 문자열의 명시적 UTF-16BE 검사

## 근거와 범위

[ICC v2 명세](https://www.color.org/specification/ICC.1-2001-04.pdf)의 설명 문자열은 2바이트 단위 개수와 종료 NUL을 정의합니다. [Unicode 기술 노트](https://www.color.org/unicode/)는 적용 범위를 v4/ICC.2로 명시하므로 이를 v2 인코딩 선택의 직접 근거로 확대하지 않았습니다. [Unicode FAQ](https://www.unicode.org/faq/utf_bom.html)의 surrogate와 UTF-16 설명을 참고하되, 인코딩 선택과 코드 단위 검증은 구분합니다.

`description_unicode.inspectUtf16BE(parsed_view,max_bytes)`는 호출자가 UTF-16BE 해석을 명시적으로 선택한 검사입니다. 판본 major나 언어 코드로 인코딩을 추정하지 않습니다. 기존 `text/utf16.inspect`를 재사용하고 할당·변환·NUL/BOM 제거·정규화를 하지 않습니다. 파싱된 view와 backing bytes는 사용 중 변경하지 않습니다.

결과는 present·inspected_bytes·scalar/NUL/BOM 수·NUL 종료 여부를 반환합니다. Unicode 영역 없음과 NUL만 있는 빈 문자열을 구분합니다. 바이트 한도를 내용 검사보다 먼저 적용합니다. 원시 view의 unicode_deferred는 변경하지 않으며 언어 코드와 ScriptCode 의미 보류도 유지합니다.

## 검증 진행

네이티브 테스트는 영역 부재/빈 문자열, 정확한 한도/초과, surrogate pair와 고립 surrogate, 내부 NUL·BOM 통계, 단일 16비트 단위 65,536개 및 surrogate pair 끝값 조합을 검사합니다. 공통 테스트 fixture를 분리해 기존 구조 테스트와 새 내용 테스트가 같은 배치 생성기를 사용합니다. 기대 문자 범위와 통계는 파서 결과에서 생성하지 않습니다.

첫 두 테스트 추가 후 전체 Debug는 709/709, 단일 단위 전수 검사와 surrogate pair 경계 추가 후에는 5/5 단계, 710/710으로 통과했습니다. Zig 포맷과 diff 공백 검사도 통과했습니다. 이 함수 추가만으로 v2 전체 Unicode 의미 검증이나 전체 문서 검증이 완료된 것은 아닙니다.

## PNG 선택 연결

payload_inspection.Options.v2_unicode_utf16be는 기본 false로 원본 보존 동작을 유지합니다. true이면 위 검사기를 호출하고 전체 max_unicode_bytes 잔여 한도를 적용합니다. 보고서는 v2_unicode_utf16be_selected로 선택을 기록하고 v2_unicode_descriptions_checked 및 scalar/NUL/BOM 수를 집계합니다. 성공한 경우 해당 바이트를 공통 unicode_bytes에 더하고 v2_unicode_bytes_deferred에는 넣지 않습니다. ScriptCode·후행 영역·전체 의미 보류는 해제하지 않습니다. 검사 선택은 해당 프로파일에서 실제 검사한 v2 설명 개수와 구분합니다.

PNG 네이티브 테스트는 동일한 고립 surrogate 입력을 미선택 시 보존하고 선택 시 거부하는지, 유효 입력의 BOM/NUL 통계·한도 우선 검사·프로파일 해제 후 값 보존·모든 할당 실패 정리를 확인했습니다. 오류 기대 도우미를 기존 PNG 테스트와 공유하며 주입된 OutOfMemory를 검증 도구에 전달합니다. 전체 Debug는 5/5 단계, 711/711로 통과했습니다.

## WASM 독립 대조

mode243은 기존 입력과 PNG 경로를 공유하고 UTF-16BE 검사를 명시적으로 선택합니다. mode241/242의 기존 72/92바이트 출력은 유지하며 새 출력은 선택·검사 개수·scalar/NUL/BOM의 u32 LE 5개를 더한 112바이트입니다.

Debug 직접 실행은 신규 314비교/479거부, 기존 v2 165비교/107거부, 기존 통합 6비교/266거부로 통과했습니다. fatal/ignoreBOM TextDecoder로 제품과 별도로 기대 문자 통계를 계산했습니다. 부재·빈 문자열·NUL/BOM 보존·surrogate 경계·고정 seed 256개 코드 포인트·미선택·모든 입력 접두 잘림·한도·오류 후 재사용을 확인했습니다.

검사 바이트·선택 표시·검사 개수·scalar/NUL/BOM을 각각 지우는 출력 변형 6종을 모두 ERR_ASSERTION으로 검출했습니다. 정규 audit에 신규 검사를 연결했으며 소스 변형과 최종 감사 결과는 아래에 구분합니다.

전체 감사는 `/tmp/hwpjs-v2-unicode-{Debug,ReleaseSafe,ReleaseFast}.log`로 순차 실행하여 모두 완료했습니다.

세 모드 전체 감사가 모두 20/20 단계, 네이티브 711/711, WASM checks=6,994,693으로 완료했고 상위 순차 실행 프로세스도 종료 코드 0입니다. 이전 6,993,900에 신규 793건이 추가됐습니다. ReleaseSafe·ReleaseFast 감사 산출물에서도 신규/기존 직접 대조·출력 변형 6종 검출·실파일의 비어 있는 Unicode 영역 8건 대조가 통과했습니다.

## 추가 적대적 검증과 실파일 경계

임시 복사 `/tmp/hwpjs-v2-unicode-mutant.L3UGhR/src`에서 UTF-16 바이트 순서를 big에서 little로 바꿨습니다. 세 모드 모두 통계 테스트의 TestExpectedEqual과 단일 코드 단위 전수 테스트의 InvalidUnicodeEncoding으로 검출했습니다(루트 블록 포함 2통과/2실패). 로그는 `/tmp/hwpjs-v2-unicode-mutant-{Debug,ReleaseSafe,ReleaseFast}.log`이며 제품 소스는 변경하지 않았습니다.

macOS v2 프로파일 8개의 desc를 원본에서 추출해 합성 RGB 프로파일에 넣고 새 WASM 경로로 확인했습니다. 원본 Unicode count가 모두 0인 것을 별도 JS 읽기로 확인한 뒤 선택 표시·검사 개수 1·검사 바이트와 문자 통계 0·전체 의미 보류를 대조했습니다. 이는 실파일의 비어 있는 영역에 대한 8건이며 Unicode 내용·원래 프로파일 전체·렌더링 대조가 아닙니다. 정규 감사 호출 수에 합산하지 않습니다.

Debug WASM에서 태그가 없는 v4 프로파일과 빈 mluc 설명 태그가 있는 v4 프로파일도 확인했습니다. v2 전용 옵션을 켠 mode243의 첫 92바이트는 기존 mode242와 같고 선택 표시만 1, v2 검사 개수·통계는 0이었습니다. 옵션 선택과 적용된 v2 검사 개수를 구분하는 수동 2건이며 전체 v4 호환성의 증거로 확대하지 않습니다.

## 최종 재검토

커밋 전 마지막 `zig build test --summary all`도 711/711로 통과했고, 이어서 `zig build -Doptimize=ReleaseSafe --summary all`이 5/5 단계로 통과했습니다.

공통 UTF-16 검사기와 fixture/오류 기대 도우미 재사용, 명시적 해석 선택·기본 보존 동작, 내용 검사 전 바이트 한도, 검사한 바이트와 미검증 바이트의 분리, 프로파일 정리 후 보고서 수명, 기존 probe wire 보존을 확인했습니다. 이번 범위에서 추가 제품 결함은 발견하지 못했습니다. Zig 포맷·JS 문법·diff 공백과 변경 문서 로컬 링크 1개도 확인했습니다. 인코딩 선택의 적합성·언어 코드·ScriptCode 의미·전체 ICC 모델 및 HWP/HWPX 전체 문서 검증은 여전히 미완료입니다.

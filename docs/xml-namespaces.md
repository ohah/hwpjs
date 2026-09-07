# XML namespace 검증

## 계약과 명세

`xml.document.inspect`의 `validate_namespaces = true` 옵션으로 켭니다. 기본값 false는 namespace를 해석하지 않는 XML 1.0 구조 검사이며, 성공 보고서의 `namespaces_validated`가 두 모드를 구분합니다. 이 옵션을 켜도 DTD·스키마·HWPX 필드 의미·XML 저장까지 지원하는 것은 아닙니다.

기준은 [Namespaces in XML 1.0 Third Edition](https://www.w3.org/TR/2009/REC-xml-names-20091208/)입니다. QName/NCName, 예약 prefix/이름, 선언 범위, 기본 namespace, 확장 속성 이름 중복을 검사합니다. §8에서 필수 검사에서 제외한 URI-reference 문법 검사는 하지 않습니다. URI 문자열의 유효 URL 여부·접근 가능성·스키마 존재를 보장하지 않으며 네트워크에 접근하지 않습니다.

## 책임과 SSOT

- `qname.zig`: 기존 XML 문자 규칙으로 NCName을 검사하고 QName을 빌린 prefix/local 부분으로 나눕니다. 콜론 앞뒤가 비어 있거나 여러 콜론이 있으면 거부합니다.
- `namespace_uri.zig`: 기존 속성 iterator로 정규화된 문자를 읽어 소유 UTF-8 URI로 만듭니다. 예약 URI/prefix 검사를 소유합니다. 대소문자·퍼센트 인코딩·Unicode 조합을 변경하지 않습니다.
- `namespaces.zig`: 현재 prefix 해시 인덱스와 되돌림 이력으로 선언 상속·가림·복원을 처리합니다. 확장 속성 이름 `(URI, local)` 중복은 별도 해시 집합으로 검사합니다. 매 요소마다 전체 상위 scope를 복사하거나 속성 쌍을 전수 비교하지 않습니다.
- `document.zig`: 기존 요소 스택 프레임에 namespace 복원 위치를 보관합니다. 종료 태그는 기존 원문 이름 일치를 먼저 확인합니다. 같은 URI에 연결된 다른 prefix라도 종료 태그 이름을 바꿀 수 없습니다.
- `markup.zig`: namespace 모드의 PI target을 NCName으로 검사합니다. XML 일반 Name 검사와 namespace NCName 검사를 혼동하지 않습니다.

선언은 같은 시작 태그의 모든 속성과 요소 이름에 적용되므로 속성 순서와 무관하게 먼저 수집합니다. 기본 namespace는 일반 무접두 속성에 적용하지 않습니다. `xmlns=''`는 기본 namespace만 해제하며 `xmlns:p=''`는 Namespaces 1.0에서 거부합니다. 빈 요소의 선언은 그 요소를 벗어나면 즉시 복원합니다.

`xml`은 선언 없이 내장 URI를 사용합니다. 같은 URI로 명시 선언할 수 있지만 다른 prefix나 기본 namespace에 해당 URI를 배정할 수 없습니다. `xmlns` prefix의 선언과 요소 이름 사용은 거부합니다. `XML`, `XMLfoo` 같은 다른 prefix를 `xml`과 같은 의미로 취급하거나 예약이라는 이유만으로 거부하지 않습니다.

## 소유권·실패·예산

prefix와 local은 한 문서의 동일 strict 인코딩 원문을 빌립니다. URI만 UTF-8로 소유합니다. scope 진입에 실패하면 그 진입에서 추가한 선언을 되돌리고, 종료·빈 요소·문서 오류·할당 실패 모두 URI를 해제합니다. 따라서 재사용 시 실패한 선언이 다음 요소에 남지 않습니다.

`options.namespaces.max_bindings`의 기본값은 65,536, `max_uri_bytes`는 16 MiB입니다. 현재 살아 있는 선언 수와 정규화 UTF-8 URI 바이트를 제한하며, 가려진 부모 선언도 복원에 필요하므로 포함합니다. 이미 끝난 형제 요소의 선언은 차감됩니다. 암묵적인 `xml`은 예산에 포함하지 않지만 명시적인 `xmlns:xml`과 빈 기본 선언은 선언 수에 포함합니다. URI 예산과 원본 XML 바이트 예산은 서로 다른 단위입니다.

## 검증

네이티브 검사는 이름 문자·예약 이름·상속·가림·복원, 실제 URI 정규화 후 중복, 무접두 속성 예외, 같은 URI의 다른 종료 prefix 거부, PI 콜론 거부, 한도 정확/부족, 정상/실패 경로 전체 할당 실패를 포함합니다. 별도 scope 검사에서 기본 namespace 해제·복원과 실패한 진입 후 상태 복원·재사용을 직접 관찰합니다.

테스트 WASM mode 124는 mode 123의 45바이트 접두부 다음에 namespace 선언 수/URI 바이트 한도 u32 두 개를 받습니다. 제품 JS ABI는 변경하지 않았습니다. 기존 문서 통계와 마지막 namespace 플래그를 독립 JS oracle과 비교합니다. JS oracle은 태그 문법 oracle과 문서 순회 hook을 재사용하되 scope는 복사한 Map으로 구현하여 제품 되돌림 인덱스와 독립시켰습니다. UTF-8·UTF-16LE·UTF-16BE, 한글·비 BMP prefix/local, 선언 순서, 참조로 표기한 URI, 잘림과 실패 후 재사용을 검사합니다. 기존 실제 HWP 이력 XML 5개도 namespace 모드로 끝까지 읽습니다.

### 외부 대조의 종료 코드 함정

2026-09-07 `xmllint --nonet --noout -`로 정상 16개와 오류 23개를 대조했습니다. URI 자체 문법 검사 범위가 다른 비 ASCII URI 사례 하나는 이 대조에서 제외했습니다. 판정은 모두 일치했지만 namespace 오류 22개는 오류 진단을 출력하면서도 종료 코드 0을 반환했습니다.

기존 `history-xml-query.mjs`는 종료 코드만 검사하여 이 경우 정상 결과로 받아들였습니다. 상태 0·namespace 오류 진단을 가진 회귀 테스트가 `Missing expected exception`으로 실패하는 것을 재현한 뒤, stderr 진단이 있으면 내용을 노출하지 않고 `XmlProcessDiagnostic`을 반환하도록 수정했습니다. 경고도 독립 증거로 채택하지 않지만, 이것이 해당 문서를 무조건 잘못된 XML로 판정한다는 뜻은 아닙니다. 제품 Zig 파서의 URI 문법 정책은 바꾸지 않았습니다. 경고·비정상 stderr 타입·빈 stderr도 테스트하고 기존 실파일 외부 조사까지 다시 확인했습니다.

Debug·ReleaseSafe·ReleaseFast 전체 audit 모두 17/17 단계와 HWP5 감사 스크립트 3,082,533 checks를 통과했습니다. namespace 전용 WASM 검사는 정상 138건·거부 602건이며 정상 건에 실제 이력 XML 5개를 포함합니다. 초기 Debug audit는 네이티브 331/331이었고, scope 상태 직접 검사 추가 후 최종 Debug `zig build test`와 Safe/Fast 전체 audit는 각각 332/332입니다. 외부 진단 회귀 테스트 6/6 및 실제 `history-xml-audit`도 통과했습니다. 포맷·변경 JS 문법·문서 로컬 링크 42개를 검사했습니다.

검사 횟수는 지원률이나 무결함 보장이 아닙니다. HWP5 XML 스트림과의 제품 검증 연결, HWPX 통합과 DTD·스키마·문서 의미 검증은 여전히 남아 있습니다.

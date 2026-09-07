# XML 선언·인코딩 시작 처리

[문자 입력 계약](xml-input.md) · [프로젝트 구조](project-structure.md)

## 범위와 출처

문서 entity의 BOM과 선택적 XMLDecl을 처리하는 시작 계층입니다. `prolog.open`이라는 이름이 전체 Prolog 문법(Misc/DTD 포함)의 완료를 뜻하지 않습니다. 루트 요소·태그·namespace·일반 PI·DTD·external TextDecl·스키마와 이력 복원은 아직 미구현입니다. 빈 입력도 시작 계층에서는 반환될 수 있으며 문서 유효성은 후속 문법 검사가 판단해야 합니다.

기준은 W3C XML 1.0 Fifth Edition의 [§2.8 XMLDecl](https://www.w3.org/TR/2008/REC-xml-20081126/#sec-prolog-dtd), [§4.3.3 인코딩](https://www.w3.org/TR/2008/REC-xml-20081126/#charencoding), [부록 F](https://www.w3.org/TR/2008/REC-xml-20081126/#sec-guessing)입니다. 문법과 인코딩 정책을 서로 다른 파일에서 관리합니다.

## 책임

- `src/xml/declaration.zig`: 입력 cursor에서 선택적 document XMLDecl을 원자적으로 읽습니다. version → encoding? → standalone? 순서, 필수 공백, 따옴표, 값 문법과 종료를 검사합니다. 일반 속성/엔터티 파서를 재구현하거나 선언 안에서 문자 참조를 치환하지 않습니다.
- `src/xml/encoding.zig`: 지원하는 BOM, UTF-16 선언 시작 서명, 외부 인코딩 지정을 조합합니다. 알려진 UTF-32/EBCDIC 서명은 미지원 오류로 거부합니다. 기본 인코딩은 UTF-8이며 압축/손상 후 fallback이 없습니다.
- `src/xml/prolog.zig`: 전체 입력 한도 → 인코딩 선택 → 서명 건너뛰기 → 선언 문법 → 인코딩 일치 순서를 조립합니다. 남은 문자 예산을 가진 기존 Input을 반환하므로 본문 시작에서 예산을 초기화하지 않습니다.

Declaration의 raw/version/encoding 바이트는 입력을 빌립니다. 선언을 읽지 않거나 오류가 나면 호출자의 offset·문자 예산을 바꾸지 않습니다. 값 비교는 명시적으로 ASCII 대소문자 동등성을 선택합니다. encoding 이름은 대소문자를 무시하고, version/standalone/필드 이름은 임의 소문자화하지 않습니다. standalone의 부재와 no를 구별합니다.

VersionNum은 `1.` 뒤 숫자가 하나 이상인 원문을 보존합니다. `1.00`·`1.123`도 구문상 허용하며 이 라이브러리의 문자 규칙은 XML 1.0을 유지합니다. `1.1`이라는 선언만으로 XML 1.1 줄바꿈이나 문자 규칙을 적용하지 않습니다. 2.0·불완전 숫자·문자 참조·중복/순서 위반은 구문 오류입니다.

`<?xml` 뒤 XML 공백이 있을 때만 선언 파싱으로 들어갑니다. xml-stylesheet 같은 일반 PI와 예약된 잘못된 PI target, 공백 뒤/본문 중간의 선언은 후속 문법 계층의 책임입니다. 따라서 null은 선언 미소비이지 나머지 입력의 XML 유효 판정이 아닙니다.

## 인코딩 계약

UTF-8, UTF-16LE, UTF-16BE와 generic UTF-16 선언을 처리합니다. 다른 문법상 유효한 이름은 UnsupportedXmlEncoding이며 alias·지역 코드페이지를 추측하지 않습니다. BOM·선택한 바이트 순서·선언이 충돌하면 XmlEncodingMismatch입니다. 외부 인코딩은 호출자가 보장하는 계약이며 이 API는 충돌한 선언을 무시하는 MIME 구현이 아닙니다.

generic UTF-16 선언에는 BOM을 요구합니다. BOM 없이 UTF-16 선언 시작 바이트로 발견한 입력에는 명시적인 일치 encoding 선언이 필요합니다. 반면 HWP5 컨테이너에서 이미 UTF-16LE로 지정한 텍스트는 외부 인코딩을 전달하여 선언 없는 입력을 읽을 수 있습니다. 이 외부 지정도 generic UTF-16 선언의 BOM 요구를 해제하지 않습니다.

BOM은 전체 바이트 한도에 포함하되 문자 예산에는 포함하지 않습니다. 두 번째 U+FEFF는 문자로 남기며 자동으로 중복 제거하지 않습니다. XMLDecl의 기본 바이트 한도는 4096이며 입력의 전역 바이트/정규화 후 문자 한도도 별도로 적용합니다. 선언 다음의 잘못된 문자는 반환 Input을 계속 읽을 때 거부됩니다. 선언 성공만으로 전체 문서 검증 완료라고 보고하면 안 됩니다.

## 실파일과 적대적 검증

기존 treatise sample.hwp의 이력 XML 다섯 payload는 모두 BOM·XMLDecl이 없는 UTF-16LE였습니다. Node 독립 압축 해제 원문을 사용하고 external_encoding=utf16le로 읽습니다. 일반 UTF-8 자동 선택과 섞지 않습니다. 기존 HWP5 컨테이너 검사에 자동 연결하지 않았으며 공개 JS API도 변경하지 않았습니다.

네이티브 검사는 선언 원문·borrowed 위치·미선택/실패 원자성, 순서/중복/따옴표/빈 값/이름/문자 참조, 잘림, UTF-8/양쪽 UTF-16/BOM/외부 지정 조합, generic UTF-16 BOM 필수, 미지원 인코딩, 바이트/문자/선언의 정확·부족 한도를 포함합니다. 선언 다음 NUL, 두 번째 BOM과 남은 예산도 검사합니다.

mode 119의 테스트 접두부는 external u8(0=자동, 1=UTF-8, 2=UTF-16LE, 3=UTF-16BE), max_bytes u32, max_declaration_bytes u32, 원문입니다. 외부 limit은 문자 예산입니다. 선택 인코딩/BOM/선언 바이트/값 길이/standalone/본문 시작 offset과 남은 본문의 digest를 반환합니다. mode 118의 digest 구현을 공유하여 테스트 serializer를 중복하지 않습니다. 제품 ABI가 아닙니다.

독립 JS 기준은 XML 공백을 명시한 선언 정규식과 Node TextDecoder이며, 기대 인코딩/offset은 입력 fixture에서 계산합니다. UTF-8·UTF-16 양쪽, BOM 유무, 외부 지정 유무, 두 따옴표와 여러 1.x 버전, CRLF, 비 BMP 본문, 잘림·충돌·정확/부족 예산·오류 후 복구 및 실제 이력 다섯 payload를 대조합니다.

첫 컴파일은 Zig의 orelse/비교식 결합을 잘못 작성해 실패했으며, 문자 추출과 비교를 두 문장으로 분리해 수정했습니다. 독립 정규식의 일반 `\s`도 XML 공백 집합보다 넓어 명시적인 공백 집합으로 고쳤습니다. 이 초기 실패/검증 도구 보완을 성공 실행으로 기록하지 않습니다.

적대적 재검토는 선언/PI 경계와 필드 문법, BOM/외부 지정/선언 충돌, 전체·선언·문자 예산과 실패 원자성, UTF-16 바이트 단위 잘림과 실제 표본, SSOT·미지원 경계의 다섯 관점으로 수행했습니다. UTF-16 선언의 바이트별 잘림, mode 접두부의 모든 잘림과 미지 인코딩, 비 XML 공백인 NBSP, 최대 u32 한도를 추가했습니다. 최종 집중 검증은 accepted 82/rejected 338이 통과했습니다. accepted는 대표 정상 대조 수이며 정확 한도 재호출 등 모든 호출의 합계는 아닙니다.

별도 수동 독립 확인으로 UTF-16LE/BE의 일치 선언·BOM 유무 네 조합을 현재 환경의 xmllint에 전달했습니다. 모두 status 0과 루트 이름 x를 반환했습니다. 이는 고정된 정상 입력의 상호운용성 관측이며 모든 외부 인코딩/표준 규칙의 증명이 아닙니다. 기본 audit에 외부 XML 도구 의존성을 추가하지 않았습니다.

## 실행 기록

Debug → ReleaseSafe → ReleaseFast 전체 audit는 각각 17/17 단계·네이티브 313/313이 통과했습니다. Debug 전체는 테스트 보강 전 1,827,040 checks이며, 이후 같은 선언 처리 로직의 Debug WASM에서 최종 집중 검사 accepted 82/rejected 338을 다시 통과했습니다. 최종 구성의 ReleaseSafe/ReleaseFast 전체는 각각 1,827,113 checks입니다. 기존 Node 47개·조사 22개·XML 외부 경계 6개도 통과했습니다. 검사 수치를 전체 XML 문법 지원률로 해석하지 않습니다.

전체 로그는 `/tmp/hwpjs-xml-prolog-{debug,safe,fast}.log`이고, Debug 집중 검증 산출물은 `.zig-cache/o/b13eb234abe2e00791f966df79c5f5ac/hwp5-probe.wasm`입니다. 캐시가 없어도 audit 재빌드로 최종 검사를 실행합니다. 포맷·변경 JS 문법·diff 검사와 변경 문서의 로컬 링크 12개 존재 확인도 통과했습니다.

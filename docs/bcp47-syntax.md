# BCP 47 문법·중복 검사

## 현재 범위

IANA 등록 검증은 별도 [등록 검사 API](bcp47-registry.md)에 추가했습니다. 아래 문법 API 자체의 계약과 과거 검증 기록은 변경하지 않습니다.

국제 텍스트 iTXt에서도 재사용하는 공통 언어 태그 기반입니다. [RFC 5646 §2.1](https://www.rfc-editor.org/rfc/rfc5646.html#section-2.1)의 ABNF와 [§2.2.9](https://www.rfc-editor.org/rfc/rfc5646.html#section-2.2.9)의 중복 variant/singleton 금지를 검사합니다. **이 문법 API는 IANA 등록 여부·extlang prefix·extension 내부 의미·권장 표기 변환·언어 매칭을 검사하지 않습니다.** [iTXt 소비자](png-international-text.md)는 별도 등록 검사 API를 통해 연결됩니다.

`text.bcp47.inspect(allocator, bytes, options)` 성공은 위 문법과 중복 조건만 통과했다는 뜻입니다. Report.registry_validated는 false입니다. RFC의 well-formed와 valid를 혼용하지 않습니다. 예약된 4글자 primary나 문법상 가능한 2~3개 extlang도 구조적으로 해석할 수 있지만, 실제 등록된 태그라는 보증은 아닙니다. 빈 문자열은 언어 태그가 아니므로 거부합니다. iTXt의 빈 언어 필드(미지정)는 iTXt 호출자가 별도로 처리합니다.

## 책임과 소유권

- `text/bcp47/types.zig`: 옵션·태그 종류·보고서.
- `tokens.zig`: ASCII 영숫자, 하이픈, 부분 태그 길이·개수·빈 부분 검사와 비할당 cursor.
- `grandfathered.zig`: RFC에 고정된 26개 전체 태그. 현재 IANA 등록 데이터의 대체물이 아닙니다.
- `parser.zig`: 단계별 문법 해석, variant 중복 집합과 singleton 비트 집합, 원문 구간 조립.

보고서는 원문과 language/extlangs/script/region/variants/extensions/private_use 슬라이스를 빌립니다. 입력 수명을 유지해야 하며 대소문자나 순서를 변경하지 않습니다. 비교만 locale과 무관한 ASCII 대소문자 무시로 수행합니다. 비어 있는 구간은 해당 요소의 부재입니다. private_use 구간은 x를 포함하고 private_count는 x 뒤의 부분 태그 수입니다.

variant 중복은 최대 8글자의 대소문자 무시 영숫자를 충돌 없는 정수 키로 만들어 hash map에서 검사합니다. 추가 메모리는 variant 수에 비례하며 성공/실패 모두 호출 안에서 해제합니다. extension/private-use 안에서 반복되는 문자열을 variant 중복으로 오인하지 않습니다. 고정된 grandfathered 태그는 전체 태그가 일치할 때 우선 처리합니다.

기본 한도는 4096바이트·512개 부분 태그이며 호출자가 조절할 수 있습니다. 이는 RFC의 언어 태그 최대 길이가 아닙니다. 초과 시 LimitExceeded를 반환하고 자르지 않습니다. [§4.4.1](https://www.rfc-editor.org/rfc/rfc5646.html#section-4.4.1)의 제한 명시 원칙에 따라 이 동작을 분리합니다. 코어는 네트워크나 로컬 언어 설정을 조회하지 않습니다.

## 검증

네이티브는 구간별 원문·개수, grandfathered 대소문자, private-use, 잘못된 순서·문자·길이·중복, primary의 전체 바이트 값, 정확한 한도, 8191바이트 태그의 명시적 한도 확대, 모든 variant 집합 할당 실패 정리를 검사합니다.

테스트 전용 WASM mode 137 입력은 u32 LE 부분 태그 한도 + 원문이며 외부 limit는 원문 바이트 한도입니다. 출력은 21개 u32 LE: 종류(일반 0/private 1/grandfathered 2), 전체 부분 태그 수, extlang/variant/extension/private 개수, registry 플래그, 위 7개 구간의 offset/length 쌍. 미존재 구간은 0/0입니다.

독립 JS는 ABNF 정규식의 capture index와 중복 집합을 사용하며 제품 cursor나 키 인코딩을 재사용하지 않습니다. 등록 데이터나 canonicalization 정책이 다른 Intl API를 문법 기준으로 사용하지 않습니다. 생성 조합·바이트 치환·고정 seed 무작위 태그·한도·실패 후 회복을 정규 audit에 포함합니다.

Debug·ReleaseSafe·ReleaseFast 전체 audit를 순차 실행해 각각 17/17 단계, 네이티브 379/379, 감사 스크립트 3,219,852 checks를 통과했습니다. 전용 결과는 정상 4,582건·거부 23,758건(바이트/부분 태그 한도 미달 포함)이며 바이트 치환·무작위 입력은 16,520건입니다. PNG/HWP 실파일에서 언어 태그를 추출해 비교한 결과는 아니며, 실제 iTXt 연결 검증과 구분합니다.

추가 수동 적대적 검사에서는 명시적으로 한도를 늘려 서로 다른 variant 4,096개를 처리했고, 원문 구간과 개수가 독립 기대값에 일치했습니다. 첫·중간·마지막 variant를 대소문자를 바꿔 끝에 재삽입한 세 경우 모두 DuplicateLanguageVariant로 거부했습니다. 이 추가 검사는 정규 audit 횟수에 포함하지 않습니다. 포맷·변경 JS 문법·관련 로컬 문서 링크 30개·diff 공백 검사도 통과했습니다.

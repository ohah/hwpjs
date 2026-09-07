# BCP 47 등록 검증

## 계약과 남은 범위

`text.bcp47_registry.inspect(allocator, bytes, options)`는 [문법 검사](bcp47-syntax.md)를 재사용한 뒤 primary language·script·region·variant 등록 여부, extlang의 단일 개수와 필수 Prefix, extension singleton 등록 여부를 검사합니다. 원문 구간과 대소문자는 보존합니다. private-use와 RFC에 고정된 grandfathered 태그는 별도 등록 조회 없이 허용합니다.

근거는 [RFC 5646 §2.2.2](https://www.rfc-editor.org/rfc/rfc5646.html#section-2.2.2), [§2.2.6](https://www.rfc-editor.org/rfc/rfc5646.html#section-2.2.6), [§2.2.9](https://www.rfc-editor.org/rfc/rfc5646.html#section-2.2.9)입니다. 문법상 가능한 두 번째·세 번째 extlang은 등록 단계에서 거부합니다. variant Prefix와 Suppress-Script 권고를 강제 거부 조건으로 취급하지 않습니다. 폐기된 코드도 등록된 값이면 허용하며 Preferred-Value로 자동 치환하지 않습니다.

Report.syntax.registry_validated=true는 고정된 등록부에 대한 위 검사 성공입니다. `extension_semantics_deferred`는 등록된 extension의 내부 어휘를 검증하지 않은 개수입니다. `en-u-zz-foobar`는 singleton 등록 검사에는 성공하지만 내부 의미 검증은 보류됩니다. canonicalization·언어 매칭·iTXt 연결·HWPX 통합·제품 JS API는 이 단계의 범위가 아닙니다.

## 데이터와 SSOT

선택된 식별자와 extlang Prefix의 단일 출처는 `src/text/bcp47/data/source.json`입니다. 공식 [IANA Language Subtag Registry](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry)의 File-Date는 2026-08-08, [Language Tag Extensions Registry](https://www.iana.org/assignments/language-tag-extensions-registry/language-tag-extensions-registry)는 2014-04-02입니다. 원본 전체의 SHA-256과 출처 URL을 source.json에 기록합니다. 원본 설명·권장 표기·variant Prefix 등은 이 축약 파일에 포함하지 않습니다. 외부 파서 코드를 가져온 것이 아닙니다.

`tools/language-registry.mjs`가 private-use 범위를 포함해 고정 폭 정렬 테이블과 날짜 상수를 결정적으로 생성합니다. `registry_data.zig`는 테이블 조회만, `registry.zig`는 문법 결과와 등록 규칙 조립만 담당합니다. 빌드·파싱 중 네트워크 요청은 없습니다. `--check`는 로컬 축약 데이터와 파생 파일의 일치를 확인할 뿐, 원본 해시를 원격에서 재검증하지 않습니다.

원본 레코드는 language 8,276·script 225·region 305·variant 139·extlang 258개입니다. 범위 확장 뒤에는 각각 8,795·274·343·139·258개이며 extension singleton은 t/u 2개입니다. API는 입력을 빌리며 문법 검사 임시 메모리를 호출 내 해제합니다. 기본 입력/부분 태그 한도는 문법 API와 공유합니다.

## 검증 구성

네이티브는 모든 테이블의 정렬·폭·중복·대소문자 조회, extlang Prefix 등록, private-use 범위와 폐기 코드, 등록 실패 시 할당 정리를 검사합니다.

테스트 전용 WASM mode 138은 mode 137과 같은 입력을 받습니다. 출력은 기존 84바이트 문법 보고서에 u32 LE 5개(조회 횟수, Prefix 검사 여부, extension 의미 보류 개수, 하위 태그 등록부 날짜, extension 등록부 날짜)를 추가한 104바이트입니다. 날짜는 YYYYMMDD이며 제품 날짜 상수에서 변환합니다. 문법 보고서 직렬화는 두 모드가 공유합니다.

독립 JS는 source.json의 범위를 문자열 구간 비교로 검사하고 제품의 확장 테이블·이진 검색을 재사용하지 않습니다. 2/3글자 primary 전체, 4글자 script 전체, 2글자/3자리 region 전체, 모든 등록 variant/extlang 및 잘못된 Prefix, private-use·grandfathered·중복·한도·생성기 손상 입력을 비교합니다. 실제 PNG/HWP의 iTXt 비교 결과가 아니라 합성 언어 태그 검증입니다.

초기 HWP5 Debug 감사는 통과했습니다(`/tmp/hwpjs-bcp47-registry-focused.log`). 이후 등록부 모든 항목의 양 끝값과 생성기 손상 검사를 보강한 최신 전용 WASM 실행은 정상 19,194건·거부 468,057건이 독립 기준과 일치했습니다. 네이티브 선택 실행은 root 진입 테스트 포함 4/4 통과했습니다. 공식 IANA 두 원본을 다시 내려받아 축약 내용과 SHA-256의 일치도 확인했습니다. 관련 로컬 문서 링크 37개와 포맷·JS 문법·diff 공백 검사를 통과했습니다.

최종 변경 상태의 Debug·ReleaseSafe·ReleaseFast 전체 회귀 검증을 순차 실행해 각각 17/17 단계, 네이티브 382/382개, HWP5 감사 스크립트 3,707,103 checks를 통과했습니다. 세 모드 모두 등록 전용 결과는 정상 19,194건·거부 468,057건입니다. 로그는 `/tmp/hwpjs-bcp47-registry-{Debug,ReleaseSafe,ReleaseFast}.log`에 남겼습니다. 이 결과는 전체 HWP/PNG 명세 구현 완료를 의미하지 않습니다.

추가 수동 적대적 검사 146건도 통과했습니다. 모든 등록 variant 139개를 포함한 1,058바이트 태그의 결과를 독립 기대값과 비교하고, 각 variant를 대문자로 바꿔 끝에 중복 삽입한 139건을 거부했습니다. 테스트 입력 헤더의 0~3바이트 잘림, 바이트 한도 미달과 실패 뒤 정상 호출 회복도 확인했습니다. 이 추가 실행은 정규 audit 집계에 포함하지 않습니다.

# XML 문서 구조 검증

## 범위와 책임

`src/xml/document.zig`의 `inspect`는 입력 끝까지 읽어 단일 루트, 시작/종료 태그 이름과 중첩, 루트 밖 공백·주석·PI, 본문·CDATA를 검사합니다. 기준은 [W3C XML 1.0 Fifth Edition](https://www.w3.org/TR/2008/REC-xml-20081126/)의 문서·CharData·Comment·PI·CDSect·element 문법입니다.

**DTD를 포함한 전체 XML 지원은 아닙니다.** DOCTYPE은 `UnsupportedXmlDtd`, 본문/속성의 미해결 엔터티는 `UnresolvedXmlEntity`로 거부합니다. 외부 파일이나 네트워크를 조회하지 않습니다. 기본 모드의 `namespaces_validated`는 false이며, `<p:r/>`의 구조 검사 성공은 prefix 바인딩 성공을 뜻하지 않습니다. `validate_namespaces = true`의 추가 검사·예산은 [namespace 검증](xml-namespaces.md)이 소유합니다. HWPML/HWPX 스키마·필드 의미, DiffML 복원, ZIP 연결, 문서 모델과 편집·저장은 후속 범위입니다. 제품 JS API는 여전히 CFB만 제공합니다.

- `document.zig`: 루트 상태, 빌린 이름의 스택, 태그 짝, 문서 전체 예산과 scalar 보고서.
- `markup.zig`: 주석·CDATA·PI 구분과 종결 문법. 참조 해석이나 PI 실행은 하지 않습니다.
- `content.zig`: 본문 literal/reference 구분, 루트 밖 공백, literal `]]>` 금지와 문자 수.
- `token_cursor.zig`: 태그·본문·markup이 공유하는 토큰 바이트 예산. 기존 `tag_cursor.zig`를 일반화한 이름입니다.
- 기존 [입력](xml-input.md), [선언](xml-declaration.md), [이름·참조](xml-names-references.md), [태그·속성](xml-tags.md)의 규칙은 재구현하지 않습니다.

스택의 이름과 태그 원문은 입력을 빌립니다. 스택 및 임시 속성 배열만 할당하며 정상 반환·잘못된 종료 태그·할당 실패 모두 해제합니다. 반환값은 통계이며 AST나 복원 가능한 문서 모델이 아닙니다.

## 경계와 예산

입력 바이트·문자·선언 한도는 prolog 옵션, 태그·이름·참조 한도는 tags 옵션을 사용합니다. 별도로 markup 한 토큰과 연속 본문 한 구간의 기본 바이트 한도는 각각 16 MiB입니다. 문서 전체 요소·이벤트·속성·참조 기본 한도는 각각 1,000,000, 깊이는 256입니다. 태그별 한도와 문서 전체 잔여 한도를 함께 적용합니다.

빈 요소도 깊이와 요소 수에 포함합니다. 이벤트는 태그/주석/CDATA/PI 또는 연속 본문 한 구간이며 루트 밖 공백 구간도 포함합니다. `text_scalars`는 루트 안의 정규화된 literal·문자 참조·CDATA 문자 수이며 주석·PI·루트 밖 공백은 제외합니다. `characters`는 선언을 포함하고 BOM을 제외한 정규화 입력 문자 수입니다. 바이트 한도는 원본 인코딩 기준입니다.

본문의 다음 `<`는 다음 토큰에 남기며 본문 예산에 넣지 않습니다. 참조에서 생성된 CR은 다시 LF로 바꾸지 않습니다. literal `]]>`는 거부하지만 `]]&gt;`는 허용합니다. CDATA는 첫 `]]>`에서 끝나므로 `<![CDATA[]]]>`의 본문은 `]` 하나입니다. PI 대상 뒤 데이터에는 XML 공백이 필요하며 데이터 없는 `<?p?>`는 허용합니다.

## 실파일 대조

`tests/hwp5/xml-document.mjs`는 `reference/rhwp/samples/basic/treatise sample.hwp`를 strict CFB로 읽고 이력 XML 5개 전체를 검사합니다. 기존 태그 검사의 루트 토큰만 읽는 범위와 구분합니다. 별도 JS 순회 oracle과 테스트 WASM mode 123의 통계를 비교합니다. JS oracle은 선언 문법 검증기를 재구현하지 않으며 선언의 부정 사례는 기존 선언 테스트가 소유합니다.

| XML | 원본 바이트 | 요소 | 속성 | 본문 scalar | 최대 깊이 |
|---|---:|---:|---:|---:|---:|
| VersionLog 0 | 20 | 1 | 0 | 0 | 1 |
| VersionLog 1 | 6,410 | 132 | 129 | 4 | 8 |
| VersionLog 2 | 19,788 | 289 | 466 | 0 | 7 |
| VersionLog 3 | 81,082 | 897 | 1,071 | 14,948 | 10 |
| 마지막 문서 | 13,184,598 | 1,235 | 4,696 | 6,509,959 | 17 |

2026-09-07 별도 읽기 전용 `xmllint` 대조에서도 요소·속성·본문 scalar·주석·PI 수가 모두 일치했습니다. 주석과 PI는 모두 0입니다. `history-xml-query.mjs`의 DTD 차단·입력/출력/시간 한도를 사용하고, 외부 도구에 넘기는 복사본에만 UTF-16LE BOM을 보충했습니다. XPath는 `count(//*)`, `count(//@*)`, `string-length(string(/*))`, `count(//comment())`, `count(//processing-instruction())`입니다. namespace 선언은 XPath 속성 축과 다르므로 이 대조를 namespace 검증으로 확대하지 않습니다. 외부 도구는 제품 의존성이나 기본 audit 요구사항이 아닙니다.

## 적대적 검증

재현하여 수정한 오류:

1. `<r>A&#13;</r>`의 본문 한도 6바이트에서 다음 `<`를 예산에 포함하여 `LimitExceeded`가 발생했습니다. 본문 구분자 lookahead를 토큰 소비와 분리했습니다. 정확 한도 6과 부족 한도 5를 네이티브와 3개 인코딩 WASM에서 검사합니다.
2. `<?p??><r/>`, `<?p?a?><r/>`를 PI로 잘못 허용했습니다. 네이티브 거부 테스트 실패와 외부 파서 거부를 확인한 뒤, 즉시 `?>` 종결과 공백 뒤 데이터 분기를 분리했습니다.

추가 검사는 잘림 전체 위치, 루트 누락/복수, 교차·불일치 종료, 루트 밖 참조/CDATA, 중간 XML 선언, 주석의 `--`, 미해결 엔터티, NUL 후미, 전역 한도의 정확/부족 값, 실패 후 재사용, 스택·속성 할당 실패를 포함합니다. 주석·CDATA·PI의 0이 아닌 시작 offset에서 토큰 한도, CRLF 원본 2바이트/정규화 1문자, CDATA 종결 직전 여분 `]`도 네이티브에서 확인합니다.

기본 실행 명령은 [개발·검증 명령](development-commands.md)의 세 모드 audit를 사용합니다. Debug·ReleaseSafe·ReleaseFast 모두 17/17 단계, 네이티브 327/327 테스트, HWP5 감사 스크립트 3,081,655 checks를 통과했습니다. XML 문서 전용 WASM 검사는 정상 42건·거부 427건이며 정상 건에는 실파일 XML 5개가 포함됩니다. 이는 호출/테스트의 수이지 지원률이 아닙니다.

마지막 네이티브 경계 사례는 첫 Debug/Safe audit 후 추가했습니다. 해당 추가분까지 포함한 최종 Debug/Safe `zig build test`도 각각 327/327 통과했고 ReleaseFast 전체 audit에는 처음부터 포함되었습니다. 포맷·변경 JS 문법·문서 로컬 링크 32개도 검사했습니다. 이 파트의 통과가 전체 문서 지원이나 결함 부재를 보장하지는 않습니다.

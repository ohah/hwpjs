# HWPX 본문 수식 원문·script 검사

`src/hwpx/equation.zig`는 구조 검사에서 선택한 2011 section 트리의 `hp:run` 직접 자식 `hp:equation`만 순서대로 검사합니다. `Document.inspectEquations()`는 트리를 임시로 읽어 보고서를 독립 소유하고, `XmlTrees.inspectEquations()`는 이미 읽은 트리를 재사용합니다. `Document.inspectKnown()`도 같은 검사기를 사용합니다. `Report.deinit()`은 내부 arena와 모든 수식 원문·필드·script 문자열을 해제합니다. 호출자가 문서·ZIP 바이트·XML 트리를 먼저 해제해도 보고서는 유효합니다.

[한컴 공개 OWPML 모델의 EquationType](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/EquationType.cpp)은 공통 도형 자식 `sz`, `pos`, `outMargin`, `caption`, `shapeComment`, `parameterset`, `metaTag`와 직접 `script`, 전용 속성 `version`, `baseLine`, `textColor`, `baseUnit`, `lineMode`, `font`를 구분합니다. [AbstractShapeObjectType](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/AbstractShapeObjectType.cpp)은 상속 속성 일곱 개를, [Script 타입](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/script.h)은 문자열 값 객체를 정의합니다. 이 코드는 해당 모델의 구현을 복사하지 않고 XML 원문을 관측합니다.

## 반환 계약

공통 도형 자식의 소유 필드와 진단은 [수식 도형 자식·필드](hwpx-equation-shapes.md)가 별도 계약을 소유합니다. 아래 기타 자식 개수의 기존 의미는 유지합니다.

- 각 수식은 section 순번·요소/부모 run 인덱스, 정확한 수식 요소 XML 조각, 여섯 전용 속성의 부재/빈 값/정규화된 UTF-8 값, 직접 script의 시작 인덱스·개수, 기타 직접 자식 개수를 보존합니다. XML 조각은 조상에 선언된 namespace를 따로 복제하지 않으므로 독립 XML 문서라고 주장하지 않습니다.
- 각 직접 script는 수식과 요소 인덱스 및 문자 참조·CDATA를 정규화한 직접 문자 내용을 소유합니다. 빈 script와 중복 script를 버리지 않고 구분합니다. 직접 script에 하위 요소가 있으면 `InvalidEquationScriptChild`로 거부합니다. 이는 수식 문법 검사나 수식 렌더링이 아닙니다.
- 공통 도형 속성 일곱 개는 `shape_xml_fields.zig`의 기존 어휘 검사·집계를 재사용하며 값 자체는 수식 XML 원문에 남습니다. 전용 `baseLine`·`baseUnit`은 unsigned32를 검사하고, `textColor`의 여섯 자리 16진수 어휘는 브러시와 같은 `xml_values.zig`를 사용합니다. 모르는 `lineMode`·`#RRGGBB`가 아닌 `textColor`, 모르는 직접 자식·속성, script 부재/중복, run 밖 수식은 별도 진단합니다. 미지 값을 임의 기본값으로 치환하지 않습니다.
- 기본 상한은 수식·script 각각 100,000개, 기타 직접 자식 1,000,000개, 단일 속성 해독 4 KiB, 단일 script 정규화 1 MiB, 복제한 원문·속성·script 바이트 합계 128 MiB입니다. `max_owned_bytes`는 이 복제 바이트의 상한이며 배열·해시맵·arena 메타데이터의 실제 할당량 상한은 아닙니다. XML 트리 자체는 별도 `XmlTreesOptions`가 제한합니다.

## 검증과 남은 범위

합성 테스트는 XML 원문·CDATA/문자 참조, 기본 namespace와 두 UTF-16 바이트 순서, 속성 부재/빈 값, 상속 필드, namespace/부모 위장, 중복/누락 script, 숫자 경계, 모든 할당 실패, 독립 수명 및 패키지/known 호출을 검사합니다. 최초 독립 ZIP/ElementTree oracle은 각 실파일의 section 순번·여섯 속성의 부재/값·직접 script 문자열과 순서·기타 직접 자식 개수를 SHA-256으로, 추가 속성은 개수로 비교했습니다. 이후 확장한 도형 자식의 종류·위치·필드 대조는 [별도 검증 계약](hwpx-equation-shapes.md)이 소유합니다. 재현 명령은 [개발·검증 명령](development-commands.md)에 둡니다.

로컬 두 corpus의 `.hwpx` 484개 중 ZIP 종료 레코드 거부 6개와 암호화 2개를 분리한 476개/section 544개를 ReleaseFast Zig 조사와 독립 Python 조사로 대조했습니다. 수식이 있는 문서 28개에서 run 직접 수식 23,236개, 직접 script 23,236개, 정규화 UTF-8 script 429,953바이트가 파일별로 일치했습니다. 직접 기타 자식 69,819개, 추가 속성 0개, script 부재/중복 0개도 일치했습니다. Zig 조사기는 파일마다 2 GiB 한도를 가진 별도 디버그 할당자로 검사하고 반환 후 요청 메모리 0바이트를 확인합니다. 이 corpus의 script 문자 수와 UTF-8 바이트 수는 다르며, 바이트 수를 글자 수로 보고하지 않습니다. 비준수 XML·다른 OWPML 버전 및 수식 문법의 올바름은 이 대조로 증명하지 않습니다.

최초 script 구현 단계의 전체 Debug `zig build test --summary all`은 2,561/2,561, 수식 집중 테스트는 Debug·ReleaseSafe·ReleaseFast에서 각각 8/8, `zig build -Doptimize=ReleaseSafe`와 `zig fmt --check build.zig src`도 통과했습니다. `inspectKnown`의 선택 실파일 8개 shard도 별도 ReleaseFast 프로세스로 모두 통과했으며, 이 실행은 기본 전체 테스트에 포함되지 않습니다. 후속 표 검사 실패 시 수식 보고서의 메모리 회수도 합성 테스트의 디버그 할당 회계에서 0바이트로 확인했습니다.

최초 단계는 직접 script 문자열의 보존을 증명했고, 이후 [공통 도형 자식·필드](hwpx-equation-shapes.md)의 원값 검사가 추가됐습니다. script 문법·수식 의미, `sz`/`pos`/여백/색상 적용, 글꼴 연결, 조건부 분기의 활성 선택, 중첩 도형 의미, 마스터페이지 수식, 편집·저장·무손실 왕복 및 2011 이외 OWPML namespace는 남아 있습니다. `inspectKnown()` 성공이나 raw XML 보존만으로 전체 HWPX 문서가 유효하거나 완전하게 해석됐다고 판정하지 않습니다.

# HWPX section 원문·요소 구조 인덱스

`Document.readSectionTree(allocator, section_ordinal, options)`는 [header·spine 구조](hwpx-document-structure.md)가 선택한 한 section을 읽습니다. 선택 기준과 section 순번은 기존 구조 계층이 소유하고, XML 문법·namespace·깊이 검사는 [공통 XML 입력](xml-input.md) 및 `document_xml.visitBytes`를 재사용합니다. 반환 `SectionTree`는 해제된 section XML의 정확한 원문 바이트를 복사해 소유하므로 ZIP 문서와 입력 바이트를 먼저 해제해도 유효합니다. 사용 후 `deinit(allocator)`을 호출해야 합니다.

인덱스는 section의 **모든 XML 요소**를 원문 순서대로 저장합니다. 각 요소에는 확장된 namespace URI와 인코딩된 local name, 부모·첫/마지막 자식·다음 형제 인덱스, 시작·끝 태그의 원문 byte span 및 전체 요소의 끝 위치가 있습니다. 빈 태그는 별도 끝 태그가 없고 시작 태그의 끝이 요소의 끝입니다. `sourceOf(index)`는 해당 요소의 시작 태그부터 끝 태그까지 원문 byte slice를 돌려줍니다. prefix 재바인딩은 파싱 당시의 namespace scope로 확정하므로 같은 철자의 이름도 URI가 다르면 구분됩니다.

`Tree.attributeValue(allocator, element_index, namespace_uri, local_name)`은 해당 요소의 확장된 이름에 맞는 XML 속성 값을 지연 조회합니다. `null`은 속성이 없는 경우이며 빈 문자열 속성은 값이 있는 것으로 반환됩니다. 반환 `Value`의 원문 slice는 `Tree.source`를 빌리므로 트리를 해제하면 사용할 수 없습니다. 문자 참조·개행 등을 반영한 UTF-8 값은 공통 XML `Value.toUtf8(allocator, max_bytes)`로 별도 할당해 얻고 사용 후 해제합니다. 비접두 속성에는 기본 namespace를 적용하지 않습니다. 접두 속성은 해당 요소까지의 조상 namespace 선언을 재구성하여 URI로 구분합니다. 조회마다 시작 태그를 다시 파싱하며 접두 속성은 조상도 순회하므로 대량 속성을 한 번에 인덱싱하는 API는 아직 없습니다.

이 단계는 속성 조회를 제공하지만 속성·일반 텍스트·CDATA·주석·처리 지시문을 별도 구조 노드로 제공하지 않습니다. XML 선언/BOM도 원문에 남습니다. 따라서 인덱스만으로 글자 모양, 표의 화면 순서, 조건부 분기, 필드 의미, 렌더링, 편집, 저장 또는 전체 OWPML 스키마 적합성을 주장하지 않습니다. 의미 해석기는 이 원문·계층을 입력으로 삼고 미지원 요소를 몰래 버리지 않아야 합니다.

원문 문자·CDATA 조각의 부모 요소 연결은 별도 [section 직접 콘텐츠 순회](hwpx-section-content.md)가 소유합니다.

한 section의 기본 상한은 해제 XML 128 MiB, 인덱스 요소 200만 개이며 공통 XML 이벤트·속성·참조·깊이 제한도 적용됩니다. `readSectionTree`는 지정 section을 읽기 전에 구조 검사를 다시 수행하므로 여러 section을 연속해서 읽을 때는 구조 XML을 반복 해제합니다. 대량 문서 조립용 캐시/배치 API는 아직 없습니다.

## 검증

합성 테스트는 원문 byte span·계층·미지원 요소·namespace 재바인딩, 속성의 부재/빈 값·접두 재바인딩·문자 참조·UTF-16 조회, 문서 해제 후 독립 소유권, 잘못된 루트·불일치 끝 태그·DTD·미결합 prefix·정확한 크기/요소 한도 및 모든 할당 실패 경로를 검사합니다. 선택 실파일 조사는 [개발·검증 명령](development-commands.md)에 분리하며, 독립 Python XML 파서의 전체 요소 수와 여섯 선택 속성의 값·부재를 section별 SHA-256으로 비교합니다.

로컬 두 corpus의 HWPX 484개에서 ZIP 종료 레코드가 없는 6개·암호화 2개를 제외한 476개 문서, 544개 section, XML 요소 2,174,716개를 확인했습니다. 독립 Python `ElementTree` 집계와 8개 shard 각각의 문서·section·요소 수가 일치했습니다. 가장 큰 단일 section은 XML 10,443,753바이트·요소 133,721개였습니다. 제품 조사에서는 각 요소의 byte 범위가 부모 안에 있고 형제 순서가 겹치지 않으며, 모든 비루트 요소가 부모의 자식 연결 목록에 정확히 한 번 등장하고 마지막 자식 인덱스가 맞는지 확인했습니다.

속성 대조 대상은 paragraph의 `id`·`paraPrIDRef`·`styleIDRef`·`pageBreak`와 run의 `charPrIDRef`·`charTcId` 여섯 필드입니다. 독립 Python 파서의 집계에서 앞의 네 필드는 각각 215,146개, `charPrIDRef`는 267,347개이며 `charTcId`는 이 corpus에서 관측되지 않았습니다. 이 여섯 필드의 빈 값도 관측되지 않았습니다. 값이 없는 필드는 해시에 별도로 기록하므로, 존재하는 필드의 값만 비교한 결과는 아닙니다. Zig와 Python의 정규화 값·부재를 section별 SHA-256으로 기록한 뒤 순서 독립적인 shard 합계를 비교해 8개 shard 모두 일치했습니다. 이는 특정 필드·corpus의 일치 검증이지 모든 OWPML 속성이나 버전별 의미의 완전한 지원 증거는 아닙니다.

한 프로세스로 corpus 전체를 도는 초기 조사는 `SIGKILL`로 끝났습니다. 같은 입력을 8개 독립 프로세스로 분할한 뒤 각 shard를 통과시켰으며, 초기 종료 원인을 파서 오류라고 단정하지 않습니다. 분할 실행은 전체 파일 범위를 유지하지만 동시에 모든 section을 소유하는 메모리 사용량이나 문서 편집·재저장 동치를 검증하지 않습니다.

구조 연결 목록을 적대적으로 재검토해 부모 번호만 맞고 자식 체인에서는 누락되는 경우도 실패하도록, 모든 비루트 요소가 정확히 한 번 연결되는 검사와 첫·마지막 자식 일치 검사를 추가한 뒤 8개 shard를 다시 통과시켰습니다. 그때 `zig fmt --check build.zig src`, `git diff --check`, 기본 `zig build test --summary all` 2,160/2,160개, 구조 인덱스 Debug·ReleaseFast 전용 각 6/6개, ReleaseSafe 제품 빌드·기존 JS 비교 47/47개와 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all`이 통과했습니다. 속성 조회를 추가한 뒤 기본 테스트는 2,162/2,162개, Debug·ReleaseSafe·ReleaseFast 구조 인덱스 전용 테스트는 각 8/8개가 통과했습니다. 기본 감사에는 선택 shard 실파일 조사가 포함되지 않습니다.

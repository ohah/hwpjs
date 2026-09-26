# HWPX section metaTag 직접 텍스트

## 근거와 범위

[한컴 공개 OWPML 모델의 MetaTag](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/MetaTag.cpp)는 문자열 값 객체이며, [fieldBegin](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/fieldBegin.cpp)은 `metaTag`를 자식으로 등록합니다. 수식·표에도 같은 공통 도형 자식 이름이 있습니다. 공개 모델 코드는 이식하지 않았습니다.

`Document.inspectMetaTags()`는 선택된 2011 HWPX section의 **모든 `hp:metaTag`**를 순서대로 소유 보고서에 담습니다. `XmlTrees.inspectMetaTags()`는 기존 section 트리를 재사용하고 `Document.inspectKnown().meta_tags`도 같은 검사기를 호출합니다. header·master-page와 다른 namespace 버전은 이 API의 범위 밖입니다.

## 반환 계약

`src/hwpx/meta_tags.zig`가 선택·소유권·예산을 맡고, 공통 section 트리의 문자 이벤트와 `xml_direct_text.zig`의 누적·한도 함수를 재사용합니다. 각 `Tag`는 section 순번, 원래 요소·부모 인덱스, 소유한 부모 URI·로컬 이름, 정확한 XML 원문, **직접** 문자·CDATA·문자 참조를 정규화한 UTF-8 문자열, 직접 하위 요소·미등록 속성 수를 반환합니다. 빈 요소는 빈 문자열로 남고 중복·순서도 보존됩니다. 하위 요소의 본문은 `value`에 섞지 않지만 원문과 자식 수로 남깁니다. XML 트리·문서·ZIP 입력을 먼저 해제해도 결과는 유효합니다.

기본 한도는 요소 100,000개, 부모 URI·로컬 이름 각각 4 KiB, 단일 직접 텍스트 1 MiB, 복제 원문·부모 이름·텍스트 합계 128 MiB입니다. 이는 실제 arena·배열·해시맵 메타데이터를 포함한 프로세스 메모리 상한이 아닙니다. `Report.deinit()`으로 결과를 해제합니다.

## 검증·남은 범위

합성 검사는 엔터티·CDATA·문자 참조, 빈 값·중복·수식 부모, 외부 namespace 부모와 외부 `metaTag` 제외, 하위 요소·tail의 직접 텍스트 구분, 양쪽 UTF-16, 정확한 원문·독립 수명, 값·소유 바이트 한도, 모든 할당 실패 및 known 후속 실패의 메모리 회수를 포함합니다. 독립 Python ZIP/ElementTree oracle은 OPF spine section을 따로 선택해 부모 확장 이름·위치·직접 텍스트·미등록 속성·하위 요소 수의 **파일별 해시**를 대조합니다. 값·속성·부모·namespace·중첩 변이를 oracle self-test로 검사합니다. 재현 명령은 [개발·검증 명령](development-commands.md)에 둡니다.

로컬 corpus의 실제 `hp:metaTag`는 4건으로 모두 `hp:fieldBegin` 아래에 있었고, 각각 정규화 UTF-8 18바이트이며 속성·하위 요소가 없었습니다. 독립 oracle과 제품은 HWPX 484개 후보를 허용 476개·ZIP 종료 레코드 거부 6개·암호화 2개로 동일하게 분류했고, 허용 파일 476개의 파일별 해시가 모두 일치했습니다. 기존 수식 script·shapeComment 및 파라미터 값의 파일별 해시도 공통 누적 함수로 정리한 뒤 다시 일치했습니다. 따라서 수식·표 부모의 `metaTag`는 합성 테스트 근거만 있습니다. 문자열 보존은 태그 값의 제품 의미, JSON 구조, 표시·편집·저장·무손실 왕복을 뜻하지 않습니다.

2026-09-26 최종 코드에서 Debug 전체 `zig build test --summary all`은 2,591/2,591 통과했습니다. metaTag 집중 테스트는 Debug·ReleaseSafe·ReleaseFast 각각 7/7, 공통 문자 경로를 공유하는 수식 24/24·파라미터 9/9도 세 모드 모두 통과했습니다. `zig build -Doptimize=ReleaseSafe --summary all`, `zig fmt --check build.zig src`, 독립 Python oracle 일반/`-O` self-test, 실제 known 양성 4건, 기존 known 문서 shard 0~7 및 세 파일별 corpus 대조도 통과했습니다. 실파일 검사와 shard는 기본 전체 테스트 밖에서 실행했습니다.

적대적 검토는 (1) 공식 문자열 모델과 실파일 분포, (2) namespace·부모·원문 순서, (3) 문자 정규화·중첩·빈 값, (4) 예산·OOM·패키지 해제 후 소유권, (5) 독립 oracle 변이와 파일별 대조 및 known 연결을 별도로 확인합니다. 위 범위 밖의 스키마·문서 모델 완성은 주장하지 않습니다.

2026-09-27 재검증: 한컴 고정 버전의 문자열 값 객체 및 `fieldBegin` 자식 정의와 현재 `meta_tags.zig`·공통 직접 텍스트 누적 경계를 대조했습니다. 집중 필터는 Debug·ReleaseSafe·ReleaseFast 각각 7/7, 양성 4개 파일의 단독/known 연결은 1/1, 독립 오라클의 일반·`-O` 자체검사는 각각 통과했습니다. 전체 파일별 대조는 허용 476개·ZIP 거부 6개·암호화 2개, 태그 4개·텍스트 72바이트로 다시 일치했습니다. 양성 4개를 별도 ZIP/XML로 열어 각각 `fieldBegin` 직접 자식·텍스트 18바이트·속성/하위 요소 0개임을 확인했습니다. 앞서 같은 제품 코드에서 통과한 known-inspections 8개 shard는 이번에 다시 실행하지 않았습니다. 태그 값의 제품 의미·표시·저장은 이 결과로 검증되지 않습니다.

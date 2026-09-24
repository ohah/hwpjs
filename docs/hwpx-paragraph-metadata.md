# HWPX 문단 메타 속성 검사

`XmlTrees.inspectParagraphMetadata(allocator, options)`는 이미 소유한 section XML 트리의 원문을 공통 XML 방문기로 순회합니다. 2011 paragraph namespace의 모든 `p`에 대해 `id`·`paraTcId`의 `xs:nonNegativeInteger` 값 제약과 `pageBreak`·`columnBreak`·`merged`의 `xs:boolean` 표기를 검사합니다. XML 스키마의 공백 정규화를 따라 앞뒤 공백을 허용하고, 정수는 임의 길이 십진수로 검사해 기계 정수 폭 때문에 유효한 값을 거부하지 않습니다. `-0`도 값 0으로 유지합니다. 반환 보고서는 전체 문단 수, `id` 부재·명시적 0, `paraTcId` 부재, 각 Boolean의 부재·false·true를 구분합니다. 결함 있는 값은 오류이며, 누락된 `id`는 진단일 뿐 자동 보정하거나 거부하지 않습니다.

문단 값 규칙은 `paragraph_metadata.noteTag` 하나가 소유합니다. section XML 트리 호출자는 section 전체의 `hp:p`를, [마스터페이지](hwpx-master-pages.md) 호출자는 루트 직접 `hp:subList` 아래의 모든 `hp:p`를 선택합니다. 마스터페이지는 직접 문단과 중첩 문단을 모두 같은 값 규칙으로 검사하되, `subList`별 보고서를 반환하며 `sections`는 0입니다. 호출자가 요소 선택·전체 문단 수 한도를 소유하고 이 함수에 문단이 아닌 태그를 전달하지 않습니다. `max_paragraphs_per_part`는 마스터페이지의 여러 직접 `subList`를 합산한 한도입니다.

[한컴이 게시한 ParaList 스키마 설명](https://tech.hancom.com/python-hwpx-parsing-2/)은 2021 namespace 예시의 `PType.id`를 `use="required"`로 보여 줍니다. 반면 [한컴 개발자 포럼 답변](https://forum.developer.hancom.com/t/hp-p-id/1725)은 `id` 생략을 허용한다고 명시합니다. 이 코드는 실제로 관측·지원하는 2011 namespace 문단에 동일 이름의 속성값 규칙을 적용하는 **제한된 호환성 검사**이며, 2021 스키마 전체를 2011 스키마와 동일하다고 주장하지 않습니다. 두 근거의 충돌을 숨기지 않고 부재를 별도 집계합니다. 동일 ID가 여러 문단에 나와도 고유성을 가정하지 않습니다. 부재 Boolean의 스키마 기본값 false는 **원문에 없는 값**과 구분하며, 저장용 값을 새로 만들어 넣지 않습니다.

이 검사는 XML 트리의 namespace·문법·소유권 한도를 재사용하고 문단 수·속성값 바이트 길이를 추가로 제한합니다. 전체 HWPX 스키마 적합성, 문단·run의 자식 순서, 조건부 분기 선택, 필드 ID 연결, 표시/편집 의미 및 원본 재저장은 검증하지 않습니다. 문단 서식 ID 연결은 [section 서식 참조](hwpx-section-references.md)가 소유합니다.

마스터페이지의 `paraPrIDRef`·`styleIDRef` 및 run의 `charPrIDRef`는 이 단계에서 연결하지 않습니다. 해당 섹션 검사 성공을 마스터페이지의 서식 참조 성공으로 확대하지 않습니다.

후속 [마스터페이지 서식 참조](hwpx-master-style-references.md)는 같은 `hp:p`·`hp:run`의 세 ID를 별도 header 색인과 연결합니다. 메타 속성 보고서와 ID 연결 보고서는 독립적으로 유지합니다.

`hp:run`의 `charTcId`와 대체 `paraTcId` 원값은 [run 메타 속성](hwpx-run-metadata.md)의 별도 계약입니다. 이 문서의 `hp:p/@paraTcId`와 run의 대체 표기를 한 필드로 합치지 않습니다.

## 검증

합성 테스트는 명시적 0·부재·큰 정수·`-0`, XML 문자 참조 Boolean, 다른 namespace 동명 요소, 손상된 정수·Boolean, 문단 수 한도, 모든 할당 실패와 ReleaseFast 오류 경로 해제를 검사합니다. 선택 실파일 조사는 [문서 XML 트리 조립](hwpx-document-trees.md)의 8개 shard 명령에서 독립 Python ElementTree 집계와 문단 수·명시적 0·부재·참 Boolean을 대조합니다. 이 실파일 집계는 구조·속성값의 확인이며 전체 문서 의미 검증의 증거가 아닙니다.

2026-09-24 두 로컬 corpus의 HWPX 484개에서 ZIP 거부 6개·암호화 2개를 제외한 476개 문서, 544개 section, 215,146개 문단을 8개 독립 프로세스로 확인했습니다. `id` 부재 0개·명시적 0은 57,893개였고 `paraTcId`는 전 문단에서 부재했습니다. `pageBreak=true`는 1,536개, `columnBreak=true`는 231개였으며 `merged` 부재는 987개였습니다. 각 shard의 이 수치는 독립 ElementTree 조사와 일치했습니다. 이 corpus에는 `id` 생략 예제가 없으므로 생략 허용은 합성 검사와 한컴 포럼 답변에 근거한 호환성 정책입니다.

마스터페이지의 61개 루트 직접 `subList`에는 직접 `hp:p` 63개, 중첩 포함 394개가 있었습니다. 독립 Python ZIP/ElementTree 조사에서 이 394개의 `id` 부재는 0개, 0 값은 69개, `paraTcId` 부재는 394개였습니다. `pageBreak`·`columnBreak`·`merged`는 각각 394개 모두 명시되어 있었고 true는 모두 0개였습니다. 제품 검사는 각 subList의 메타 보고서를 8개 독립 shard에서 이 집계와 대조합니다. 이 값은 이 corpus의 원값·문단 범위 확인일 뿐 서식 참조, 문단 내용, 페이지 배치 검증이 아닙니다.

같은 변경에서 네이티브 Debug 전체 테스트 2,183개, 전용 단위 테스트 5개(Debug·ReleaseSafe·ReleaseFast), ReleaseSafe 제품 빌드 및 전체 Debug `zig build audit --summary all`이 통과했습니다. 선택 실파일 8개 shard는 기본 audit에 포함되지 않으며 위에서 별도 실행했습니다.

마스터페이지 재사용 단계의 최종 소스에서는 `HWPX master` 15개 테스트가 Debug·ReleaseSafe·ReleaseFast에서 각각 통과했고, 전체 Debug `zig build test --summary all`은 2,226/2,226개가 통과했습니다. 선택 실파일 8개 shard는 독립 Python 조사와 다시 대조했고, `zig build -Doptimize=ReleaseSafe`, `zig build audit -Doptimize=ReleaseSafe --summary all`, `zig fmt --check build.zig src`도 성공했습니다. 이는 위 2,183개 기록을 소급 수정한 수치가 아니며 전체 문서 검증 완료를 뜻하지 않습니다.

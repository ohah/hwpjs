# HWPX header 원문·요소 구조 인덱스

`Document.readHeaderTree(allocator, options)`는 기존 [패키지 구조 계층](hwpx-document-structure.md)의 정확한 `Contents/header.xml` manifest 선택과 암호화 선제 거부를 재사용합니다. 해제된 header XML의 정확한 원문 바이트를 복사해 소유하고, namespace가 확장된 **모든 요소**의 원문 span·부모·자식·형제 인덱스를 반환합니다. 미지원 요소와 속성도 원문에 남으며 사용 후 `deinit(allocator)`이 필요합니다. 이 API는 `version.xml`이나 모든 section을 함께 읽지 않습니다.

트리 구현은 `src/hwpx/xml_part_tree.zig`가 소유하고 속성 조회·순서형 콘텐츠는 각각 `xml_part_attributes.zig`·`xml_part_content.zig`로 분리합니다. `header_tree.zig`와 `section_tree.zig`는 각각 루트·한도·순번 정책만 적용합니다. header 트리의 `part_kind`는 `header`, `section_ordinal`은 `null`이며, manifest의 `item_index`는 실제 항목 번호입니다. `attributeValue`, `sourceOf`, `visitContent`, `visitOrdered`는 [section 구조 인덱스](hwpx-section-tree.md)와 같은 공통 구현을 사용합니다. header의 기본 해제 XML 한도는 32 MiB, 요소 수 한도는 200만 개이며 공통 XML 문법·namespace·깊이 한도도 적용됩니다. 후속 OWPML 루트는 명시적 미지원 오류이고, 비슷한 가짜 URI나 section 루트는 잘못된 header 루트 오류입니다.

이 원문 트리는 header 내부의 모든 서식·글꼴·리소스 의미를 검증하거나 편집 가능한 모델로 조립하지 않습니다. 리소스 ID와 참조 검사는 각각 [header 리소스](hwpx-header-resources.md)·[header 내부 참조](hwpx-header-references.md) 등의 별도 API가 소유하며, 트리 생성만으로 그 검사들이 실행됐다고 주장하지 않습니다. 원문 복사도 파일 재저장이나 무손실 편집의 증거가 아닙니다.

## 검증

합성 테스트는 manifest 순서를 바꾼 header 선택, ZIP·입력 해제 후 독립 소유권, 미지원 확장 요소·접두 속성, 문자·CDATA 순서, 기본 namespace와 양 바이트 순서의 UTF-16, 잘못된 루트·후속 URI·정확한 크기/요소 한도와 직접·패키지 경로의 모든 할당 실패 지점을 검사합니다. ReleaseFast에서 별도 안전 검사 할당자로 한도 오류와 정상 경로를 거친 뒤 잔여 할당 0바이트도 확인합니다. 섹션 전용 테스트는 공통 트리 추출 뒤에도 통과했습니다.

로컬 HWPX 484개 중 ZIP 거부 6개·암호화 2개를 제외한 476개 header, 요소 1,200,622개를 제품 Zig 트리와 독립 Python `ElementTree`로 대조했습니다. 요소 경계 사이에서 합친 직접 문자 순서는 독립 Expat SHA-256의 전체 합계 `3aa151e548bf2d2034ff5fa208b3a6fd7fad03f116a9d2315ad8762aec3a9662`와 일치했습니다. 합계 방식이므로 각 문서별 원문 바이트 동치나 모든 header 필드 의미를 증명하지 않습니다. 이 corpus의 header 루트는 모두 2011 namespace이며 후속 버전 실파일은 포함되지 않습니다. 재현 명령은 [개발·검증 명령](development-commands.md)에 둡니다.

2026-09-24 공통 part 트리 분리 후 섹션 8개 shard를 다시 실행해 기존 요소·속성·직접 콘텐츠·순서 해시가 모두 유지됐습니다. 기본 테스트 2,175개, header 전용 Debug·ReleaseSafe·ReleaseFast 각 7개, ReleaseSafe 제품 WASM 빌드, Debug `zig build audit --summary all`, `zig fmt --check build.zig src`가 통과했습니다. 마지막에 추가한 ReleaseFast 잔여 할당 0바이트 검사는 전용 테스트와 최종 기본 테스트에서 별도로 통과했습니다. 정규 audit에는 선택 실파일 header·section 조사가 포함되지 않아 별도 실행했습니다.

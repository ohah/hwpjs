# HWPX 문서 XML 트리 조립

`Document.readXmlTrees(allocator, options)`는 [header·spine 구조 검사](hwpx-document-structure.md)를 한 번 수행한 뒤, 확정된 header manifest 항목과 section의 spine 순서를 재사용해 [header 트리](hwpx-header-tree.md) 하나와 [section 트리](hwpx-section-tree.md) 배열을 소유한 `XmlTrees`를 반환합니다. 공통 구현은 `src/hwpx/document_trees.zig`에 있고 기존 `readHeaderTree`·`readSectionTree`도 같은 선택·해제 도우미를 사용합니다. 반환 후 `Document`·원본 ZIP 바이트를 해제해도 각 트리의 XML 원문·요소 인덱스는 유효합니다. `XmlTrees.deinit(allocator)`이 구조 보고서, header와 모든 section을 해제합니다.

`structure` 보고서의 선언 section 수 불일치, 숫자 경로 역순, header의 spine 포함 여부, 비XML spine 항목 수, section이 아닌 XML spine 항목 수는 그대로 남깁니다. 없는 section을 생성하거나 미분류 항목을 section으로 바꾸지 않습니다. `structure`의 manifest item 인덱스는 원래 `Document`가 살아 있을 때만 경로 조회에 쓸 수 있습니다. 트리 자체의 소유 XML은 그 수명과 독립적입니다.

기본 구조 검사 한도는 header 32 MiB·spine XML 개별 128 MiB·구조 검사 XML 합계 256 MiB·section 최대 65,535개입니다. 문서 트리 조립은 별도 `max_total_owned_xml_bytes=256 MiB`와 `max_total_elements=4,000,000`을 **트리 소유 전** 선택된 header+section 메타데이터 합계에 적용합니다. 구조 검사 합계에는 미분류 spine XML도 포함될 수 있으나 소유 한도는 실제 반환할 header+section만 셉니다. 개별 트리 한도는 각각 header/section 옵션이 소유합니다. 각 트리의 실제 바이트·요소 수가 구조 검사 관측값과 달라지면 오류이며, 중간 실패 시 이미 만든 모든 트리를 해제합니다.

이 API는 XML 원문 구조를 조립할 뿐 전체 HWPX 스키마·조건부 분기·서식 의미·표시 순서·BinData·차트 의미를 검증하지 않습니다. 비XML·미분류 XML spine 항목과 manifest의 다른 part 바이트도 트리 배열로 복제하지 않습니다. 편집 모델·저장·무손실 왕복의 근거가 아니며, 해당 검사들은 별도 계층으로 남습니다.

## 검증

합성 패키지에서 manifest 저장 순서와 다른 두 section의 spine 순서, 불일치한 `secCnt`, 역순 숫자 경로, 비XML 및 미분류 XML spine 항목을 함께 검사합니다. 정확한 전체 바이트·요소 한도, 개별 트리 한도, 원본 문서 해제 뒤 트리 수명, 서로 다른 ZIP·트리 할당자, 모든 할당 실패 지점과 ReleaseFast 안전 검사 할당자의 잔여 0바이트를 확인합니다. 선택 실파일 검사는 같은 두 corpus를 8개 독립 프로세스로 나누고 독립 Python ZIP/XML 조사와 문서·section·header/section 요소 수 및 XML 바이트 수의 **shard별 합계**를 대조합니다. 재현 명령은 [개발·검증 명령](development-commands.md)에 둡니다.

2026-09-24 실측에서 로컬 HWPX 484개 중 ZIP 거부 6개·암호화 2개를 제외한 476개 문서의 header 476개·section 544개를 조립했습니다. header 요소 1,200,622개, section 요소 2,174,716개 및 선택 XML 바이트 수가 8개 shard마다 독립 조사와 일치했습니다. 이 집계는 문서별 필드 의미·조건부 분기·비선택 part·원본 재저장 동치를 증명하지 않습니다.

같은 변경에서 전체 네이티브 테스트 2,179개(Debug), HWPX 필터 테스트 154개(ReleaseSafe), 전용 조립 테스트 5개(Debug·ReleaseSafe·ReleaseFast), `zig build -Doptimize=ReleaseSafe` 및 전체 Debug `zig build audit --summary all`이 통과했습니다. 이 테스트 수는 위의 실파일 독립 대조 범위나 전체 HWPX 문서 의미 검증 범위를 넓히지 않습니다.

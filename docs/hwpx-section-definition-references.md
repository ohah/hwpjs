# HWPX 구역 정의의 번호·메모 모양 참조

`src/hwpx/section_definition_refs.zig`는 이미 해석한 [구역 정의](hwpx-section-definitions.md)의 `outlineShapeIDRef`·`memoShapeIDRef`와 이미 색인한 [header 리소스](hwpx-header-resources.md)의 `numberings/numbering`·`memoProperties/memoPr` ID를 연결합니다. `Document.inspectKnown().section_definition_references`가 결과를 반환합니다. 대상 판정은 기존 `id_references.resolveValue`를 공유하며 XML 파싱·ID 목록을 복제하지 않습니다.

각 필드는 부재, 명시적 `0`, 존재하는 대상, 테이블 부재, 테이블은 있으나 대상 누락을 따로 계수합니다. 첫 미해결 값과 section 순번·요소 인덱스를 남깁니다. `0`이 모든 버전에서 sentinel인지 공식 모델만으로 확정하지 못했으므로 **부재나 대상 오류로 합치지 않습니다**. 번호 테이블 부재도 문서 오류로 즉시 거부하지 않습니다. 이것은 참조 진단이지 전체 문서 유효성 판정이 아닙니다.

한컴 공식 [구역 속성 모델](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/SectionDefinitionType.h), [번호 목록 모델](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Head/numberings.h), [메모 모양 목록](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Head/memoProperties.cpp)과 실파일 ID 분포를 함께 근거로 삼았습니다. 모델은 숫자 속성과 ID 항목을 정의하지만, 연결 및 `0` 의미까지 엄격히 설명하지 않으므로 여기의 대상 매핑은 **실파일로 뒷받침한 추론**입니다.

2026-09-25 독립 ZIP/XML 조사: 로컬 두 corpus 484개 중 읽을 수 없는 ZIP/암호 파일 8개를 제외한 476개에서 `secPr` 555개를 관측했습니다. 번호 참조는 `0` 142개, ID 해결 392개, 번호 테이블 부재 21개였습니다. 메모 참조는 `0` 466개, ID 해결 89개였습니다. `memoProperties`는 77개 문서에서 관측됐고 `memoPr` 항목은 총 92개, 선언 `itemCnt` 불일치는 0개였습니다. 이 corpus에는 테이블이 존재하면서 ID가 누락된 실파일도, 필드 자체가 빠진 정의도 없었습니다.

독립 조사기의 8개 shard 기대값과 Zig `inspectKnown`의 문서별 검사·shard 합계가 모두 일치했습니다. `reference/rhwp/samples/누름틀-2024.hwpx`의 메모 ID 1도 직접 대조했습니다. 합성 반례는 부재·`0`·희소 ID·테이블 부재·대상 누락, 외부 namespace와 중첩 항목 위장, 중복·누락 ID, ID 한도·모든 할당 실패 지점을 검사합니다. HWPX 전체 Debug 369/369, 전체 Debug 빌드 5/5 단계·2,398/2,398 테스트, ReleaseSafe 제품 빌드 5/5 단계와 전체 audit 종료 코드 0이 통과했습니다. 마지막 enum/descriptor 길이 컴파일 검사를 포함해 전체 Debug 테스트를 재실행했습니다.

번호 목록이 아예 없는데 `outlineShapeIDRef=1`인 실파일 21개가 있어 대상 누락을 강제 오류로 바꾸면 이 실파일들을 거부합니다. 실제 한컴 동작이나 파일 적합성을 확인하기 전에는 이 21개를 정상 또는 결함으로 단정하지 않습니다. 관측 corpus의 번호·메모 목록에는 ID `0` 항목이 없었지만, ID `0`이 있는 테이블과 비표준 namespace, 버전별 대체 매핑, 표시/저장 의미는 별도 검증이 필요합니다. 값의 원문은 구역 정의 보고서가 계속 소유하며, 이 보고서는 원문을 버리거나 수정하지 않습니다.

2026-09-27 현재 소스에서는 `HWPX section definition references`, 메모 리소스 색인, 실제 메모 참조 연결의 집중 테스트를 Debug·ReleaseSafe·ReleaseFast에서 통과했습니다. 독립 ZIP/XML 조사기의 일반·`-O` 자체 반례와 8개 shard 기대값을 다시 확인하고, Zig `inspectKnown` 실파일 8개 shard도 각각 별도 ReleaseFast 프로세스로 통과했습니다. `누름틀-2024.hwpx`의 `memoPr.id=1`과 `secPr.memoShapeIDRef=1`은 별도 ZIP/XML 조회로 확인했습니다. 조사기의 자체 반례가 Python `assert`에 의존하면 `-O`에서 사라지는 결함을 발견해 명시적 예외로 바꿨고, `-O`에서 분류 함수를 고의로 무력화한 검사도 실패하는지 확인했습니다. 이 재검증은 ID 연결에 한정되며, 2026-09-25의 전체 Debug/audit 개수를 현재 전체 테스트 개수로 재사용하지 않습니다.

# HWPX 구역 정의 속성·직접 자식

`startNum`·`grid`·`visibility`·`lineNumberShape`의 내부 원값은 [구역 직접 설정](hwpx-section-direct-settings.md)이 별도 소유합니다.

`pageBorderFill`과 직접 `offset` 원값은 [구역 쪽 테두리·배경](hwpx-section-page-borders.md)이 별도 소유합니다.

`src/hwpx/section_definition.zig`는 패키지가 선택한 2011 namespace의 section XML 트리에서 모든 `hp:secPr`를 XML 순서대로 관측합니다. `section_ordinal`과 `element_index`를 남겨 한 section의 여러 정의를 합치지 않습니다. 반환 보고서는 독립 소유값이며 `deinit`해야 합니다. `readXmlTrees().inspectSectionDefinitions()`와 `Document.inspectKnown().section_definitions`가 같은 구현을 사용합니다.

공식 기준은 한컴 OWPML 모델의 [속성·자식 정의](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/SectionDefinitionType.cpp), [필드 자료형·버전 주석](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/SectionDefinitionType.h), [enum 목록](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/enumdef.h)입니다(`1453388472c703a4b299a0834f425cdac16644b9`). 열 속성은 `id`, `textDirection`, `spaceColumns`, `tabStop`, `tabStopVal`, `tabStopUnit`, `outlineShapeIDRef`, `memoShapeIDRef`, `textVerticalWidthHead`, `masterPageCnt`입니다. 세 정수형 `spaceColumns`·`tabStop`·`tabStopVal`은 공통 signed32 어휘, ID 참조·마스터페이지 개수는 공통 unsigned32 어휘, `textVerticalWidthHead`는 공통 XML Boolean 어휘로 검사합니다. enum은 알려진 값과 확장/미확정 값을 구분하되 후자는 원문을 보존하고 진단 수를 올립니다. 모든 필드의 XML 정규화 문자열과 부재를 그대로 구분합니다. `id`의 빈 문자열과 부재도 다릅니다.

공식 모델의 직접 자식 12종은 각각 개수를 세고, 모델 미등록 paragraph namespace 자식과 외부 namespace 자식은 따로 셉니다. 목록 밖 요소를 삭제하거나 스키마 오류로 단정하지 않습니다. 별도 [쪽 설정](hwpx-page-geometry.md)은 `pagePr`의 내부 필드를, [마스터페이지 참조](hwpx-master-pages.md)는 `masterPageCnt`의 선언·참조 관계를 소유합니다. 이 보고서는 `masterPageCnt` 원문과 공통 숫자 어휘만 확인하고 실제 마스터페이지 개수와 강제로 같다고 판정하지 않습니다.

공식 모델의 `tabStop`은 구버전 필드이며 `tabStopVal`은 1.31 이후 사용된다고 주석에 명시돼 있습니다. 로컬 corpus에서도 후자의 쌍(`tabStopVal`·`tabStopUnit`)이 함께 빠진 정의가 있으므로 `tabStop`으로 보충하거나 0으로 정규화하지 않습니다. 버전 XML의 숫자만으로 각 정의의 유효 필드 집합을 추측하지 않습니다.

한도는 전체 `secPr` 개수·직접 자식 수·개별 속성 바이트 수에 독립적으로 적용합니다. 낯선 속성은 수만 세고 원본 XML 트리에 보존됩니다. 이 단계는 구역 정의의 속성·직접 자식 인벤토리일 뿐, 자식 내부 전체 의미·조건부 분기 선택·참조 유효성 전체·효력 순서·레이아웃·편집·저장은 검증하지 않습니다. 검사 성공은 전체 HWPX 스키마 적합성 판정이 아닙니다.

검증은 합성 부재/빈값·신구 탭 필드·알 수 없는 enum/자식·숫자 경계·크기 한도·모든 할당 실패 지점과 후속 단계 오류 후 해제를 포함합니다. 추적 실파일의 전 필드를 독립 `zipfile`/`ElementTree` 결과와 대조하고, `tools/hwpx-section-definition-oracle.py`의 자체 반례와 두 corpus 8개 shard에서 필드 부재·수치 합·자식 분포를 별도 대조합니다. 실파일 합계만으로 개별 문서의 상쇄 오류를 배제하지 못합니다.

2026-09-25 실측: 로컬 HWPX 484개 중 기존 ZIP 거부 6개·암호화 2개를 제외한 476개 문서의 section 544개에서 `secPr` 555개를 검사했습니다. 독립 Python 조사와 Zig ReleaseFast 8개 shard가 정의 수, 직접 자식 12종, 숫자 여섯 필드 합, 부재 개수에서 일치했습니다. `id`는 빈 문자열 545개·부재 10개, `tabStopVal`과 `tabStopUnit`은 각각 91개 정의에서 부재였습니다. 알려진 `textDirection` 값은 전부 `HORIZONTAL`; `tabStopUnit=CHAR`는 1개입니다. 모델 미등록 직접 자식 4개(`header`, `headerApply`, `footer`, `footerApply`)는 별도 집계했고 낯선 속성·enum 및 외부 namespace 직접 자식은 이 corpus에서 관측되지 않았습니다. 알려진 다른 방향·단위 값과 음수 탭/간격은 합성 테스트만 뒷받침합니다.

적대적 검토에서는 `masterPageCnt`를 참조 개수와 강제로 맞추지 않는 정책, 구형/신형 탭 필드 분리, 빈 ID/부재, 직접 자식만 세는 경계, 미등록 자식 보존, signed32/unsigned32 오버플로, 전역 예산과 오류 후 메모리 정리를 확인했습니다. oracle도 Python `int()`가 허용하는 잘못된 어휘를 별도 거부하도록 보강했습니다. 이 검사는 값·구조 인벤토리입니다. 후속 [ID 참조 진단](hwpx-section-definition-references.md)은 별도 책임이며 구역 배치 의미는 여전히 남아 있습니다.

같은 작업 상태의 `zig build test --summary all`은 Debug 2,395/2,395 테스트와 빌드 5/5 단계를 통과했습니다. `zig build -Doptimize=ReleaseSafe` 및 `zig build audit -Doptimize=ReleaseSafe --summary all`도 종료 코드 0으로 통과했습니다. 선택 corpus 8개 shard는 기본 audit 외에 각각 별도 ReleaseFast 프로세스로 실행했습니다. 이 결과를 전체 HWPX 스키마·레이아웃·편집/저장 검증 완료로 세지 않습니다.

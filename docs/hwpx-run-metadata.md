# HWPX run 변경 추적 ID 원값

`src/hwpx/run_metadata.zig`는 2011 `hp:run`의 `charTcId`와 대체 표기 `paraTcId`를 함께 읽어 unsigned 32-bit XML 값으로 검사합니다. 한컴 공개 [RunType 구현](https://github.com/hancom-io/hwpx-owpml-model/blob/main/OWPML/Class/Para/RunType.cpp)은 `charTcId`를 쓰고 읽을 때 `paraTcId` 경로도 두고 있습니다. 어느 버전에서 대체 표기가 유효한지 확정하지 않았으므로, 두 값의 존재·0·동일·충돌을 각각 보고하고 하나를 임의로 선택하거나 덮어쓰지 않습니다. 두 값 모두 없으면 부재로 남기며 기본값 0을 합성하지 않습니다. 이는 변경 추적 의미·참조 대상·편집/저장 모델이 아닙니다.

section에서는 소유 XML 트리의 모든 `hp:run`을 검사하고, 마스터페이지에서는 루트 직접 `hp:subList` 아래 후손 `hp:run`에 같은 필드 검사기를 재사용합니다. 다른 namespace의 동명 요소는 제외합니다. section 전체 run 수와 마스터페이지 파트별 run 수, 속성 바이트·공통 XML 순회 한도를 각각 적용합니다. 잘못된 숫자·범위 초과는 오류이며 두 값의 충돌은 진단 집계입니다. section 결과는 `XmlTrees.inspectRunMetadata` 및 `inspectKnown().run_metadata`, 마스터페이지 결과는 각 `SubList.run_metadata`에서 확인합니다. 숫자 집계만 소유해 별도 해제가 필요하지 않습니다.

이 단계는 `hp:run`의 부모가 유효한 `hp:p`인지, 자식 순서가 스키마에 맞는지 판정하지 않습니다. 그런 구조 검사는 별도 문서 모델 단계에 남아 있으며, 여기서 센 모든 run을 표시 가능한 텍스트 run으로 간주하지 않습니다.

부모·직접 자식·`secPr` 위치의 후속 관측은 [run 위치·자식 진단](hwpx-run-topology.md)이 소유합니다. 변경 추적 속성의 값 규칙은 이 문서에만 남깁니다.

독립 Python ZIP/ElementTree 조사(`tools/hwpx-manifest-xml-oracle.py`)는 로컬 HWPX 484개 중 검사 가능한 476개에서 section run 267,347개와 마스터페이지 run 521개를 관측했습니다. 그 모든 run에서 두 변경 추적 ID 속성이 모두 부재했습니다. 8개 독립 shard의 제품 집계와 이 수치를 대조하지만, **실파일 corpus는 명시적 값·대체 표기·충돌의 동작을 검증하지 못합니다.** 이 경우의 존재·0·동일/충돌·숫자 오류·한도·할당 실패는 합성 XML/ZIP 테스트에만 근거합니다. 이 기능을 전체 run 모델이나 HWPX 완성으로 해석하지 않습니다.

적대적 합성 테스트는 외부 namespace 동명 요소, 마스터페이지 `subList` 바깥의 손상된 run, 32-bit 초과·음수·잘못된 값, 두 값의 충돌, 정확한 run/속성 한도, 모든 할당 실패 지점과 ReleaseFast에서도 동작하는 명시적 해제 회계를 검사합니다. 출력 보고서는 원문 변경 추적 레코드나 참조 대상 자체를 보존하지 않습니다.

최종 소스의 네이티브 Debug 전체 테스트는 2,237/2,237개가 통과했고, run 전용 필터의 7개 테스트와 기존 마스터페이지 필터의 20개 테스트도 통과했습니다. 실파일 8개 shard는 기본 audit 밖에서 별도 실행했습니다. 테스트 수는 지원 필드의 완성률이나 스키마 적합률이 아닙니다.

ReleaseSafe 제품 빌드와 전체 `zig build audit -Doptimize=ReleaseSafe --summary all`, `zig fmt --check build.zig src`, `git diff --check`도 통과했습니다. audit의 다른 형식·리소스 검사 결과를 이 변경 추적 필드의 실파일 값 검증으로 확대하지 않습니다.

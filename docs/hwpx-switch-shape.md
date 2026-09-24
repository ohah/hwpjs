# HWPX run 내부 조건부 `switch` 구조

`src/hwpx/run_topology.zig`가 2011 paragraph namespace의 `hp:run` 직접 자식으로 선택한 `hp:switch`만 `src/hwpx/switch_shape.zig`에 전달합니다. 이 모듈은 `switch` 수와 추가 속성, 직접 `case`·`default`·그 밖의 자식 수, `case`의 paragraph namespace `required-namespace` 원값 분류, 같은 이름의 namespace 없는 속성 존재, 각 분기의 직접 `chart`·`ole` 및 나머지 자식 수를 진단합니다. switch별 `case`/`default` 누락·중복 default·default 뒤 case도 별도 집계합니다. `max_switches`는 모든 section 또는 선택 마스터페이지에 걸친 직접 switch 합계에 적용하고, 알려진 속성의 정규화 값은 `max_attribute_bytes`로 제한합니다. 보고서는 개수만 소유하며 원문을 수정하지 않습니다.

[2011 ParaList XSD 사본](https://github.com/edwardkim/rhwp/blob/main/mydocs/manual/OWPML%20SCHEMA/ParaList%20XML%20schema.xml)과 [한컴 고정 리비전 RunType 등록 코드](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/RunType.cpp)는 이 `switch`의 분기 선택 계약을 제공하지 않습니다. 따라서 여기서는 `required-namespace` 값이 특정 URI라는 사실만 관측하고, 지원 기능 목록이나 선택 분기를 추측하지 않습니다. 기존 [이진 참조 검사](hwpx-binary-references.md)와 [차트 참조 검사](hwpx-chart-references.md)가 두 분기를 모두 순회한 결과를 이 보고서가 단일 활성 분기의 결과로 바꾸지 않습니다. `case`·`default` 개수 이상도 현재는 진단이며, 모든 버전의 유효성 거부 규칙으로 강제하지 않습니다.

독립 Python ZIP/ElementTree oracle(`tools/hwpx-manifest-xml-oracle.py`)의 로컬 HWPX 476개 수용 문서에서 section 직접 `switch`는 93개, 선택 마스터페이지는 0개였습니다. 관측된 93개는 모두 직접 `case` 1개·`default` 1개, namespaced `required-namespace="http://www.hancom.co.kr/hwpml/2016/ooxmlchart"` 1개, case의 직접 chart 1개·default의 직접 OLE 1개였습니다. 추가 속성·다른 자식·누락/중복/순서 이상은 0개였습니다. 이는 **현재 corpus의 구조**이지 2016 namespace를 지원한다는 선언이나 차트/OLE 의미 동치 증명이 아닙니다.

합성 테스트는 빈 switch, 잘못된 순서·중복 default, 요구 namespace의 부재/빈 값/namespace 없는 변형, 추가 속성, 타 namespace·중첩 유사 요소, 분기 안의 다른 자식, section/마스터페이지 예산 및 할당 실패를 확인합니다. 분기 선택·렌더링·편집/저장과 전체 HWPX 스키마 적합성은 후속입니다.

2026-09-24 검증: 독립 Python oracle의 21개 슬롯과 선택 실파일 8개 shard의 Zig 보고서가 모두 일치했습니다. 같은 합성 입력을 Python 집계기에 넣은 별도 대조도 일치했습니다. 전체 Debug 테스트 2,259개, ReleaseSafe 제품 빌드·전체 audit, 전용 Debug·ReleaseSafe·ReleaseFast 테스트가 통과했습니다. 적대적 검증에서 직접 run 자식만 선택하는 범위, namespace 있는/없는 `required-namespace`의 구분, switch별 중복/순서 진단, 두 마스터페이지에 걸친 `max_switches` 한도 및 실패 시 할당 해제를 확인했습니다. 실파일의 모든 분기가 같은 chart/OLE 모양이라는 이유로 한쪽을 활성 분기로 선택하거나 상대 분기를 삭제하지 않습니다.

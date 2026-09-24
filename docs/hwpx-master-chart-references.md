# HWPX 마스터페이지 차트 경로·XML 검사

`Document.inspectMasterPageChartReferences(allocator, options)`는 정규 마스터페이지 파트의 루트 직접 `hp:subList` 아래에서 `hp:run` 또는 활성 분기의 직접 `hp:chart/@chartIDRef`를 찾습니다. 기본 원문 API는 두 분기를 모두 검사하고 `inspectKnown.master_page_chart_references`에도 같은 결과를 넣습니다. `Document.inspectSelectedMasterPageChartReferences(allocator, options, supported_namespaces)`는 호출자가 지원한다고 선언한 namespace에 따라 활성 분기만 검사합니다. 둘은 section 차트 보고서와 별도의 파트·XML 바이트·참조 위치·차트 XML 예산을 가집니다.

[한컴 공개 RunType 구현](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/RunType.cpp#L1580-L1593)에는 `chart` 자식이 정의돼 있습니다. `chartIDRef`는 OPF ID가 아니라 ZIP 내부 경로로 해석합니다. section과 공유하는 `chart_reference_scan.zig`가 파트별 시작 범위와 직접 `subList`를 판정하고, `chart_parts.zig`의 Resolver가 경로·존재 여부·중복 대상 해제·차트 XML 루트, 캐시 및 수식 구조를 유일하게 검사합니다. 새 숫자·차트 내용 파서를 만들지 않습니다. 외국 namespace의 동명 `subList`와 범위 밖 루트 자식은 검사 대상이 아닙니다. 분기 선택은 [공통 정책](hwpx-switch-selection.md)을 사용합니다.

보고서의 `parts`·`sub_lists`·`xml_bytes`는 원문 마스터페이지 선택 범위이고 `charts`는 차트 참조 및 대상 XML 검사 결과입니다. `charts.sections`와 `charts.section_xml_bytes`는 0으로 유지해 section 보고서로 오인하지 않으며, 결과의 첫 문제 경로와 진단 문자열은 `deinit(allocator)`으로 해제합니다. 비활성 분기의 차트 대상과 참조 위치 예산은 선택 결과에서 제외하지만, 마스터페이지 원본 XML의 해제·문법·namespace·바이트 한도는 그대로 적용합니다. 이 검사는 마스터페이지를 실제 페이지에 적용하거나 차트를 렌더링·편집·저장하지 않습니다.

## 검증과 미확인 범위

합성 ZIP은 정확한 ZIP 경로와 중복 대상의 단일 해제, `inspectKnown` 연결 및 section 분리, 루트 직접 `subList`/외국 namespace 경계, 누락·부적합 경로·미분류 속성, 원문/선택 분리·중첩 switch와 첫 default, 비활성 대상 XML 오류와 위치·파트·바이트 한도, 전 할당 실패 지점 및 archive/보고서의 서로 다른 할당자 수명을 검사합니다. 실행 명령은 [개발·검증 명령](development-commands.md)에 둡니다.

독립 `tools/hwpx-manifest-xml-oracle.py`는 로컬 476개 허용 HWPX의 마스터페이지 직접 `subList` 전체를 ElementTree로 조사했습니다. `hp:chart`와 `chartIDRef`가 있는 요소는 각각 **0개**입니다. 이는 제품 분류기의 가능한 양성 입력을 포함하는 상한 조사이지만, 실제 마스터페이지 차트 경로·대상 XML의 동치 검증은 아닙니다. 실파일 known survey 8개 shard가 모두 통과해 이 0건과 원문/선택 보고서 범위를 확인했고, 양성 차트 참조·분기 선택은 합성 ZIP에 한해 검증합니다.

전용 테스트는 Debug·ReleaseSafe·ReleaseFast에서 각 8개 통과했고, 기존 section 차트 회귀 테스트 15개와 ReleaseSafe JS 비교 테스트 47개가 통과했습니다. 최종 소스의 Debug 전체 테스트 2,374개, ReleaseSafe 빌드·audit도 통과했습니다.

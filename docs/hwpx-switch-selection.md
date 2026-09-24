# HWPX 조건부 참조 분기 선택

같은 선택 정책을 사용하는 텍스트 이벤트 경로는 [선택 분기 텍스트](hwpx-selected-section-text.md)에 별도 기록합니다. 이 문서는 이진·차트 참조 경계만 소유합니다.

소유 XML 트리의 [선택 분기 표 격자](hwpx-selected-table-geometry.md)도 같은 정책을 재사용하며, 표 선택·한도·검증 범위는 그 문서가 소유합니다.

`Document.inspectSelectedReferences(allocator, options)`는 section의 `hp:switch`에서 **이진·차트 참조 검사에 한해** 같은 분기 선택 정책을 적용합니다. 기본 `inspectBinaryReferences`·`inspectChartReferences`와 `inspectKnown`은 기존대로 양쪽 분기를 모두 관측합니다. 반환 보고서의 이진·차트 결과는 각각 소유하므로 `deinit(allocator)`으로 함께 해제합니다. 이 API는 전체 선택 문서 모델·렌더링·편집·저장이 아닙니다.

호출자가 `supported_namespaces`로 실제 해석 가능한 namespace URI를 명시합니다. 기본값은 빈 집합이므로 지원 기능을 버전 번호나 문서의 `required-namespace`에서 추정하지 않습니다. 정책과 URI 목록 검사는 `src/hwpx/compatibility_selection.zig` 한 곳에 두며 두 참조 스캐너가 재사용합니다. URI 최대 64개, 각 1~4096바이트, ASCII 공백 없는 값만 받습니다. 검사 API는 선택된 분기의 참조만 집계·해결하지만 **선택되지 않은 분기도 XML 문법·namespace 검사와 원문 바이트 한도의 대상**입니다.

직접 `case`는 paragraph 또는 EPUB namespace의 `required-namespace`에 공백으로 나뉜 모든 URI가 호출자 집합에 있을 때 선택합니다. 두 속성이 있으면 어느 한쪽이 만족하면 됩니다. 문서 순서에서 첫 번째로 만족하는 `case`가 선택되고, 그 전의 `default`가 먼저 나타나면 `default`가 선택됩니다. 중첩 `switch`도 활성 조상 안에서만 평가합니다. 선택되지 않은 분기의 `chartIDRef`·`binaryItemIDRef`는 위치 예산과 대상 해결에 포함하지 않습니다.

이 순서는 한컴 공개 모델의 [Compatibility handler](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Base/Handler.cpp#L253-L321)를 참조합니다. 그 구현은 빈 `required-namespace`는 거부하지만 **비어 있지 않은 공백 전용 값은 토큰 반복을 건너뛰어 수용**합니다. Zig도 이 관측 동작을 재현합니다. 다만 공식 구현은 `hp:`/`epub:` 철자에 결합된 속성 조회를 하고, 여기서는 같은 URI의 다른 prefix도 XML namespace 규칙대로 인식합니다. 따라서 공식 프로그램과 모든 비정상 입력에서 바이트 단위 동치라고 주장하지 않습니다. 한컴 앱의 [등록 namespace 목록](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Document.cpp#L407-L409)은 이 라이브러리의 지원 목록으로 자동 채택하지 않습니다.

검사 범위는 기존 이진·차트 스캐너가 알아보는 section 경로입니다. 이 범위 밖의 조건부 요소, masterpage, 다른 참조 종류, `switch` 구조의 스키마 유효성, OOXML 차트 렌더링 의미는 아직 다루지 않습니다. `case/default`의 누락·중복·순서 이상은 [구조 진단](hwpx-switch-shape.md)이 별도로 보고하며, 여기서는 선택 결과를 전체 문서의 적합성 판정으로 승격하지 않습니다.

합성 검증은 양쪽 분기의 raw 보존, 빈 기능 집합의 default, 한·여러 URI 조건, 첫 번째 일치 분기, default 선행, 중첩, EPUB 속성·prefix 별칭, 공백 전용 값, namespace 없는 유사 속성, 비활성 잘못된 참조와 위치 예산의 격리, 첫 조건 충족 시 불필요한 EPUB 속성 해석 생략, 잘못된 capability, 전체 할당 실패와 뒤 단계 오류의 해제를 다룹니다.

2026-09-24 실측: 선택적 참조 합성 테스트 9개가 Debug·ReleaseSafe·ReleaseFast에서 통과했고, 기존 raw 이진 7개·차트 15개도 통과했습니다. 선택 실파일 `hwpx_known_survey`의 8개 shard를 각각 별도 ReleaseFast 프로세스로 실행했고, 수용 문서 476개 전부에서 기존 known 검사가 통과했습니다. `switch`가 있는 문서는 추가로 빈 capability/default와 2016 차트 capability/case를 각각 검사했습니다. 두 결과의 차트·OLE 위치 수는 raw 보고서와 [별도 Python oracle로 대조된 switch 구조 보고서](hwpx-switch-shape.md)의 직접 자식 수에 맞았습니다. 전체 Debug `zig build test --summary all`은 2,267/2,267, ReleaseSafe 제품 빌드와 `zig build audit -Doptimize=ReleaseSafe --summary all`도 통과했습니다. 이 대조는 **참조 위치 선택**을 증명하며 차트/OLE 콘텐츠의 시각적 동치나 다른 조건부 요소의 선택을 증명하지 않습니다.

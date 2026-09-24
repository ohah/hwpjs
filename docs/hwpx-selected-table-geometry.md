# HWPX 선택 분기 표 격자

`Document.inspectSelectedTableGeometry(allocator, options, supported_namespaces)`와 `Document.inspectSelectedMasterPageTableGeometry(allocator, options, supported_namespaces)`는 호출자가 해석 가능하다고 선언한 namespace 집합으로 section과 마스터페이지의 표·행·셀 구조를 각각 검사합니다. 기존 `inspectKnown`, `XmlTrees.inspectTableGeometry`, `Document.inspectMasterPageTableGeometry`는 양쪽 분기를 보는 원문 관측으로 유지합니다. 선택 결과는 전체 선택 문서 모델이나 표 표시·편집·저장 결과가 아닙니다.

현재 Zig 코어 API이며 제품 JS/WASM 공개 API에는 아직 연결되지 않았습니다.

분기 판정은 [공통 조건부 선택 정책](hwpx-switch-selection.md)의 `compatibility_selection.zig`가 한 번만 소유합니다. 스트리밍 스캐너는 원래 태그를, 소유 XML 트리는 원본 start tag와 조상 namespace scope를 사용해 같은 지연 속성 조회·첫 일치 `case`/`default`·지원 namespace 토큰 판정을 호출합니다. `xml_tree_selection.zig`는 활성 `hp:run` 또는 활성 분기의 직접 `hp:switch`에서만 분기를 선택하고, 마스터페이지는 루트 직접 `hp:subList`에서만 시작합니다. `hp:t` 아래의 동명 `run`은 스트리밍 스캐너와 같이 inline 내용으로 보아 새 선택 범위를 열지 않습니다. 그 밖의 동명 요소와 외국 namespace의 `switch`는 선택 분기로 오인하지 않습니다. [표 격자와 필드](hwpx-table-geometry.md)는 활성 표에만 기존 규칙을 적용하며 새 숫자·테두리 파서를 만들지 않습니다.

비활성 표의 행·셀·필드 값, 테두리 참조, 표·격자·셀 방문 예산은 선택 결과에서 제외합니다. 반면 원본 ZIP/XML 해제·문법·namespace와 트리의 XML 바이트·요소 예산은 비활성 분기도 포함합니다. 잘못된 지원 namespace URI는 파트를 읽기 전에 거부합니다. Header `borderFill` ID 색인은 원본과 동일합니다. 마스터페이지 파트·직접 목록 수는 선택 전 원문 구조 수이며 활성 표 수와 혼동하지 않습니다.

공개 모델의 [Compatibility handler](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Base/Handler.cpp#L230-L294)는 첫 적합 분기를 선택합니다. 이 프로젝트는 그 공개 구현의 속성 철자 결합 대신 XML expanded namespace를 사용하므로 잘못된 prefix 표기까지 한컴 프로그램과 완전히 동치라고 주장하지 않습니다. 조건부 구조의 누락·중복은 [switch 구조 진단](hwpx-switch-shape.md)이 별도 소유합니다.

## 검증

`zig test src/root.zig --test-filter 'HWPX selected table geometry'`는 section·마스터페이지 raw/선택 분리, 비활성 숫자 오류·표/격자 예산 격리, 첫 default, 중첩 switch, 외국 namespace, 텍스트 안의 동명 run 경계, paragraph/EPUB 요구 속성과 별칭, 모든 할당 실패를 검사합니다. 기존 선택 참조·텍스트·서식 참조의 회귀와 마스터페이지 원문 표 테스트도 재실행합니다. 실행 명령은 [개발·검증 명령](development-commands.md)이 소유합니다.

독립 `tools/hwpx-table-oracle.py`가 로컬 476개 허용 HWPX를 ZIP/ElementTree로 조사한 결과, section·마스터페이지의 `hp:switch` 후손에 표는 각각 **0개**였습니다. 따라서 실파일에서 선택/원문 표 개수의 동치를 확인해도 활성 분기 표 선택의 양성 사례가 되지는 않습니다. 그 양성·음성 선택은 위 합성 ZIP 반례로만 검증됩니다. 실제 파일의 조판·표 표시 동치와 아직 관측하지 못한 버전의 조건부 표는 미검증입니다.

선택적 `hwpx_known_survey.zig`의 8개 shard를 각각 실행해 전부 통과했습니다. 실제 switch 문서에서는 위 독립 조사와 같이 선택/원문 표 개수가 같았지만, 이 결과는 **분기 속 표 선택의 실파일 양성 검증이 아니라** 기존 표 검사 회귀 확인입니다. 합성 선택 표 테스트는 Debug·ReleaseSafe·ReleaseFast 각각 10/10 통과했으며, 텍스트 안쪽 동명 run과 비활성 표의 한도 미소비 반례를 포함합니다.

최종 전체 `zig build test --summary all`은 Debug 2362/2362 통과했고, `zig build -Doptimize=ReleaseSafe --summary all`, `zig build audit -Doptimize=ReleaseSafe --summary all`, `zig build compare -Doptimize=ReleaseSafe --summary all`도 통과했습니다. JS 비교는 47/47이며 CFB 제품 API 회귀 검사이지 이번 Zig 코어의 HWPX 선택 API 공개 검증은 아닙니다. `zig fmt --check build.zig src`, `git diff --check`, 독립 조사기 `--self-test`도 통과했습니다.

# HWPX 각주·미주 안의 텍스트 소유

`XmlTrees.inspectNoteText()`는 같은 선택 section 트리에서 만든 [주석 본문 보고서](hwpx-note-bodies.md)를 받아, 2011 `hp:footNote`·`hp:endNote` 아래 `hp:t` 요소와 XML 문자·CDATA 조각을 가장 가까운 주석에 연결합니다. 한컴의 [HWPX 구조 설명](https://tech.hancom.com/hwpxformat/)도 section의 `hp:p`·`hp:run`·`hp:t` 본문 계층을 설명합니다. `Document.inspectNoteText()`와 `inspectKnown().note_text`는 같은 검사기를 호출합니다. 주석·`hp:t`의 순서, section/요소 인덱스, 가장 가까운 `hp:p` 인덱스, 각 `hp:t`의 정규화 UTF-8 바이트와 빈 `hp:t`를 구분합니다. 외부 namespace의 동명 요소와 주석 밖 문자는 포함하지 않습니다. 중첩 주석 안 문자는 바깥 주석에 중복 귀속하지 않습니다.

`note_text.zig`는 이 소유 관계와 결과·한도만 담당합니다. 원문 XML 파싱과 문자 참조·CDATA·UTF-16 처리는 기존 `xml_part_tree.zig`의 순서 있는 순회 및 공통 XML 값 변환을 재사용합니다. 반환 보고서는 UTF-8 조각을 소유하므로 입력 문서·트리·주석 보고서를 해제한 뒤에도 유효하며 마지막에 `deinit()`해야 합니다. `max_text_elements`, `max_chunks`, `max_text_bytes`는 독립 한도입니다. 모순된 section 수·주석 순서·요소 종류·부모 관계는 오류로 돌려줍니다.

이 API는 선택된 section 파트 안의 **XML 텍스트 조각의 소유**를 보고합니다. `switch`의 활성 분기를 선택하지 않으므로 비활성 분기 속 주석도 포함될 수 있습니다. 인라인 컨트롤을 표시 문자로 합성하거나 화면 표시 순서·각주 번호·줄/쪽 배치·변경 추적 적용을 결정하지 않습니다. 편집·저장·무손실 왕복이나 전체 OWPML 버전 지원도 주장하지 않습니다. `hp:t`의 바이트가 같아도 실제 화면 텍스트는 다를 수 있습니다.

독립 검증은 `src/hwpx_note_text_survey.zig`가 반환한 주석별·`hp:t`별 정규화 바이트 해시와 `tools/hwpx-note-text-diff.py`의 별도 ZIP/OPF/ElementTree 해석을 **파일별로** 비교합니다. CDATA 분할 등 동등한 XML 표기는 같은 `hp:t` 바이트로 취급하지만, 문자·소유 주석·문단/요소 위치가 달라지면 해시가 달라집니다. 실파일 corpus 숫자는 이 검증 결과로만 기록하며 포맷 전체의 필수성 또는 지원률로 일반화하지 않습니다.

로컬 두 fixture 모음의 HWPX 후보 484개 중 ZIP 종료 레코드 거부 6개·암호화 2개를 제외한 476개에서 파일별 해시와 분류가 일치했습니다. 이 집합에서는 주석 1,219개, `hp:t` 20,037개, 정규화 UTF-8 313,393바이트, `hp:t`가 없는 주석 5개가 관측됐습니다. 별도 두 실파일에서는 단독 `Document`/`XmlTrees` API와 `inspectKnown()` 결과가 일치했습니다. 기존 HWPX known 실파일 ReleaseFast 8개 shard도 모두 통과했습니다.

적대적 검증 경계는 (1) 주석 밖·외부 namespace·중첩 주석의 가장 가까운 소유자와 구역별 반복 요소 인덱스, (2) XML 문자 참조·CDATA·빈 `hp:t`·UTF-16 LE/BE와 중첩 주석 안 텍스트의 제외, (3) 서로 독립적인 요소/조각/바이트 정확한 한도, (4) 모순된 주석 보고서와 모든 할당 실패의 정리, (5) 독립 오라클의 문자·요소·namespace·소유 관계 변이 및 CDATA 동등 표기입니다. Oracle의 8개 변이는 일반 Python과 `-O`에서 모두 감지됐고, 동등 표기 1개는 같은 해시였습니다. 전용 테스트는 Debug·ReleaseSafe·ReleaseFast에서 각각 8/8 통과했습니다. 이것이 화면 결과·편집·저장까지 검증했다는 뜻은 아닙니다.

`zig build -Doptimize=ReleaseSafe`, 변경 Zig 파일의 `zig fmt --check`, `git diff --check`도 통과했습니다. 전체 `zig build test --summary all`은 종료 코드 0, 5/5 단계, 2,645/2,645 테스트 통과였습니다. 이 전체 실행을 **시작한 뒤** 전용 테스트에 중첩 주석 내부 문자 분리와 구역별 반복 인덱스 두 사례를 추가했으므로, 두 사례까지 포함한 최종 전용 8/8을 세 모드에서 별도 재실행했습니다. 전체 출력의 `failed command: .../test --cache-dir=... --listen=-` 문구는 종료 상태와 분리해 [Zig stderr 재현](zig-test-stderr.md)에 따라 판정합니다.

2026-09-27 재검증: 한컴의 HWPX 구조 설명에서 section의 `hp:p`·`hp:run`·`hp:t` 관계를 확인했습니다. `HWPX note` 필터는 Debug·ReleaseSafe·ReleaseFast에서 각각 27/27, 단독/known 연결은 1/1 통과했습니다. 독립 텍스트 오라클은 일반·`-O`의 구조 변이 8개와 동등 표기 1개를 확인했고, 전체 실행에서 허용 476개·ZIP 거부 6개·암호화 2개, 주석 1,219개·`hp:t` 20,037개·정규화 UTF-8 313,393바이트·텍스트 없는 주석 5개가 파일별로 일치했습니다. 같은 코드·corpus의 known-inspections ReleaseFast 8개 shard도 각각 통과했습니다. 표시 텍스트·편집·저장까지 검증한 것은 아닙니다.

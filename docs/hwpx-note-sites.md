# HWPX 각주·미주 원문 위치

`note_bodies.Note.site`는 선택된 2011 section XML에서 주석 요소의 **원문 위치**를 보존합니다. 직접 부모가 `hp:ctrl`이면 그 인덱스, 가장 가까운 `hp:p`·`hp:run`·`hp:t`·`hp:subList`와 바깥 `hp:footNote`/`hp:endNote`의 요소 인덱스, 원본 인코딩의 section XML 시작 바이트 오프셋을 각각 반환합니다. 해당 조상이 없으면 `null`이며, 외부 namespace의 동명 요소는 조상으로 간주하지 않습니다. `note_site.zig`는 이 단일 조상 탐색만 담당하고, 주석 선택·속성·수명·한도는 기존 `note_bodies.zig`가 소유합니다.

이 위치는 주석이 놓인 XML 사이트이며 **화면 표시 번호나 커서 문자 오프셋이 아닙니다**. `hp:ctrl`은 직접 부모일 때만 기록하고, `switch` 활성 분기 선택·문단 조판·각주 번호 증가·페이지 하단 배치·편집·저장은 하지 않습니다. 공식 [한컴 NoteType 모델](https://raw.githubusercontent.com/hancom-io/hwpx-owpml-model/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/NoteType.cpp)은 주석의 `subList`를 모델링하지만, 그 사실만으로 화면 사이트의 의미나 모든 파일에 `ctrl` 래퍼가 필수임을 단정하지 않습니다. 실파일 분포는 관측치로만 취급합니다.

반환 인덱스와 바이트 오프셋은 정수여서 원본 트리를 해제해도 남습니다. 원문 XML 조각은 기존 `Note.raw_xml`이 소유합니다. `byte_offset`은 UTF-8 문자 수가 아니라 UTF-8/UTF-16을 포함한 **원본 XML 바이트** 위치이며, 원본 section 트리에서 `raw_xml`과 같은 바이트가 그 위치에 존재하는지 별도로 검사합니다.

독립 검증은 `tools/hwpx-note-sites-diff.py`가 ZIP·OPF·ElementTree로 선택 section의 요소 인덱스와 부모 체인을 다시 만들고, 별도 Expat 파서로 원본 XML의 요소 시작 **바이트 오프셋**을 수집해 `src/hwpx_note_bodies_survey.zig`의 주석별 해시·파일별 개수 및 거부/암호화 파일 집합과 대조합니다. ElementTree와 Expat의 요소 개수가 다르면 비교를 거부합니다. 제품의 원문 슬라이스 대조와 UTF-16 합성 사례도 별도로 검사합니다.

로컬 484개 HWPX 후보 중 ZIP 종료 레코드 거부 6개·암호화 2개를 제외한 허용 476개에서 파일별 위치 해시가 독립 XML 결과와 일치했습니다. 주석 1,219건 모두 직접 `hp:ctrl` 부모와 `hp:p`·`hp:run` 조상을 가졌고, `hp:subList` 조상은 52건, `hp:t` 조상 및 바깥 주석 조상은 각각 0건이었습니다. 이는 두 fixture 집합의 분포일 뿐 다른 버전의 필수 규칙이 아닙니다. 기존 주석 본문 독립 오라클도 476개 파일에서 기존 필드 해시·개수가 그대로 일치했습니다.

적대적 검증은 (1) 정확한 namespace의 직접 `ctrl`과 외부 namespace 래퍼, (2) 가장 가까운 문단·run·목록 및 중첩 주석, (3) 독립 Expat의 원본 UTF-16 바이트 오프셋과 양 바이트 순서·트리 해제 후 정수 수명, (4) 잘못된 요소 인덱스·종류·부모 경계·순환 관계의 오류 반환, (5) 독립 오라클의 8개 구조 변이 검출 및 동등한 빈 태그 표기의 불변성으로 나누었습니다. 오라클은 일반 Python과 `python3 -O`에서 같은 반례를 감지했습니다. 최종 전용 5개 테스트는 Debug·ReleaseSafe·ReleaseFast에서 각각 5/5 통과했습니다. 두 실파일의 단독/known 결과와 기존 HWPX known ReleaseFast 8개 shard도 일치했습니다. 기존 주석 본문 전용 검사는 ReleaseSafe·ReleaseFast에서 각각 10/10, 주석 텍스트·번호 관계의 ReleaseSafe 회귀는 각각 8/8·7/7 통과했습니다.

`zig build -Doptimize=ReleaseSafe`, 대상 Zig 파일의 `zig fmt --check`, `git diff --check`도 통과했습니다. 전체 `zig build test --summary all`은 종료 코드 0, 5/5 단계, 2,651/2,651 테스트 통과였습니다. 이 전체 실행을 시작한 뒤 **테스트만** UTF-16 BE 사례를 보강했으며, 그 최종 전용 테스트를 세 모드에서 별도 재실행했습니다. 출력의 `failed command: .../test --cache-dir=... --listen=-` 문구는 종료 상태와 분리해 [Zig stderr 재현](zig-test-stderr.md)에 따라 판정합니다.

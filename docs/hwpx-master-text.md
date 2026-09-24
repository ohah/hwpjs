# HWPX 마스터페이지 텍스트 이벤트

`Document.inspectMasterPageText`는 [마스터페이지 파트 선택](hwpx-master-pages.md)이 고른 OPF 파트를 manifest 순서대로 읽고, 각 루트의 직접 `hp:subList` 아래만 순회합니다. 외국 namespace의 동명 요소와 `subList` 밖 문단은 텍스트로 합치지 않습니다. 중첩된 표 등의 후손 문단은 포함합니다. `inspectKnown`의 `master_page_text`에도 같은 검사 결과가 들어갑니다.

문단·run·`hp:t` 경계, XML 정규화된 UTF-8 문자 내용, 인라인 요소의 시작·끝·빈 태그와 조건부 분기 관측 규칙은 [section 텍스트 이벤트](hwpx-section-text.md)의 단일 스캐너를 공유합니다. `Location.part_kind=.master_page`와 `part_ordinal`은 마스터페이지의 manifest 선택 순번이며 `item_index`는 원본 manifest 항목입니다. 기존 section 이벤트는 `part_kind=.section`이고 기존 `section_ordinal`을 유지합니다. 마스터페이지 이벤트에서 `section_ordinal`은 유효한 section 위치가 아니므로 `part_ordinal`을 사용합니다. 문단/run/text 순번은 보고서 전체에 걸친 관측 순번이지 페이지 표시 순서가 아닙니다.

기본 모드는 조건부 분기를 모두 관측합니다. 호출자가 `text.scan.branch_policy.mode=.selected`와 실제 지원 namespace를 명시하면 활성 분기만 이벤트·개수에 남깁니다. 이때 비활성 분기 안의 중첩 문단 수는 원본 파트 메타데이터 수보다 적을 수 있으므로 두 값을 무조건 같다고 강제하지 않습니다. XML 문법 자체는 비활성 분기도 검사합니다.

보고서의 `parts`·`sub_lists`·`xml_bytes`는 마스터페이지 선택·해제 범위이며, `text`는 재사용한 문단/run/text 집계입니다. `text.sections`는 0이고 `direct_paragraphs`는 각 직접 `subList`의 직접 문단 합계입니다. `text_bytes`는 `hp:t` 하위의 UTF-8 문자 내용 바이트 합계이며 인라인 요소를 임의 문자로 치환하지 않습니다. 기본 한도는 파트 4096개, 파트별 XML 32 MiB, 합계 128 MiB이며 텍스트 요소·인라인 요소·UTF-8 본문 한도는 [section 계약](hwpx-section-text.md)의 스캐너와 공유하지만 별도 호출 예산으로 적용됩니다. 콜백의 태그/scope/텍스트 바이트는 호출 중에만 유효하고 오류 전까지 일부 이벤트가 전달됐을 수 있습니다.

이 API는 바탕쪽의 텍스트·요소 순서를 관측할 뿐 section과의 합성, 앞/뒤 배치, 조건부 쪽 적용, 서식/필드 의미, 편집·저장·렌더링을 구현하지 않습니다. `inspectKnown` 성공도 전체 HWPX 유효성이나 문서 표시 동일성을 뜻하지 않습니다.

## 검증

합성 ZIP은 선택 범위 밖의 동명/다른 namespace 요소, 중첩 문단, 문자 참조·CDATA·빈 `t`·인라인 순서, 정확한 파트/XML/텍스트 한도, 콜백 오류 뒤 재시도와 전 할당 실패 경로를 확인합니다. 재현 명령은 [개발·검증 명령](development-commands.md)에 둡니다.

독립 `tools/hwpx-manifest-xml-oracle.py`는 Python 표준 `zipfile`/`ElementTree`로 같은 OPF manifest 파트를 조사합니다. 문단/run/`hp:t`/빈 `t`/UTF-8 바이트 수에 더해, 문서마다 `[`·내용·`]`을 입력한 FNV-1a 64비트 텍스트 순서 지문을 계산하고 shard별 모듈러 합을 Zig 이벤트 콜백과 대조합니다. 지문은 내부 태그의 이름·속성이나 화면상 문자열을 포함하지 않으므로 그 의미의 동치 근거로 확대하지 않습니다. corpus는 로컬 `reference/rhwp`에 의존하며 기본 audit에는 선택 실파일 8개 shard가 포함되지 않습니다.

2026-09-25 로컬 corpus 484개에서 ZIP 거부 6개·암호화 2개를 제외한 476개 문서의 마스터페이지 61개를 조사했습니다. 직접 `subList` 아래 문단 394개·run 521개·`hp:t` 371개·문자 내용 0바이트인 `t` 165개·UTF-8 문자 내용 3,280바이트가 독립 XML 조사와 일치했습니다. 8개 shard 각각의 문서별 텍스트 순서 지문 합계도 일치했습니다. 실파일에 조건부 분기가 있음을 이 결과가 보장하지 않으므로 그 분기는 합성 ZIP에서 따로 검사했습니다. 전체 HWPX 포맷/레이아웃의 일치를 주장하지 않습니다.

적대적 재검토에서 선택 모드의 비활성 분기 안에 중첩 문단이 있으면, 원본 파트 메타데이터의 전체 문단 수와 선택 이벤트의 문단 수를 잘못 강제 대조해 `InconsistentMasterPageSelection`이 나는 결함을 재현했습니다. 선택 모드에서만 그 대조를 생략하고, 기본 양쪽 분기 모드에서는 일치 검사를 유지했습니다. 같은 반례가 수정 전에는 실패하고 수정 뒤에는 통과하며, 비활성 분기의 잘못된 XML 문자 참조는 여전히 오류가 됩니다.

최종 소스에서 마스터페이지 합성 테스트 6/6은 Debug·ReleaseSafe·ReleaseFast에서, section 스캐너 회귀 테스트 11/11은 Debug에서 통과했습니다. 전체 Debug `zig build test --summary all`은 2,341/2,341, ReleaseSafe 제품 빌드, JS 비교 47/47, ReleaseSafe 전체 `zig build audit -Doptimize=ReleaseSafe --summary all`, `zig fmt --check build.zig src`, `git diff --check`, 독립 Python oracle 자체 테스트가 통과했습니다. 선택 실파일 8개 shard는 원본 양쪽 분기 모드에서 통과했습니다. 그 뒤 변경은 선택 모드의 문단 수 대조 조건에만 한정되며, 최종 소스의 shard 0도 다시 통과했습니다.

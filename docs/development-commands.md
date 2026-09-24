# 개발·검증 명령

[HWPX 문단 직접 자식 구조](hwpx-paragraph-children.md)는 `zig test src/root.zig --test-filter 'HWPX paragraph children'`로 합성·한도 검사를, `python3 tools/hwpx-section-text-oracle.py`와 선택 실파일 known survey 8개 shard로 독립 집계를 대조합니다. 실파일 표본은 로컬 `reference/rhwp`가 필요합니다.

[HWPX 문단 줄 조각](hwpx-line-segments.md)은 `zig test src/root.zig --test-filter 'HWPX line segments'`로 합성·숫자 경계·할당 실패를, 같은 독립 조사기와 선택 실파일 known survey 8개 shard로 원값 합계·부재·음수·상위 비트 편차를 대조합니다.

[HWPX 마스터페이지 문단 줄 조각](hwpx-master-line-segments.md)은 `zig test src/root.zig --test-filter 'HWPX master line segments'`로 합성·예산·할당 실패를, `python3 tools/hwpx-manifest-xml-oracle.py --self-test`와 인자 없는 corpus 조사 및 선택 실파일 known survey 8개 shard로 독립 원값 합계를 대조합니다.

[HWPX 마스터페이지 문단 직접 자식](hwpx-master-paragraph-children.md)은 `zig test src/root.zig --test-filter 'HWPX master paragraph children'`로 합성·전역 예산·할당 실패를, `python3 tools/hwpx-manifest-xml-oracle.py --self-test`와 인자 없는 corpus 조사 및 선택 실파일 known survey 8개 shard로 독립 자식 분포를 대조합니다.

[HWPX 마스터페이지 텍스트 이벤트](hwpx-master-text.md)는 `zig test src/root.zig --test-filter 'HWPX master text'`와 기존 `HWPX section text` 필터로 합성·공통 스캐너 회귀를 확인합니다. `python3 tools/hwpx-manifest-xml-oracle.py --self-test` 및 인자 없는 corpus 조사와 `HWPX known document inspections shard N` 8개 선택 검사는 텍스트 개수·UTF-8 바이트·문서별 순서 지문 합계를 대조합니다. 선택 shard는 로컬 `reference/rhwp`가 필요하고 기본 audit에는 포함되지 않습니다.

[HWPX 마스터페이지 이진 리소스 참조](hwpx-master-binary-references.md)는 `zig test src/root.zig --test-filter 'HWPX master binary'`로 합성·한도·할당 실패를 확인합니다. 독립 `python3 tools/hwpx-manifest-xml-oracle.py --self-test` 및 인자 없는 corpus 조사와 `HWPX known document inspections shard N` 8개 선택 검사는 출처별 대상 분포를 대조합니다. 선택 shard는 로컬 `reference/rhwp`가 필요합니다.

[HWPX 마스터페이지 표 격자](hwpx-master-table-geometry.md)는 `zig test src/root.zig --test-filter 'HWPX master table geometry'`로 범위·병합·예산·할당 실패를 검사합니다. `python3 tools/hwpx-table-oracle.py --self-test`와 인자 없는 corpus 조사에서 `master_shards`를 만들고, `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter 'HWPX known document inspections shard N'`을 N=0..7 각각 실행해 대조합니다. 실파일 조사는 로컬 `reference/rhwp`가 필요합니다.

[HWPX 조건부 참조 선택](hwpx-switch-selection.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX selected references'`로, 실제 corpus 대조는 `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter 'HWPX known document inspections shard N'`을 N=0..7 각각 별도 프로세스로 실행합니다. 후자는 로컬 `reference/rhwp`가 필요합니다.

[HWPX 표 격자 구조](hwpx-table-geometry.md)는 `zig test src/root.zig --test-filter 'HWPX table geometry'`로 합성·할당 실패를, 위 known survey 8개 shard로 실파일 표·행·셀 개수와 진단을 검사합니다. 독립 조사기 반례는 `python3 tools/hwpx-table-oracle.py --self-test`, 실파일 집계는 인자 없이 실행합니다. 실파일 조사는 기본 audit에 포함되지 않습니다.

[표 셀 크기·여백·속성·테두리 참조](hwpx-table-cell-fields.md)는 `zig test src/root.zig --test-filter 'HWPX table cell fields'`, `--test-filter 'HWPX table cell attributes'`, `--test-filter 'HWPX table cell border references'`와 `--test-filter 'HWPX known inspections distinguish missing border target'`로 합성·오류·참조 분기·할당 실패를 확인합니다. `zig test src/hwpx/xml_values.zig`는 공통 숫자 어휘를 검사합니다. 같은 known survey 8개 shard로 독립 Python 조사기의 크기·여백·속성 분포와 테두리 ID 해결을 대조합니다. 기본 audit에는 실파일 분할이 포함되지 않습니다.

[표 셀 직접 subList](hwpx-table-cell-sublists.md)는 `zig test src/root.zig --test-filter 'HWPX cell subLists'`로 합성·오류·한도·할당 실패를, 위의 `HWPX known inspections include table geometry`로 전체 문서 연결을 확인합니다. 같은 known survey 8개 shard에서 독립 Python 조사기의 목록·직접 문단·속성 분포를 대조합니다.

[표 자체 속성](hwpx-table-attributes.md)은 `zig test src/root.zig --test-filter 'HWPX table attributes'`로 합성·오류·할당 실패를 확인합니다. 독립 `python3 tools/hwpx-table-oracle.py --self-test` 및 인자 없는 corpus 집계와 위 known survey 8개 shard를 대조합니다. 특히 표 `borderFillIDRef=0`의 미해결 5건을 셀 참조 결과와 혼동하지 않습니다.

[표 직접 여백·셀 구역](hwpx-table-children.md)은 `zig test src/root.zig --test-filter 'HWPX table children'`로 합성·오류·예산·할당 실패를 검사합니다. 위 독립 표 조사기와 선택 실파일 known survey 8개 shard에서 여백·구역 수와 좌표·테두리 ID 합계를 대조합니다.

[표 상속 shape 필드·자식](hwpx-table-shape.md)은 `zig test src/root.zig --test-filter 'HWPX table shape'`로 합성·오류·예산·할당 실패를, `python3 tools/hwpx-table-oracle.py --self-test`로 독립 반례를 검사합니다. 선택 실파일 known survey 8개 shard에서 `sz`·`pos`·`outMargin`·`caption`·`label` 분포와 원값 합계, 모델 밖 `textWrap=THROUGH`를 대조합니다.

[표 행·셀 직접 자식 topology](hwpx-table-child-topology.md)는 `zig test src/root.zig --test-filter 'HWPX table child topology'`로 합성·한도·할당 실패를, 같은 독립 표 조사기와 선택 실파일 8개 shard로 미등록 자식·속성 및 알려진 직접 자식의 정확한 두 관측 순서와 나머지 순서 분포를 대조합니다.

[선택 분기 section 텍스트](hwpx-selected-section-text.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX selected section text'`로 실행합니다. 조건부 분기가 있는 실파일의 텍스트 보존 대조는 같은 known survey 8개 shard에 포함됩니다.

[선택 분기 서식 참조](hwpx-selected-style-references.md)는 `zig test src/root.zig --test-filter 'HWPX selected style references'`로 합성·할당 실패를 검사합니다. 실파일의 선택 텍스트·서식 참조 교차 대조는 위 known survey 8개 shard를 별도 프로세스로 실행합니다.

```sh
zig fmt --check build.zig src
zig build test
zig build -Doptimize=ReleaseSafe
zig build compare -Doptimize=ReleaseSafe
zig build audit -Doptimize=ReleaseSafe
```

파서·writer 변경에는 정상 입력뿐 아니라 잘림·잘못된 참조·크기 경계 테스트를 추가합니다. WASM ABI 변경은 실제 WebAssembly 인스턴스에서 확인합니다. 문서만 변경한 경우 관련 링크·경로·내용 검증으로 충분합니다.

HWPX 전용 테스트는 `zig test src/root.zig --test-filter HWPX`로 실행합니다. ZIP 엔트리·손상 경계·할당 실패와 두 corpus의 패키지 관계·버전 XML·[암호화 분류](hwpx-protection.md), 대표 표본의 [header·spine 구조](hwpx-document-structure.md)와 [header 리소스 ID 색인](hwpx-header-resources.md), [section p/run 서식 참조](hwpx-section-references.md), [header 내부 서식 참조](hwpx-header-references.md), [언어별 글꼴 ID](hwpx-font-references.md), [번호·글머리표 내부 참조](hwpx-list-references.md), [이진 리소스 manifest 연결](hwpx-binary-references.md), [차트 경로·XML 경계](hwpx-chart-references.md)를 검사합니다. 기존 패키지 테스트 일부가 Git에 추적되지 않는 로컬 `reference/rhwp` 예제를 사용하므로 이 명령과 `zig build test`도 깨끗한 체크아웃에서 그대로 재현되지는 않습니다. 나머지 내부 참조나 공개 JS API 검사는 아닙니다. ZIP 범위는 [HWPX ZIP 컨테이너](hwpx-zip-container.md), 패키지 관계 범위·실측은 [HWPX 패키지 관계 검증](hwpx-package-relationships.md), 버전 필드 변형은 [HWPX 버전 XML 검증](hwpx-version.md)을 참조합니다.

[차트 데이터 캐시 구조](hwpx-chart-cache.md) 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX chart cache'`로 선택할 수 있습니다. 차트 경로 검사와 결합된 캐시 진단 및 두 차트 간 한도 테스트는 `--test-filter 'HWPX chart'`로 함께 확인합니다.

[차트 수식 참조 구조](hwpx-chart-formula.md) 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX chart formula'`로 선택합니다. 경로와의 통합 테스트는 `--test-filter 'HWPX chart'`에 포함됩니다.

[차트 값·수식 텍스트 관측](hwpx-chart-text.md)의 공통 XML 이벤트 테스트는 `zig test src/root.zig --test-filter 'XML content visitor'`, 차트의 텍스트 한도·집계는 `zig test src/root.zig --test-filter 'HWPX chart'`로 확인합니다. 선택 실파일 제품 조사와 독립 대조는 각각 아래 `hwpx_structure_survey.zig`의 차트 필터와 `python3 tools/hwpx-chart-text-oracle.py`를 실행합니다. Python oracle은 제품·기본 audit 의존성이 아닙니다.

[차트 ST_Xstring](hwpx-xstring.md)의 해독기 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX Xstring'`, 차트 통합 테스트는 위 `HWPX chart` 필터로 실행합니다. corpus에는 해당 이스케이프가 없으므로 독립 oracle의 원문 값 길이 대조를 해독 정확성의 증거로 사용하지 않습니다.

[HWPX section 텍스트·내부 요소 이벤트](hwpx-section-text.md)는 `zig test src/root.zig --test-filter 'HWPX section text'`로 합성·오류 경계를 검사합니다. 선택 실파일 제품 조사는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX corpus section text and inline token read-only survey'`, 직접 run이 없는 실파일 회귀 검사는 같은 명령의 필터를 `HWPX layout-only paragraph keeps its real section diagnostic`으로 바꿔 실행합니다. 독립 대조는 `python3 tools/hwpx-section-text-oracle.py`로 실행합니다. 이 선택 검사들은 Git에 없는 로컬 `reference/rhwp`가 필요하며 기본 audit에 포함되지 않습니다.

[HWPX section 원문·요소 인덱스](hwpx-section-tree.md)의 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX section tree'`로 실행합니다. 선택 실파일 조사는 `HWPX corpus section tree shard 0`부터 `shard 7`까지의 이름을 각각 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter '<이름>'`에 넣어 **별도 프로세스**로 실행합니다. 한 프로세스에서 전 shard를 실행하면 메모리 압박으로 종료될 수 있습니다. 이 조사는 위와 같은 로컬 corpus가 필요하며 기본 audit에는 포함되지 않습니다. 독립 요소 수와 shard별 기대값은 `python3 tools/hwpx-section-text-oracle.py`의 `section_elements`·`section_tree_shards`와 대조합니다. 선택한 문단·run 속성 6개의 정규화 값과 부재는 `section_tree_shards[].attribute_digest_sum`, 출현·빈 값 수는 `section_attribute_counts`로 독립 대조합니다.

[HWPX header 원문·요소 인덱스](hwpx-header-tree.md)의 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX header tree'`로 실행합니다. 선택 실파일 조사는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX corpus header tree read-only survey'`로 별도 실행하고, `python3 tools/hwpx-section-text-oracle.py`의 `header_elements`·`header_ordered_digest_sum`을 독립 대조합니다. Git에 없는 로컬 `reference/rhwp`가 필요하며 기본 audit에는 포함되지 않습니다.

[HWPX 문서 XML 트리 조립](hwpx-document-trees.md)의 합성·할당 실패 검사는 `zig test src/root.zig --test-filter 'HWPX XML trees'`로 실행합니다. 선택 실파일은 `HWPX owned XML document trees shard 0`부터 `shard 7`까지를 각각 `zig test src/hwpx_document_trees_survey.zig -O ReleaseFast --test-filter '<이름>'`에 넣어 **별도 프로세스**로 실행합니다. `python3 tools/hwpx-section-text-oracle.py`의 `section_tree_shards[]`에 있는 `accepted`·`sections`·`header_elements`·`elements`·`header_bytes`·`section_bytes`와 독립 대조합니다. 이 조사는 로컬 `reference/rhwp`가 필요하며 기본 audit에는 포함되지 않습니다.

[HWPX 문단 메타 속성](hwpx-paragraph-metadata.md)의 단위 검사는 `zig test src/root.zig --test-filter 'HWPX paragraph metadata'`로 실행합니다. 위의 같은 8개 선택 shard가 `section_tree_shards[].paragraph_metadata`의 문단·ID·Boolean 집계도 독립 대조합니다. 기본 audit에는 이 실파일 대조가 포함되지 않습니다.

[HWPX header 시작 번호](hwpx-header-begin-numbers.md)의 단위 검사는 `zig test src/root.zig --test-filter 'HWPX begin numbers'`로 실행합니다. 위의 8개 선택 shard가 `section_tree_shards[].begin_numbers`의 요소·속성 존재 및 값 합계와 독립 대조합니다. 이 실파일 대조도 기본 audit에는 포함되지 않습니다.

[HWPX 현재 지원 검사 묶음](hwpx-known-inspections.md)의 합성·실예제·할당 실패 테스트는 `zig test src/root.zig --test-filter 'HWPX known'`로 실행합니다. 선택 실파일은 `HWPX known document inspections shard 0`부터 `shard 7`까지를 각각 `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter '<이름>'`에 넣어 별도 프로세스로 실행합니다. 로컬 `reference/rhwp` corpus가 필요하고 기본 audit에는 포함되지 않습니다. 이 검사는 반복 파싱으로 비용이 높으며 전체 문서 유효성 판정이 아닙니다.

[HWPX 모든 ZIP 엔트리 무결성](hwpx-payload-integrity.md)의 합성 손상·한도·소유권 테스트는 `zig test src/root.zig --test-filter 'HWPX payload integrity'`로 실행합니다. 이 검사는 `inspectKnown`에도 포함되므로 위 8개 선택 shard는 미선택 BinData·부가 ZIP 엔트리의 해제·CRC도 거칩니다. 바이너리 내부 포맷·XML 스키마까지 검증하는 것은 아닙니다.

[HWPX OPF 선언 XML 전수 문법 검사](hwpx-manifest-xml.md)는 `zig test src/root.zig --test-filter 'HWPX manifest XML'`로 단위 검사를 실행합니다. `inspectKnown`의 위 8개 선택 shard가 전체 내장 `application/xml` 엔트리의 수·바이트·요소 및 settings/masterpage 수를 `python3 tools/hwpx-manifest-xml-oracle.py`의 독립 ZIP/ElementTree 결과와 대조합니다. 외부/비XML 항목이나 XML 의미 검증으로 확대하지 않습니다.

[HWPX settings 원값 검사](hwpx-settings.md)는 `zig test src/root.zig --test-filter 'HWPX settings'`와 `zig test src/root.zig --test-filter 'HWPX known'`로 합성 ZIP·묶음 경로를 확인합니다. 위 `HWPX known document inspections shard 0`부터 `shard 7`까지의 선택 실파일 검사는 `python3 tools/hwpx-manifest-xml-oracle.py`의 settings 존재·Caret/config 개수·값 합계와 대조합니다. 전체 설정 의미 검증은 아닙니다.

[HWPX masterpage 파트·참조](hwpx-master-pages.md)는 `zig test src/root.zig --test-filter 'HWPX master'`로 합성 ZIP·오류·한도·할당 실패를 확인합니다. 위의 8개 `HWPX known document inspections shard N` 선택 검사에서 `python3 tools/hwpx-manifest-xml-oracle.py`의 루트 타입·subList 개수·pageNumber 합계·section 참조·선언 수를 대조합니다. `masterPageCnt`와 실제 참조 개수의 동치는 주장하지 않습니다.

[HWPX ParaListType 직접 속성](hwpx-para-list.md)도 같은 `HWPX master` 합성 검사를 사용합니다. 독립 Python 조사의 subList 직접 문단 수·속성 존재·폭/높이 합계는 위 8개 실파일 shard와 대조합니다. 기본 audit에 실파일 조사가 포함되지는 않습니다.

[마스터페이지 문단 메타 값](hwpx-paragraph-metadata.md)도 `HWPX master` 합성 검사와 위 8개 shard에서 확인합니다. 독립 Python 조사의 `master_paragraphs`·ID 부재/0·`paraTcId` 부재·Boolean true 집계와 대조하며, section 기존 경로는 `zig test src/root.zig --test-filter 'HWPX paragraph metadata'`로 확인합니다.

[마스터페이지 서식 참조](hwpx-master-style-references.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX master style'`, 기존 section 규칙의 회귀는 `zig test src/root.zig --test-filter 'HWPX section references'`로 확인합니다. 위 `HWPX known document inspections shard N` 8개 선택 검사는 독립 `python3 tools/hwpx-manifest-xml-oracle.py`의 `master_style_*` 집계와 대조하며 기본 audit에는 포함되지 않습니다.

[run 변경 추적 ID 원값](hwpx-run-metadata.md)의 합성 section·마스터페이지 검사는 `zig test src/root.zig --test-filter 'HWPX run metadata'`로 실행합니다. 위의 8개 선택 shard는 독립 `python3 tools/hwpx-manifest-xml-oracle.py`의 `section_run_metadata`·`master_run_metadata`와 대조합니다. 실파일에서는 두 속성이 전부 부재하므로 명시적 값 분기는 합성 테스트만 검증합니다.

[run 위치·자식 진단](hwpx-run-topology.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX run topology'`로 실행합니다. 같은 8개 선택 shard에서 독립 Python oracle의 `*_run_non_direct`, `*_run_secpr_*`, `*_run_child_classes`와 대조하며, 공개 모델 미등록 요소를 오류로 강제하지 않습니다.

[`hp:t` 원값·자식 진단](hwpx-text-nodes.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX text node'`로 실행합니다. 같은 8개 선택 shard에서 독립 Python oracle의 `*_text_nodes`·`*_text_child_classes`와 대조합니다. 선택 검사에는 로컬 corpus가 필요하고 기본 audit에는 포함되지 않습니다.

[조건부 switch 구조](hwpx-switch-shape.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX switch shape'`로 실행합니다. 선택 실파일 8개 shard에서 독립 oracle의 `section_switch_shape`·`master_switch_shape` 21개 슬롯과 대조합니다. 기본 audit에는 실파일 shard가 포함되지 않습니다.

[`hp:tab` 속성 진단](hwpx-inline-tab.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX tab attributes'`로 실행합니다. 같은 8개 선택 shard에서 독립 oracle의 `section_tab_fields`·`master_tab_fields` 21개 슬롯과 대조합니다. 기본 audit에는 실파일 shard가 포함되지 않습니다.

[인라인 주석 마커 속성](hwpx-inline-annotations.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX inline annotation'`으로 실행합니다. 같은 8개 선택 shard에서 독립 oracle의 `section_markpen_fields`·`master_markpen_fields` 9개 슬롯과 `section_title_mark_fields`·`master_title_mark_fields` 6개 슬롯을 대조합니다.

[인라인 변경 추적 태그](hwpx-track-change-tags.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX track change tag'`로 실행합니다. 같은 8개 선택 shard에서 독립 oracle의 `section_track_change_tag_fields`·`master_track_change_tag_fields` 20개 슬롯을 대조합니다. 현재 corpus에는 네 태그가 없어 실파일 속성값은 검증되지 않았습니다.

[HWPX section 직접 문자 콘텐츠](hwpx-section-content.md)의 단위 테스트도 위의 `HWPX section tree` 필터에 포함됩니다. 같은 8개 선택 shard에서 `section_tree_shards[].content_digest_sum`을 독립 Python Expat의 직접 콘텐츠 합계와 대조합니다. 이 합계는 요소별 정규화 문자 값의 검증이며 개별 콜백 경계의 동치 주장은 아닙니다.

요소와 문자를 섞어 전달하는 `visitOrdered`도 같은 테스트·shard 명령으로 검사합니다. 독립 Expat의 경계별 문자·시작/끝 순서 해시는 `section_tree_shards[].ordered_digest_sum`으로 대조하며, 빈 태그는 시작+끝으로 정규화합니다. 순서 해시의 반례 테스트는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX ordered digest detects moved text'`로 실행합니다. 주석·처리 지시문과 콜백 분할은 포함하지 않습니다.

[HWPX XML 네임스페이스 버전 경계](hwpx-namespace-profiles.md)는 `zig test src/root.zig --test-filter 'HWPX namespace profile'`로 합성 루트·패키지 오류를 검사합니다. 로컬 corpus의 header·spine 루트 분포는 `python3 tools/hwpx-section-text-oracle.py`의 `header_root_names`·`spine_xml_root_names`로 확인합니다. 해당 corpus에 후속 OWPML 루트가 없으므로 이 검사는 후속 버전 실파일 호환성 검사가 아닙니다.

전체 corpus의 header/section XML 문법·namespace, 제품 header·spine 구조, header 리소스 ID 색인, section 및 header 서식 참조, 언어별 글꼴·번호·글머리표·이진 리소스·차트 경로 연결 조사는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast`로 명시적으로 실행합니다. 이 선택 조사는 Git에 추적되지 않는 로컬 `reference/rhwp` 클론이 있어야 재현됩니다. 수백 MB의 해제 XML을 읽으므로 기본 `zig build test`·`audit`에는 포함하지 않습니다. 묶음 실행은 큰 메모리 사용량으로 중단될 수 있어 `--test-filter 'HWPX corpus chart path and XML read-only survey'`처럼 corpus 항목별 단독 실행 결과를 구분해 기록합니다. 원본은 변경하지 않으며 선행 XML 관측은 [HWPX XML 구조 조사](hwpx-xml-structure-evidence.md), 제품 구조 검증 결과는 [header·spine 구조](hwpx-document-structure.md), ID 색인 결과는 [header 리소스](hwpx-header-resources.md), 참조 결과는 [section 서식 참조](hwpx-section-references.md)·[header 내부 참조](hwpx-header-references.md)·[글꼴 ID 참조](hwpx-font-references.md)·[번호·글머리표 참조](hwpx-list-references.md)·[이진 리소스 연결](hwpx-binary-references.md)·[차트 경로 검증](hwpx-chart-references.md)이 각각 소유합니다.

테스트용 문서 보고서의 기대 바이트 간격/필드 위치는 `tests/hwp5/document-report-wire.mjs`에서 공유합니다. 제품 serializer로부터 생성하지 않아 독립 대조를 유지하며, 다른 테스트에 구역 stride·필드 offset 숫자를 다시 복제하지 않습니다. 구역 인덱스 정렬 검증은 서로 다른 진단값을 가진 입력으로 수행합니다.

일반 컨테이너 보고서(mode 25)의 마지막 decoded bytes/uninspected streams 위치는 `tests/hwp5/container-report-wire.mjs`가 소유합니다. 선택적 추가 보고서를 붙이기 전의 기본 보고서에만 적용하며, 제품 serializer에서 기대 위치를 생성하지 않습니다.

`zig build line-cache-audit`는 변경 추적 병합 문단의 읽기 전용 실파일 조사와 조사 도구의 적대적 테스트를 실행합니다. 전체 `audit`에도 포함됩니다. 해석 범위와 실측은 [병합 줄 캐시 조사](hwp5-merged-line-cache.md)가 소유합니다.

`zig build history-xml-audit`는 별도 설치된 `xmllint`가 PATH에 있을 때 이력의 읽기 전용 XML 조사를 실행합니다. 자동 설치하거나 제품/WASM에 링크하지 않습니다. 외부 도구가 필요 없는 안전 경계 단위 테스트만 기본 `audit`에 포함하며, 실제 XML 조사는 명시적으로 실행합니다. 계약과 실측은 [이력 XML 조사](hwp5-history-xml-evidence.md)가 소유합니다.

## PrvImage 조사

`zig build preview-image-audit --summary all`은 제품 WASM 빌드 후 조사 도구 테스트와 기본 HWP fixture의 읽기 전용 시그니처 조사를 실행하며 정규 audit에도 포함됩니다. 제품 이미지 검사 명령이 아닙니다. 범위를 넓히려면 빌드 후 아래 명령에 디렉터리를 명시합니다. 직접 자식 파일만 조사합니다. 계약·미구현 범위는 [PrvImage 형식 조사](hwp5-preview-image-evidence.md)에 둡니다.

`zig build doc-options-audit --summary all`은 DocOptions 관측 테스트와 기본 corpus 조사를 실행합니다. 확장 조사는 `node tests/hwp5/doc-options-survey.mjs legacy/rust/crates/hwp-core/tests/fixtures reference/rhwp/samples`로 재현합니다. 직접 자식 HWP 파일만 읽으며 내부 문서 경로는 출력하지 않습니다. 필드 검증과의 경계는 [DocOptions 조사](hwp5-doc-options-evidence.md)에 둡니다.

```sh
node tests/hwp5/preview-image-survey.mjs legacy/rust/crates/hwp-core/tests/fixtures reference/rhwp/samples
```

## 차트 Contents 관측

제품 WASM 빌드 후 루트에서 `node --test tests/hwp5/chart-contents-evidence.test.mjs`와 `node tests/hwp5/chart-contents-survey.mjs`를 실행합니다. 조사 범위와 의미 해석의 경계는 [차트 Contents 실측](hwp5-chart-contents-evidence.md)에 둡니다. 정규 audit와 별개의 읽기 전용 조사입니다.

`zig build chart-ownership-audit --summary all`은 SHA-256으로 고정한 실제 Contents 표본의 소유권·원본 복제·span patch·String 정의 편집·참조 분리/재파싱·OOM·모든 잘림·한도 오류 검사와 표본 모듈 생성기 테스트를 실행합니다. `-Doptimize=ReleaseSafe` 또는 `-Doptimize=ReleaseFast`로 같은 검사를 실행할 수 있으며 정규 `audit`에도 포함됩니다. 매 실행마다 기존 corpus에서 원본을 다시 확인하고 생성한 Zig 모듈은 빌드 캐시에만 둡니다. 필요한 표본이 없으면 다른 표본으로 대체하지 않고 실패합니다. 선택 배치와 검증 한계는 [Contents 조립](hwp5-chart-observed-contents.md), 원본 출력 계약은 [차트 원본 바이트 보존](hwp5-chart-source-preservation.md), patch 계약은 [차트 원본 span patch writer](hwp5-chart-patch-writer.md), 정의 편집 계약은 [차트 String 객체 편집](hwp5-chart-string-edit.md), 참조 분리 계약은 [차트 String 참조 분리](hwp5-chart-string-fork.md)가 소유합니다.

## 세 빌드 모드 회귀 검증

GIF의 macOS ImageIO 제3 구현 대조는 선택적 테스트이며 정규 audit나 제품 빌드에 Swift/CoreGraphics 의존성을 추가하지 않습니다. `swiftc tests/hwp5/gif-imageio-oracle.swift -O -o /tmp/hwpjs-gif-imageio-oracle`로 oracle을 빌드할 수 있습니다. stdin으로 GIF를 받고 프레임 RGBA JSON을 출력하며, `tests/hwp5/gif-imageio.mjs`의 compareGifImageIo가 단일 프레임/팔레트/크기 전제를 확인한 뒤 픽셀을 대조합니다. 대상과 결과는 [GIF 복호화 기록](gif-indexed.md)에 둡니다.

ICC 식별자 스냅샷의 생성 파일 일치는 `node tools/icc-registry/generate.mjs --check`, 추출·다운로드·스냅샷·생성 테스트는 `zig build icc-registry-audit --summary all`로 오프라인 검사합니다. 정규 audit에도 포함되며 자동 다운로드/갱신하지 않습니다. 원본 JSON 변경 후 생성기 stdout을 검토해 data.zig에 반영합니다. 계약은 [ICC 등록부 조회](icc-registry-lookup.md)에 둡니다.

언어 태그 등록 테이블은 `node tools/language-registry.mjs --check`로 오프라인 일치를 검사합니다. `--fetch`는 공식 IANA 원본으로부터 축약 JSON을, `--tables`는 로컬 source.json으로부터 파생 파일 내용을 JSON으로 표준 출력합니다. 두 명령 모두 파일을 자동 덮어쓰지 않습니다. 갱신 시 source.json과 파생 파일을 함께 검토·반영하고 전체 audit를 실행합니다. 계약은 [BCP 47 등록 검증](bcp47-registry.md)을 참고합니다.

공유 zig-out 산출물이 덮어써지지 않도록 아래 명령은 순차 실행합니다.

```sh
zig build audit --summary all
zig build audit -Doptimize=ReleaseSafe --summary all
zig build audit -Doptimize=ReleaseFast --summary all
```

수정한 테스트 Zig 파일도 zig fmt --check 대상으로 확인하고, 변경 JS 파일은 node --check로 검사합니다. 검사 횟수는 로그에서 확인하며 지원 범위와 동일시하지 않습니다.

소스 변이 검증은 각 변이를 독립 복사본에 적용하고 실행 직전에 그 복사본의 `.zig-cache`를 제거합니다. 같은 길이·같은 시각의 연속 변경이 이전 컴파일 결과를 재사용할 수 있으므로 최초 한 번만 cache를 지우는 것으로는 충분하지 않습니다. `--test-filter`를 사용할 때는 출력된 테스트 이름·개수를 확인하며, root import의 lazy declaration 때문에 전용 모듈 테스트가 수집되지 않으면 해당 Zig 파일을 직접 실행합니다.

ReleaseFast의 누수 검증을 std.testing.allocator의 기본 안전 검사에만 의존하지 않습니다. 특히 기대한 파싱/검증 오류를 잡아 성공으로 반환하는 테스트는 OOM 주입 검사와 별도로 정상 할당 후 오류 경로의 해제량을 확인합니다. 명시적 할당 회계 또는 safety=true인 검사 할당자를 사용하며, 실제로 해제 코드를 제거한 변형이 각 모드에서 실패하는지 확인합니다. Zig 0.16에서 확인한 재현과 보강 근거는 [BMP 적대적 검증](bmp-pixels.md)에 둡니다.

WASM 거부 테스트는 임의 예외나 메시지만으로 성공을 판정하지 않습니다. 파서가 반환한 정상 오류의 종류와 기대 오류명을 확인하고, WebAssembly.RuntimeError 및 호스트 TypeError/RangeError는 테스트 실패로 남깁니다. 독립 oracle도 의도한 검증 실패와 자체 실행 오류를 구분합니다. 실제 trap 주입이 거부 통계에 숨었던 재현과 방어 검사는 [BMP RLE 검증](bmp-rle.md)을 참고합니다.

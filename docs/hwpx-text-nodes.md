# HWPX `hp:t` 원값·직접 자식 진단

`src/hwpx/text_node.zig`는 2011 namespace의 section 전체 및 선택된 마스터페이지 루트 직접 `hp:subList` 아래에서 `hp:t`를 관측합니다. 직접 부모가 `hp:run`인지, 선택적 `charStyleIDRef`가 없는지·0인지·32비트 범위를 넘는지, 직접 자식의 이름과 namespace를 집계합니다. 없는 속성을 0으로 채우지 않으며, 속성 어휘는 공통 XML `nonNegativeInteger` 검사기를 재사용합니다. 32비트 초과 값은 원본 XML을 보존한 채 진단으로 남기고 거부하지 않습니다. 숫자 범위를 넘어서는 원값을 정수로 저장하거나 서식 참조를 임의 연결하지 않습니다.

[한컴의 고정 리비전 `CT` 모델](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/t.cpp)은 `charStyleIDRef`와 직접 자식 이름 14개를 등록합니다. 이 이름들의 코드 SSOT는 `src/hwpx/text_child_names.zig`이며 기존 section 텍스트 이벤트와 이번 진단이 함께 사용합니다. [참고 2011 ParaList XSD 사본](https://github.com/edwardkim/rhwp/blob/main/mydocs/manual/OWPML%20SCHEMA/ParaList%20XML%20schema.xml)은 `nonNegativeInteger`와 `hyphen` 철자를 사용하지만, 공개 C++ 모델은 `hypen`을 등록합니다. 따라서 `hypen`은 모델 범주, `hyphen`은 XSD 전용 범주로 구분하고 어느 쪽도 자동 삭제·오류 처리하지 않습니다. 나머지 2011 이름과 다른 namespace 이름도 별도 진단입니다. 이 이름 목록은 모든 버전의 엄격한 허용 목록이 아닙니다.

독립 Python ZIP/ElementTree 조사(`tools/hwpx-manifest-xml-oracle.py`)에서 로컬 HWPX 484개 중 ZIP 거부 6개·암호화 2개를 제외한 476개 문서의 section `hp:t`는 230,677개였습니다. 이 중 `charStyleIDRef` 부재 230,131개, 명시적 값 546개, 0 또는 32비트 초과 값은 0개였습니다. 선택된 마스터페이지 `hp:t`는 371개이며 모두 해당 속성이 없었습니다. 두 범위에서 직접 `hp:run` 밖 `t`와 모델 미등록 자식도 0개였습니다. 직접 자식은 section 15,255개, 마스터페이지 78개이며, corpus에서 나온 이름은 `tab`, `fwSpace`, `nbSpace`, `lineBreak`, `titleMark`, `markpenBegin`, `markpenEnd`, `hypen`입니다. 미출현 분기와 경계값은 합성 테스트로만 뒷받침합니다.

section은 소유 `XmlTrees.inspectTextNodes`, 마스터페이지는 `Document.inspectMasterPageTextNodes`, 묶음 API는 두 별도 보고서로 제공합니다. 공통 XML 이벤트/깊이 한도와 `t` 수, 마스터페이지 파트 수·각/전체 XML 바이트·속성 바이트 한도를 적용합니다. 보고서는 숫자와 manifest 항목 인덱스·해당 part 안의 `t` 순번만 소유하므로 별도 해제가 없습니다. 문자 조각의 순서·디코딩은 [section 콘텐츠 이벤트](hwpx-section-content.md)가 소유하며, 표시 텍스트·삽입/삭제 적용·`charStyleIDRef`의 대상 표·자식별 속성 의미·편집/저장은 이 검사 범위가 아닙니다.

후속 [`hp:tab` 속성 진단](hwpx-inline-tab.md)은 이번 검사가 선택한 직접 인라인 자식에만 적용합니다. `tab` 숫자/이름 원값 판정은 별도 파일이 소유하고 text 노드는 선택 범위·개수 한도를 소유합니다.

[인라인 주석 마커 속성 진단](hwpx-inline-annotations.md)도 이번 검사가 선택한 직접 `markpenBegin`·`markpenEnd`·`titleMark`에만 적용합니다. 각 속성 어휘는 별도 파일이, 세 종류를 합친 개수 한도는 text 노드가 소유합니다.

적대적 점검에서 기존 section 텍스트 검사와 이번 검사에 이름 8개가 중복되어 있던 문제를 찾아 공통 이름 모듈로 합쳤습니다. 실파일에 없는 모델 자식까지 14개 전부 합성 테스트에 포함하고, `hyphen`만 있는 경우에도 첫 모델 미등록 자식 위치가 남는지 검사합니다. 32비트 초과 값 0건은 Zig 결과만으로 주장하지 않고 독립 Python oracle에도 별도 카운터를 두어 대조합니다. XML 어휘 오류·속성 바이트 한도·중첩/타 namespace `t`·마스터페이지 선택 범위·할당 실패도 합성 테스트로 확인합니다.

2026-09-24 검증: 전체 Debug 테스트 2,248개, ReleaseSafe 제품 빌드와 전체 audit 40단계·2,287개 테스트, 전용 Debug·ReleaseSafe·ReleaseFast 테스트가 통과했습니다. 수정된 독립 oracle의 section·마스터페이지 `hp:t` 원값·자식 분류 수치를 선택 실파일 8개 shard의 Zig 보고서와 대조해 모두 일치했습니다. 실파일 shard는 기본 audit에 포함되지 않습니다. 이 숫자는 `hp:t` 의미 해석이나 HWPX 전체 문서 유효성의 완료율이 아닙니다.

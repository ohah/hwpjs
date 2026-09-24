# HWPX 인라인 주석 마커 속성

`src/hwpx/text_node.zig`가 2011 paragraph namespace의 `hp:t` **직접 자식**으로 분류한 `markpenBegin`·`markpenEnd`·`titleMark`만 관측합니다. `markpen_attributes.zig`는 시작 마커의 선택적 `color`와 끝 마커의 추가 속성을, `title_mark_attributes.zig`는 선택적 `ignore`를 각각 소유합니다. 같은 text 노드의 section·선택 마스터페이지 보고서에 별도 필드로 노출하고 `max_annotation_markers`는 세 종류 합산 한도입니다. 원문 XML은 상위 트리에 남기고 이 보고서는 개수·색상 합계만 보유합니다.

[2011 ParaList XSD 사본](https://github.com/edwardkim/rhwp/blob/main/mydocs/manual/OWPML%20SCHEMA/ParaList%20XML%20schema.xml)은 `markpenBegin/@color`를 선택적 RGB 색상, `titleMark/@ignore`를 기본값 `false`인 선택적 Boolean으로 정의합니다. [Core XSD의 RGBColorType](https://github.com/edwardkim/rhwp/blob/main/mydocs/manual/OWPML%20SCHEMA/Core%20XML%20schema.xml)은 `#`와 6개 16진수 자리를 요구합니다. [한컴 markpenBegin](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/markpenBegin.cpp)·[titleMark 모델](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/titleMark.cpp)도 각각 두 속성을 읽고 씁니다. 여기서는 RGB 어휘와 공통 XML Boolean 어휘(`true`·`false`·`1`·`0`)를 검사합니다. 부재를 `#000000` 또는 명시적 `false`로 바꾸지 않으며, 잘못된 값은 원문을 보존하고 별도 진단 개수로 남깁니다. 추가 속성도 별도 집계합니다.

독립 Python ZIP/ElementTree oracle(`tools/hwpx-manifest-xml-oracle.py`)의 로컬 HWPX 484개 중 ZIP 거부 6개·암호화 2개를 제외한 476개 문서에서 section 직접 `markpenBegin` 27개(색상 27개, 모두 유효; `#FFFFFF` 26개·`#FFFF00` 1개), `markpenEnd` 31개, `titleMark` 367개(`ignore` 모두 명시적 `1`)가 나왔습니다. 선택 마스터페이지에는 세 종류 모두 0개입니다. 시작·끝 개수가 **다르므로 이 계층에서 짝맞춤 오류를 강제하지 않습니다.** 이 불균형의 의미나 화면 표시 효과는 이 집계만으로 판정할 수 없습니다.

합성 검사는 부재·0 색상·소문자 16진수·잘못된 색상/Boolean·추가 속성·타 namespace·중첩 요소·두 마스터페이지를 넘는 합산 한도와 할당 실패를 다룹니다. 실파일 검사는 독립 oracle의 section/마스터페이지별 `markpen_fields` 9개·`title_mark_fields` 6개 값을 8개 shard의 Zig 보고서와 대조합니다. 원문 삽입/삭제·표시·마커 짝 관계·편집/저장이나 HWPX 전체 유효성 판정은 후속 범위입니다.

2026-09-24 검증: 전체 Debug 2,254개 테스트, ReleaseSafe 제품 빌드·전체 audit, 전용 Debug·ReleaseSafe·ReleaseFast 테스트와 실파일 8개 shard가 통과했습니다. 적대적 재검토에서는 필드 판정을 `text_node.zig`에 복제하지 않고 두 속성 파일에 나눈 점, namespace 선언을 추가 속성으로 세지 않는 점, `ignore` 부재를 명시적 false와 구별하는 점, malformed 값에서 원문을 보존하는 점을 확인했습니다. 시작 27개/끝 31개를 같은 수로 맞추는 오류 규칙은 추가하지 않았습니다. 관측되지 않은 버전과 렌더링 의미는 검증 완료가 아닙니다.

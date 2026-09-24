# HWPX `hp:t` 변경 추적 태그 원값

`src/hwpx/track_change_tag_attributes.zig`는 [text 노드 검사](hwpx-text-nodes.md)가 2011 paragraph namespace의 `hp:t` 직접 자식으로 선택한 `insertBegin`·`insertEnd`·`deleteBegin`·`deleteEnd`의 `Id`·`TcId`·`paraend` 속성만 진단합니다. 네 종류별 개수와 각 숫자 속성의 부재/0/32비트 초과/어휘 오류, 32비트 이내 양수 합계, Boolean의 부재/참/거짓/오류, 시작 태그의 `paraend` 존재 및 추가 속성 수를 구분합니다. 보고서는 원문을 수정하거나 개별 원값을 소유하지 않습니다. `max_track_change_tags`는 section 전체 또는 선택 마스터페이지 전체의 네 종류 합산 한도입니다.

[2011 ParaList XSD의 `TrackChangeTag`](https://github.com/edwardkim/rhwp/blob/main/mydocs/manual/OWPML%20SCHEMA/ParaList%20XML%20schema.xml)은 세 속성을 모두 선택 속성으로 두고 `Id`·`TcId`에 `nonNegativeInteger`, `paraend`에 Boolean을 지정합니다. [한컴의 고정 리비전 `CTrackChangeTag` 모델](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/trackchangetag.cpp)은 두 ID를 `UINT`로 읽고 쓰며 `paraend`는 끝 태그에서만 읽고 씁니다. 따라서 32비트 초과와 시작 태그의 `paraend`는 별도 진단이지만 이 계층에서 문서를 즉시 거부하지 않습니다. XSD의 속성 부재를 모델 생성자의 0·false 기본값으로 채우지 않습니다. XML 어휘 오류도 원문 보존 진단이며, 이름 대소문자를 바꾸거나 `Id`·`TcId`를 같은 ID로 합치지 않습니다.

독립 Python ZIP/ElementTree oracle(`tools/hwpx-manifest-xml-oracle.py`)이 수용한 로컬 HWPX 476개 문서에서는 section과 선택 마스터페이지의 네 태그가 모두 0개였습니다. 각 8개 shard의 20개 필드 슬롯을 Zig 보고서와 대조하지만 이는 실파일 필드값의 동치 증거가 아닙니다. 합성 XML에서 네 종류·명시적 0·부재·32비트 초과·잘못된 정수/Boolean·추가 속성·타 namespace/중첩 요소·다중 section 및 마스터페이지 합산 한도·할당 실패를 검증합니다. 시작/끝 쌍, 변경 추적 대상 표와의 참조, 문단 간 범위, 삽입·삭제 적용 및 편집/저장은 후속 범위입니다.

2026-09-24 검증: 전체 Debug 테스트 2,256개, ReleaseSafe 제품 빌드·전체 audit, 전용 Debug·ReleaseSafe·ReleaseFast 테스트가 통과했습니다. 독립 Python 집계기를 Zig 합성 사례와 같은 원값 조합으로 별도 실행해 20개 슬롯도 대조했습니다. 적대적 점검은 32비트 초과를 XSD 오류로 강제하지 않는 점, 시작 `paraend`를 무조건 무시하지 않는 점, namespace 선언/타 namespace 속성의 구분, 부재와 0/false의 구분, 네 종류 합산 한도의 파트 간 적용을 확인했습니다. 실파일 8개 shard의 대조는 별도 선택 검사이며 기본 audit에 포함되지 않습니다.

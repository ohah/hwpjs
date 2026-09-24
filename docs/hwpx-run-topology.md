# HWPX run 위치·직접 자식 진단

`src/hwpx/run_topology.zig`는 2011 namespace의 section 전체와 선택된 마스터페이지 루트 직접 `hp:subList` 후손을 별도로 순회합니다. `hp:run`이 직접 `hp:p` 아래인지, run의 직접 자식 수와 namespace, `hp:secPr`의 개수·첫 자식 여부를 기록합니다. 중첩 표·개체 안의 문단도 문단으로 취급하지만 run을 표시 텍스트나 유효 문서 노드로 임의 승격하지 않습니다. 첫 비직접 run·중복/늦은 `secPr`·모델 미등록 자식의 manifest 항목 인덱스와 **해당 part 안의** run 순번을 남깁니다. 보고서는 숫자·인덱스만 소유해 별도 해제가 없습니다.

직접 자식 분류의 `model`은 [한컴 RunType 코드의 고정 리비전](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/RunType.cpp)의 등록 이름 30개와 대응합니다. 실파일에서 나오는 `bookmark`·`switch`는 별도 범주이며, 나머지 2011 paragraph namespace 자식과 다른 namespace 자식도 각각 손실 없이 집계합니다. **이 분류는 2011 형식의 완전한 허용 목록이 아닙니다.** 등록되지 않은 요소를 오류나 삭제 대상으로 취급하지 않습니다. [한컴의 스키마 설명](https://tech.hancom.com/python-hwpx-parsing-2/)은 2021 namespace 예시에서 선택적 `secPr`가 앞에 오는 구조를 보여 주지만, 이 검사는 그것을 2011 입력에 그대로 강제하지 않습니다.

독립 Python ZIP/ElementTree 조사(`tools/hwpx-manifest-xml-oracle.py`)에서 로컬 HWPX 484개 중 ZIP 거부 6개·암호화 2개를 제외한 476개 문서의 section run 267,347개·마스터페이지 run 521개를 관측했습니다. 부모가 직접 `hp:p`가 아닌 run과 `secPr` 중복은 0개입니다. section의 직접 `secPr`는 555개이며, **그중 32개는 첫 자식이 아닙니다**. 따라서 늦은 `secPr`를 무조건 오류로 하면 실제 입력을 거부합니다. section 직접 자식 중 모델 이름은 269,498개, `bookmark` 9개, `switch` 93개이고 다른 2011 이름·타 namespace는 0개였습니다. 마스터페이지 직접 자식 633개는 모두 모델 이름입니다. 이 분포는 해당 corpus의 사실일 뿐 모든 버전의 스키마 계약이 아닙니다.

section 검사는 소유 `XmlTrees.inspectRunTopology`, 마스터페이지 검사는 `Document.inspectMasterPageRunTopology`, 묶음 결과는 `inspectKnown`의 두 별도 보고서로 제공합니다. section은 기존 소유 XML을 읽고, 마스터페이지는 선택된 part를 한도 안에서 다시 해제·순회합니다. 전체 run 수, 마스터페이지 파트 수·파트별/전체 XML 바이트, 공통 XML 이벤트/깊이 한도를 적용합니다. 문서 모델의 run 자식 의미·조건부 분기 선택, `bookmark` 내부 구조, 편집/저장 및 2011 전체 XSD 적합성은 후속입니다.

후속 [직접 switch 구조 진단](hwpx-switch-shape.md)은 `switch`의 case/default 모양을 별도 파일에서 관측합니다. 이 문서의 직접 자식 분류는 계속 run topology가 소유하며, 실제 분기 선택은 두 보고서 모두 제공하지 않습니다.

2026-09-24 검증: 독립 oracle과 제품 보고서의 8개 corpus shard를 대조했으며, 전체 Debug 테스트 2,243개, ReleaseSafe 빌드, ReleaseSafe 전체 audit 40단계·2,282개 테스트, 전용 ReleaseFast 테스트가 통과했습니다. 합성 입력에서는 비직접 run, 중첩 문단, 중복·늦은 `secPr`, 모델 미등록·타 namespace 자식, 마스터페이지 선택 범위, 파트별 위치, 크기 한도와 할당 실패를 점검했습니다. 이 결과는 위 진단 범위의 일치만 뒷받침하며 전체 HWPX 문서 모델의 완성이나 모든 파일에 대한 무손실 편집을 뜻하지 않습니다.

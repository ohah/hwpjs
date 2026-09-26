# HWPX 마스터페이지 문단·run 서식 참조

활성 `case`/`default`만 따로 검사하려면 [선택 분기 마스터페이지 서식 참조](hwpx-selected-master-style-references.md)를 사용합니다. 이 문서의 기본 API는 원문 양쪽 분기 보고서를 유지합니다.

`Document.inspectMasterPageStyleReferences`는 보호 여부·정규 masterpage 파트·section 연결을 먼저 검사하고, 같은 문서에서 선택된 header의 명시적 리소스 ID를 색인합니다. `src/hwpx/masterpage_style_references.zig`는 각 선택 파트 XML을 별도 한도에서 다시 읽어 **루트 직접 `hp:subList` 아래**의 모든 `hp:p`와 `hp:run`을 순회합니다. 다른 루트 직접 자식과 namespace가 다른 동명 요소는 대상이 아닙니다. [한컴 PType 구현](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/PType.cpp)의 `paraPrIDRef`·`styleIDRef`와 [RunType 구현](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/RunType.cpp)의 `charPrIDRef`를 해당 header의 `paraPr`·`style`·`charPr` 명시적 ID에 연결합니다.

속성→테이블 매핑과 숫자·대상 판정은 `paragraph_style_links.zig`·`id_references.zig`가 [section 서식 참조](hwpx-section-references.md)와 함께 소유합니다. 마스터페이지 순회만 중복하지 않는 별도 모듈이며, ID를 배열 위치나 암묵적 0으로 취급하지 않습니다. 속성 부재, 명시적 ID의 대상 누락, 대상 그룹 자체 부재, 해결을 분리하고 첫 미해결 ID 및 manifest 항목 인덱스를 남깁니다. 숫자 손상·32비트 초과, XML 오류와 각 한도 초과는 오류입니다. 미해결 대상은 이 API에서 진단으로 반환하며 임의 보정하지 않습니다.

보고서는 선택 파트·직접 subList·문단·run 수, subList 직접 자식이 아닌 문단 수, 문단 직접 자식이 아닌 run 수, 해제한 XML 바이트 및 세 종류 참조 집계를 반환합니다. 숫자 집계만 소유하므로 별도 `deinit`이 없지만, 첫 미해결 manifest 인덱스를 경로로 해석하려면 원본 `Document`가 살아 있어야 합니다. 파트 수, 파트별·전체 XML 바이트, 속성 바이트, 문단·run 수, 공통 XML 순회 한도를 각각 적용합니다. `inspectKnown`도 같은 공개 진입점을 호출하며 추가 파싱 비용이 있습니다.

독립 Python ZIP/ElementTree 조사(`tools/hwpx-manifest-xml-oracle.py`)는 두 로컬 corpus의 HWPX 484개 가운데 ZIP 거부 6개·암호화 2개를 제외한 476개에서 masterpage 61개, 문단 394개(비직접 331개), run 521개(비직접 0개)를 관측했습니다. `paraPrIDRef`·`styleIDRef`·`charPrIDRef`의 출현/해결은 각각 394·394·521개이고 부재·대상 누락·대상 그룹 부재는 모두 0개였습니다. 선택 실파일 제품 검사는 8개 별도 shard에서 이 숫자를 대조합니다. 이 결과는 corpus의 서식 ID 연결에 한정되며 표·그림의 의미, 글꼴 실제 표시, 레이아웃, 저장·편집이나 모든 HWPX 버전의 유효성 증명은 아닙니다.

합성 ZIP 테스트는 희소 ID, 명시적 0과 부재, 대상 테이블 부재, 중첩 문단과 문단 밖 run, 범위 밖 namespace 요소, 잘못된·초과 숫자, 정확한 한도, 모든 할당 실패 지점과 명시적 해제 회계를 검사합니다. 실파일 조사는 기본 audit 밖에서 별도 실행합니다.

최종 소스에서 마스터페이지 서식 참조 전용 테스트 6개는 Debug·ReleaseSafe·ReleaseFast에서 통과했고, 네이티브 Debug 전체 테스트는 2,231개가 통과했습니다. 실파일 8개 shard와 독립 Python 조사는 위 corpus 수치를 대조했습니다. 이 검증은 관측된 ID 연결과 방어 경계의 증거일 뿐, HWPX 전체 파서 완성의 증거는 아닙니다.

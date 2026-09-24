# HWPX masterpage 파트와 section 참조

`Document.inspectMasterPages`는 OPF manifest에 선언된 정규 `Contents/masterpageN.xml` 항목을 선택합니다. ZIP 해제·공통 XML 문법/namespace 검사를 거쳐 namespace가 없는 `masterPage` 루트의 `id`, `type`, `pageNumber`, `pageDuplicate`, `pageFront` 원값과 각 속성의 부재를 구분해 소유합니다. 루트의 직접 `hp:subList`는 소유 배열로 반환하며, 공통 속성 계약과 직접 문단 경계는 [ParaListType 속성](hwpx-para-list.md)이 소유합니다. 다른 직접 요소는 별도 수로 남깁니다. 없는 마스터페이지는 빈 배열이며 대체 페이지를 만들지 않습니다. 중복 경로, 잘못된 media-type, 외부 항목, 암호화 문서는 명시적으로 거부합니다.

`type`의 알려진 값은 `BOTH`, `EVEN`, `ODD`, `LAST_PAGE`, `OPTIONAL_PAGE`입니다. 미지 값은 원문과 함께 미지원 진단으로 남깁니다. `pageNumber`는 unsigned 32-bit, 두 플래그는 XML Boolean 어휘만 검사합니다. `id`는 비어 있으면 거부합니다. manifest ID와 루트 ID가 달라도 값을 임의로 합치지 않고 불일치로 보고합니다.

구조 검사에서 선택된 각 section의 `hp:masterPage/@idRef`를 루트 ID에 연결하며, 값 부재·대상 누락·중복 ID에 따른 모호함을 각각 보고합니다. 참조하지 않는 파트도 진단에 남깁니다. `hp:secPr/@masterPageCnt`는 존재할 때 unsigned 32-bit 원값을 보존하지만 참조 수와의 일치를 강제하지 않습니다. 실파일에서 0이면서 참조가 존재하는 예가 있어, 그 수치의 정확한 적용 범위를 명세와 더 대조하기 전까지 문서 전체 오류로 단정하지 않습니다.

manifest 경로와 루트 ID는 별도 색인으로 조회해, 많은 참조가 각 파트 전체를 반복 검색하지 않도록 합니다. 색인 키는 보고서가 소유한 문자열을 빌리며 실패·해제 경로에서도 독립 복제를 만들지 않습니다.

한컴의 [MasterPageType 구현](https://github.com/hancom-io/hwpx-owpml-model/blob/main/OWPML/Class/Etc/MasterPageType.cpp)은 루트 이름, 다섯 속성, `subList`를 정의하고 [열거형](https://github.com/hancom-io/hwpx-owpml-model/blob/main/OWPML/Class/enumdef.h)은 다섯 `type` 값을 나열합니다. section-side [masterPage 참조 구현](https://github.com/hancom-io/hwpx-owpml-model/blob/main/OWPML/Class/Para/masterPage.cpp)은 `idRef`를 사용합니다. 이 공식 모델과 실파일 모두 바탕쪽 내부 문단·표·그림·서식/레이아웃 의미까지 이번 검사로 검증되었다는 근거는 아닙니다.

실파일 corpus는 두 로컬 소스의 HWPX 484개이며, ZIP 거부 6개·암호화 2개를 제외한 476개에서 masterpage 파트 61개를 확인했습니다. 독립 Python ZIP/ElementTree 조사는 루트 타입별 `BOTH` 3·`EVEN` 21·`ODD` 30·`LAST_PAGE` 6·`OPTIONAL_PAGE` 1, 직접 subList 61개, section 참조 61개(모두 유일한 루트 ID에 연결), `pageNumber` 값 합계 4, `masterPageCnt` 선언 555개를 관측했습니다. 참조·파트 수가 일치한다는 사실은 이 corpus 밖의 문서나 모든 버전의 무결성을 증명하지 않습니다.

후속 범위: subList 내부의 문단·서식·오브젝트 의미, 마스터페이지의 적용 순서/겹침/앞뒤 배치, 쪽 번호 조건, `masterPageCnt` 의미, 2011 외 namespace 및 저장·편집. 현재 API는 이 영역을 전체 문서 유효성 판정으로 승격하지 않습니다.

검증: 합성 ZIP에서 정상 연결·불일치 원값·누락/중복 ID·잘못된 루트 거부·미지원 타입 보존·media-type/외부·한도 경계·원본 해제 뒤 보고서 수명·별도 할당자·모든 할당 실패 지점을 검사했습니다. `zig test src/root.zig --test-filter 'HWPX master'`는 Debug·ReleaseSafe·ReleaseFast에서 각각 통과했습니다. 선택 실파일 8개 shard의 파트/참조/타입/수치 집계도 독립 Python oracle과 일치했고, 전체 Debug `zig build test --summary all`은 2,219/2,219 통과했습니다. 이 수치는 전체 HWPX 지원률이 아닙니다.

경로·ID 색인으로 중복 검사와 참조 조회의 제곱 시간 경로를 제거한 최종 소스에서도 위 8개 shard와 2,219개 테스트를 다시 통과했습니다. `zig build -Doptimize=ReleaseSafe`, `zig build audit -Doptimize=ReleaseSafe --summary all`, `zig fmt --check build.zig src`, `git diff --check`도 성공했습니다. audit의 HWP5/WASM 통과는 마스터페이지 내부 의미의 검증 근거로 확대하지 않습니다.

후속 [직접 ParaListType 속성](hwpx-para-list.md) 단계에서 루트 직접 `hp:subList`의 소유 배열·원값·직접 문단 경계를 추가했습니다. 이 소스의 전체 Debug 테스트 2,224개와 실파일 8개 shard가 독립 조사와 일치했습니다. 위의 2,219개는 이전 단계의 기록입니다.

# HWPX ParaListType 직접 속성

`src/hwpx/para_list_attributes.zig`는 `hp:subList`에 공통인 속성 원값의 소유·어휘 검사를 담당합니다. 현재 호출자는 `masterpage_parts.zig`의 루트 직접 자식 `hp:subList`뿐입니다. [한컴 ParaListType 구현](https://github.com/hancom-io/hwpx-owpml-model/blob/main/OWPML/Class/Para/ParaListType.cpp) 및 [필드 선언](https://github.com/hancom-io/hwpx-owpml-model/blob/main/OWPML/Class/Para/ParaListType.h)을 필드 이름과 타입의 기준으로 삼습니다. 코드를 복사하거나 한컴 모델의 기본값을 입력 문서에 임의로 채우지 않습니다.

`Attributes.raw`는 `id`, `textDirection`, `lineWrap`, `vertAlign`, `linkListIDRef`, `linkListNextIDRef`, `textWidth`, `textHeight`, `hasTextRef`, `hasNumRef`, `metatag` 순서로 XML 정규화된 UTF-8 원값을 소유합니다. `null`은 부재, 빈 문자열은 실제 빈 값입니다. 방향·줄바꿈·세로 정렬의 알려진 열거값은 각각 `HORIZONTAL/VERTICAL/VERTICALALL`, `BREAK/SQUEEZE/KEEP`, `TOP/CENTER/BOTTOM`입니다. 미지 열거값은 버리지 않고 `unknown_enums`에 집계합니다. 네 참조·크기 값은 unsigned 32-bit, 두 플래그는 XML Boolean 어휘로 검사합니다. 알려지지 않은 무명·다른 namespace 속성은 `other_attributes`에 계수하며 의미를 추측하지 않습니다. `id` 및 `metatag`의 의미·유일성은 여기서 추측하지 않습니다.

마스터페이지 파트는 `sub_lists`를 소유 배열로 반환합니다. 각 항목은 직접 자식 `hp:p` 수, 다른 직접 요소 수, 그 아래 더 깊은 `nested_elements` 수를 분리합니다. 파트의 `descendant_elements`는 모든 직접 `subList`와 다른 직접 요소 아래의 후손 수입니다. 이 두 요소 수는 **검증 완료 항목 수가 아닙니다.** `hp:p` 내부의 중첩 문단을 직접 문단으로 세지 않습니다. 파트별 subList·직접 문단 개수 및 속성 길이에 독립 한도를 둡니다. 직접·중첩 문단의 메타 속성은 [공통 문단 규칙](hwpx-paragraph-metadata.md)을 재사용하지만, 문단·표·도형의 서식 참조, 리스트 참조의 실제 대상, 바탕쪽 배치/레이아웃, 저장·편집은 검증하지 않습니다. XML 문법·namespace·전체 요소/깊이 한도는 기존 공통 XML 순회가 소유합니다.

합성 테스트는 두 subList의 독립 상태, 중첩 `hp:p` 비계상, 부재/빈 값, 미래 열거값, 숫자·Boolean 오류, 정확한 개수/속성 한도, 보고서 수명과 모든 할당 실패 위치를 검사합니다. 독립 Python ZIP/ElementTree 조사(`tools/hwpx-manifest-xml-oracle.py`)는 두 로컬 corpus의 484개 HWPX 가운데 ZIP 거부 6개와 암호화 2개를 제외한 476개에서 직접 subList 61개, 직접 문단 63개를 확인했습니다. 61개 모두 앞의 10개 속성이 있고 `metatag`은 없으며, 미지 열거값 0개, `textWidth` 합 3,159,534, `textHeight` 합 4,466,417입니다. `src/hwpx_known_survey.zig`의 8개 독립 shard가 이 숫자를 제품 파서와 대조합니다. 이는 이 corpus의 해당 경계 대조일 뿐 전체 HWPX 문서 적합성의 증거가 아닙니다.

최종 소스에서 Debug·ReleaseSafe·ReleaseFast의 `HWPX master` 테스트 각각 13개, 전체 Debug `zig build test --summary all` 2,224개, 선택 실파일 8개 shard, `zig build -Doptimize=ReleaseSafe`, `zig build audit -Doptimize=ReleaseSafe --summary all`, `zig fmt --check build.zig src`가 통과했습니다. audit의 다른 포맷 검증은 ParaListType 내부 의미 완료의 근거가 아닙니다.

후속: 일반 표/도형 안의 다른 ParaListType 호출자 연결, 마스터페이지 문단·run의 서식 참조, 문단 내용의 의미 조립, `metatag` 내용·쪽 배치·저장 정책. 이 단계의 보고서는 문서 모델이나 무손실 편집 지원을 뜻하지 않습니다.

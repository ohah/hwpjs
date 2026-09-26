# HWPX 수식 caption의 직접 subList

[수식 도형 자식](hwpx-equation-shapes.md)에서 읽은 `hp:caption` 바로 아래의 `hp:subList`를 검사합니다. `shape_caption.zig`가 표·수식 caption의 직접 자식 순회, 정확한 2011 paragraph namespace, 목록별 직접 문단 수, 중복·부재·한도를 한곳에서 처리합니다. 속성 이름·어휘는 기존 [ParaListType](hwpx-para-list.md)의 `para_list_attributes.zig`가 소유합니다. 수식의 원문 부분 범위·속성값 복제는 `equation_caption.zig`가 소유하고, 표는 기존 `table_shape.zig` 집계 필드를 유지합니다.

수식 `Report.caption_sub_lists`는 원래 순서대로 각 목록의 부모 shape 자식 인덱스, XML 요소 인덱스, 정확한 원문 부분 슬라이스, 11개 ParaListType 속성의 부재/UTF-8 값, 직접 `hp:p` 수, 다른 직접 하위 요소 수, 미지 enum·추가 속성 수를 소유합니다. `ShapeChild.first_caption_sub_list`와 `caption_sub_list_count`는 해당 연속 구간을 가리킵니다. `SubList.get(field)`는 존재하는 빈 속성을 빈 문자열로, 없는 속성을 `null`로 반환합니다. 원문은 수식 XML 소유 복사본을 빌리고, 속성값 복제는 수식의 `max_owned_bytes`에 포함됩니다.

`Report.caption`은 목록 총수, caption별 목록 부재·중복, 직접 문단·다른 직접 자식, 미지 enum·미등록 속성을 집계합니다. caption에 목록이 없어도 원문과 부재 진단을 반환하며, 중복된 목록은 모두 검사합니다. 잘못된 숫자·Boolean·중복 XML 속성은 오류를 전파합니다. 다른 namespace의 `subList`나 손자 문단을 직접 목록·문단으로 세지 않습니다. `max_caption_sub_lists`와 `max_caption_direct_paragraphs`는 문서 내 수식 caption 전체에 누적 적용하며 기본값은 각각 1,000,000개입니다. 단일 속성에는 기존 `max_attribute_bytes`가 적용됩니다. 배열·arena 메타데이터는 `max_owned_bytes`의 바이트 집계 밖입니다.

`caption.other_direct_children`은 caption의 `subList` 외 직접 요소와 각 `subList`의 문단 외 직접 요소를 합한 수입니다. 원문 조각은 조상 namespace 선언을 따로 담지 않으므로 독립 XML 문서로 취급하지 않습니다. 요소 사이의 직접 문자 내용은 원문에 남기되 의미 검사나 문단 수에 포함하지 않습니다.

합성 테스트는 11개 속성·문자 참조·원문 부분 범위·호출 뒤 독립 수명, 부재/빈 값/미지 enum, 두 목록·빈 caption·다른 namespace·손자 요소, 후행 목록의 오류, 한도 정확값과 한 개/한 바이트 초과, 모든 할당 실패를 검사합니다. 패키지와 `inspectKnown()` 경로도 캡션 속성의 수명·전달을 검사합니다. 기존 표 shape 집중 테스트와 실파일 known survey는 같은 순회로 교체한 표 결과의 회귀 검사입니다. 독립 XML 조사기는 목록 위치·11개 속성 부재/값·직접 문단 수 등을 파일별 수식 해시에 넣고 자체 변이 반례를 검사합니다. 실파일에 수식 caption이 없으므로 별도의 고정 합성 XML에서 Python SHA-256 값을 계산해 Zig의 동일 보고서 해시와 대조합니다. 재현 명령은 [개발·검증 명령](development-commands.md)에 둡니다.

허용된 HWPX corpus의 수식 23,236개에는 직접 caption/subList가 **0개**입니다. 따라서 실파일 대조에서 0개가 일치한다는 사실은 캡션 값 파싱의 실파일 검증이 아닙니다. 이 경로의 필드·오류 검증은 합성 테스트에 의존합니다. 캡션 문단의 텍스트 의미, 서식 적용·수식 배치, 목록 참조 대상, 수식 문법·렌더링, 편집·저장·무손실 왕복은 남아 있습니다.

## 검증 기록

2026-09-26: 최종 소스의 Debug `zig build test --summary all` 2,572/2,572, 수식 집중 검사는 Debug·ReleaseSafe·ReleaseFast 각각 19/19, 표 shape 집중 검사는 Debug 5/5로 통과했습니다. `zig fmt --check build.zig src`, `zig build -Doptimize=ReleaseSafe --summary all`도 통과했습니다. Python 독립 XML 조사기의 기본·`-O` 반례 검사와 파일별 476개 대조, Python이 계산한 SHA-256을 고정한 caption 합성 예제의 Zig 해시 검사도 통과했습니다. `inspectKnown()`의 ReleaseFast 실파일 8개 shard는 각각 별도 프로세스로 통과했고, 기본 전체 테스트 밖입니다.

적대적 검증은 (1) 부재/빈 값/미지 enum·중복된 뒤쪽 목록 오류, (2) namespace·직접 자식/손자 경계, (3) 단일 필드·소유 바이트·전체 목록·직접 문단 한도, (4) 문서 해제 뒤 소유권과 모든 할당 실패, (5) 독립 XML 예제의 문자 참조·속성·위치·문단 개수 해시 및 표의 기존 실파일 집계 회귀를 각각 확인했습니다. 이는 검사 범위의 증거이며 본문 의미나 무손실 저장의 검증은 아닙니다.

2026-09-27 재검증: 한컴 고정 버전의 caption 직접 `subList`와 현재 `shape_caption.zig`·`equation_caption.zig`의 분리 경계를 대조했습니다. `HWPX equation` 필터는 Debug·ReleaseSafe·ReleaseFast 각각 24/24, 공유 표 도형 회귀는 Debug 5/5, Python 독립 XML의 caption 변이 자체검사는 일반·`-O`에서 각각 통과했고, caption 고정 합성 해시 테스트는 1/1이었습니다. 허용 476개 파일의 수식 대조에서 caption·직접 `subList`·문단은 0개로 일치했습니다. 따라서 실제 caption 값 파싱의 실파일 양성은 여전히 없고, 필드·오류 경로는 합성 검사 근거입니다. 앞서 같은 제품 코드에서 통과한 known-inspections 8개 shard는 이번에 다시 실행하지 않았습니다. caption 텍스트 의미·수식 배치·저장은 검증 범위 밖입니다.

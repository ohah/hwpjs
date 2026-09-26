# HWPX 수식의 공통 도형 자식·필드

[수식 원문·script](hwpx-equations.md)의 같은 run 직접 수식 선택에 공통 도형 자식 검사를 연결합니다. `Document.inspectEquations()`, `XmlTrees.inspectEquations()`, `Document.inspectKnown().equations`가 같은 결과를 반환합니다. 이 단계는 필드 원값·어휘·부재 검사이며 실제 수식 배치는 수행하지 않습니다.

## 책임과 근거

- `shape_xml_children.zig`가 정확한 2011 paragraph namespace의 자식 이름과 필드 명세 선택을 소유합니다. `common`은 일곱 자식, `table`은 여기에 표 전용 `label`을 추가합니다. 수식의 `label`은 미등록 자식으로 남깁니다.
- `shape_xml_fields.zig`가 필드 이름·자료형·enum 목록과 순수 `observe` 판정을 소유합니다. 표의 일시적 검사와 수식의 소유 문자열 검사가 같은 판정을 호출합니다. 숫자·Boolean 어휘는 기존 `xml_values.zig`를 재사용합니다.
- `equation_shape.zig`가 수식 자식의 필드 복제·원문 부분 범위·진단을 소유합니다. 선택·누적 예산·반환 arena 수명은 상위 `equation.zig`가 관리합니다.

한컴 공개 모델의 고정 커밋에서 [EquationType](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/EquationType.cpp)의 자식 목록, [sz](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/sz.cpp), [CASOPos](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/pos.cpp), [outMargin](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/outMargin.cpp), [caption](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/caption.cpp)의 속성을 확인했습니다. 공개 모델의 생성자 기본값을 입력 부재값으로 대입하지 않습니다. 코드·의존성을 이식하지 않았습니다.

## 반환 계약

`Equation.first_shape_child`와 `shape_child_count`는 `Report.shape_children`의 연속 구간을 가리킵니다. 각 자식은 수식/요소 인덱스, 종류, 정확한 원문 XML 부분 범위, 명세 순서의 정규화된 UTF-8 속성값, 미등록 속성 수, 직접 하위 요소 수를 반환합니다. `get(name)`으로 지원 필드를 조회할 수 있습니다. 속성 부재는 `null`, 빈 enum은 빈 문자열이며 원래 숫자의 공백·부호·선행 0을 없애지 않습니다. 숫자·Boolean의 빈 값이나 범위 오류는 거부합니다.

| 자식 | 검사하는 필드 |
| --- | --- |
| `sz` | width, widthRelTo, height, heightRelTo, protect |
| `pos` | treatAsChar, affectLSpacing, flowWithText, allowOverlap, holdAnchorAndSO, vertRelTo, horzRelTo, vertAlign, horzAlign, vertOffset, horzOffset |
| `outMargin` | left, right, top, bottom |
| `caption` | side, fullSz, width, gap, lastWidth |

위 25개 필드는 기존 표와 같은 어휘를 검사합니다. 부호가 있는 offset·여백·caption 폭/간격은 음수 i32 표기와 양수 u32 표기를 구분해 보존하며 상위 비트 양수를 자동으로 음수로 바꾸지 않습니다. 미지 enum은 문자열과 진단을 남깁니다. 값이 없는 요소를 필수성 위반으로 판정하지 않습니다.

`shapeComment`의 직접 텍스트는 [수식 shapeComment](hwpx-equation-comments.md)가 별도로 소유합니다. 수식 자식 보고서의 `parameterset`·`metaTag` 자체는 종류·원문·속성 수·직접 하위 요소 수만 보존합니다. 별도 [공통 section 파라미터 트리](hwpx-parameter-lists.md) API가 `parameterset` 내부를 관측하며, 수식 보고서에 같은 내부 값을 복제하지 않습니다. `metaTag` 내부 텍스트는 아직 해석하지 않습니다. 다른 namespace의 동명 자식·속성은 알려진 필드로 해석하지 않습니다. 알려진 자식 안에 중첩된 요소도 해당 부모 원문에 남깁니다.

`caption`의 직접 `subList` 속성·문단 경계는 [수식 caption 목록](hwpx-equation-captions.md)이 별도로 소유합니다.

`Report.shape.by_kind`는 일곱 공통 종류의 출현 수·수식별 부재/중복 및 필드별 집계를 반환합니다. `fields`의 유효 길이는 `shape_xml_children.specs(kind).len`이며 이후 슬롯은 사용하지 않습니다. 필드 `absent`는 **존재하는 해당 자식에서 속성이 없는 횟수**입니다. 자식 자체가 없을 때는 `missing_equations`로만 셉니다. 중복된 자식은 원문 순서대로 모두 보존·검사하므로 뒤쪽 잘못된 값이 숨지 않습니다.

기존 `other_children`는 호환성을 위해 여전히 script 이외의 모든 직접 자식을 셉니다. 이 중 공통 자식은 `shape_children`, 나머지는 `shape.unknown_children`로 구분합니다. 미지 자식 자체의 원문도 수식 원문 안에 남습니다. section 순번·수식/자식 요소 인덱스를 통해 script와 shape 자식의 상대 위치를 확인할 수 있습니다.

자식 원문은 arena에 복제한 부모 수식 XML의 부분 슬라이스입니다. 별도로 중복 복제하지 않고, 원래 UTF-8/UTF-16 바이트를 유지하며 임시 트리·문서 해제 후에도 유효합니다. 알려진 속성의 추가 UTF-8 복제는 `max_owned_bytes` 합계에 포함됩니다. `max_other_children`는 알려진/미지 자식 합계에 계속 적용되며 알려진 속성 하나는 `max_attribute_bytes`로 제한합니다. 전체 XML 원문은 상위 XML 트리 예산을 사용합니다. 이 한도들은 배열·arena 메타데이터까지 포함한 실제 메모리 상한은 아닙니다.

## 독립·적대적 검증 범위

합성 검사는 25개 값과 존재 집계, 원문 부분 범위·독립 수명, 부재/빈 enum/중복, 음수·상위 비트 숫자, 뒤쪽 중복의 오류, 다른 namespace·잘못된 부모·손자 요소, 수식/section 간 순서, 양쪽 UTF-16 바이트 순서, 문자 참조·해독 바이트 예산, 정확한 한도와 한 바이트 초과, 모든 할당 실패를 포함합니다. 패키지/known API에서도 형상 값의 독립 수명과 후속 표 검사 오류 시 메모리 회수를 검사합니다.

독립 Python ZIP/ElementTree 조사기는 제품 코드의 필드 목록을 읽지 않습니다. 기존 수식 속성·script 해시에 자식 종류·수식 기준 요소 위치·25개 속성의 부재/값·미등록 속성 수·직접 하위 요소 수를 추가해 **파일별** 대조합니다. 조사기 자체 반례는 값 변경, 빈 값 삭제, 자식 종류·script 전후 위치·namespace 변경, 추가 속성·중첩 요소가 해시에 잡히는지 검사합니다. `shapeComment` 직접 텍스트도 [별도 계약](hwpx-equation-comments.md)에 따라 해시에 포함합니다. 나머지 메타데이터 텍스트나 미지 속성값 자체는 포함하지 않습니다. 정확한 원문 부분 범위는 합성 테스트에서 확인합니다. 재현 명령의 단일 출처는 [개발·검증 명령](development-commands.md)입니다.

## 실측 기록

독립 대조에서 HWPX 484개 후보 중 허용 476개, ZIP 종료 레코드 거부 6개, 암호화 2개로 분리됐습니다. 544개 section 중 수식이 있는 문서 28개에서 수식/script 각각 23,236개와 공통 도형 자식 69,819개의 파일별 해시·집계가 일치했습니다. 이 표본의 미등록 수식 직접 자식은 0개입니다. 표본에 없는 값의 필수성이나 다른 버전의 적합성을 뜻하지 않습니다.

같은 OPF spine 선택의 독립 인벤토리에서 `sz`·`pos`·`outMargin`은 각각 23,236개, `shapeComment`는 111개이며, 세 기하 요소의 속성값은 합계 464,720개였습니다. `caption`·`parameterset`·`metaTag`는 이 실파일 표본에 없으므로 해당 경로는 합성 테스트 근거만 있습니다. 반환 형식이 같다는 이유로 실파일 검증까지 완료됐다고 확대하지 않습니다.

2026-09-26 도형 자식 단계 소스의 Debug `zig build test --summary all`은 2,568/2,568, 수식 집중 테스트는 Debug·ReleaseSafe·ReleaseFast 각각 15/15, 표 shape 집중 테스트는 Debug 5/5로 통과했습니다. `zig build -Doptimize=ReleaseSafe --summary all`과 `zig fmt --check build.zig src`도 통과했습니다. 기존 문서 검사 8개 실파일 shard를 각각 별도 ReleaseFast 프로세스로 다시 실행해 모두 통과했고, 독립 equation corpus는 파일별 값·순서 해시까지 일치했습니다. 이 실파일 명령은 기본 전체 테스트에 포함되지 않습니다.

적대적 검증은 (1) 부재·빈 enum·중복 뒤의 잘못된 값, (2) 다른 namespace·잘못된 부모·손자 요소, (3) unsigned/부호 있는 숫자·Boolean·한도 한 바이트 초과, (4) 양쪽 UTF-16·문자 참조·부분 범위·트리 해제 후 수명·모든 할당 실패, (5) 독립 oracle의 값·종류·script 앞뒤 위치·namespace·추가 속성·중첩 요소 변이 반례로 구성했습니다. 통과는 현재 검사한 2011 수식 자식과 주어진 corpus의 일치 증거이며 전체 스키마 또는 렌더링 검증이 아닙니다.

## 남은 범위

caption 문단의 본문 의미, 메타데이터 내부 의미, 수식 문법·렌더링·좌표 적용, 글꼴 연결, 조건부 활성 분기, 마스터페이지 수식, 다른 namespace 버전, 편집·저장·무손실 왕복은 남아 있습니다. 자식·필드 검사 성공이나 실파일 해시 일치를 전체 문서 지원 완료로 해석하지 않습니다.

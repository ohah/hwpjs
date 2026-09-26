# HWPX 수식 shapeComment 직접 텍스트

## 근거와 범위

[한컴 공개 OWPML 모델의 shapeComment](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/shapeComment.cpp)는 `CStringValueObject`를 상속하고 `m_val`을 문자열로 기록합니다. 모델의 코드를 이식하지 않았습니다. 여기서는 2011 namespace의 **run 직접 수식 아래 직접 `shapeComment`**만 대상으로 합니다. 다른 도형의 주석이나 문서 전체의 코멘트 의미는 맡지 않습니다.

## 반환 계약

`equation.zig`가 수식과 공통 도형 자식을 선택하고 한 번의 section 문자 이벤트 순회를 실행합니다. `equation_comment.zig`는 해당 자식 **직접** 문자·CDATA·문자 참조를 정규화된 UTF-8로 누적합니다. `ShapeChild.comment_value`는 수식 보고서가 소유하는 문자열이며, 빈 주석은 빈 문자열, 다른 자식 종류는 `null`입니다. 중복 주석은 원래 자식 순서대로 각각 남습니다. 원문 XML은 기존 `ShapeChild.raw_xml`에 그대로 남습니다. 하위 요소가 있으면 `direct_children`와 원문을 보존하지만 하위 요소의 텍스트를 주석 문자열에 섞지 않습니다. 이는 해당 중첩 XML의 스키마 적합성 판정이나 표시 문자열 조립이 아닙니다.

`max_comment_bytes` 기본값은 **주석 하나당** 1 MiB이며, 정규화된 주석 바이트는 기존 `max_owned_bytes` 합계와 `Report.comment_bytes`에 포함됩니다. 임시 XML 트리·입력 버퍼의 수명과 독립적입니다. 실제 arena·해시맵 메타데이터까지 이 바이트 상한으로 제한한다는 뜻은 아닙니다.

## 검증

합성 검사는 엔터티·CDATA·문자 참조의 동일 의미, 빈 값·중복·외부 namespace, 하위 요소와 그 tail의 직접 텍스트 구분, script와의 동시 순회, 정확한 단일·누적 바이트 한도, 원본 트리 해제 후 소유권, 모든 할당 실패를 포함합니다. 독립 Python ZIP/ElementTree oracle은 자식의 직접 텍스트를 UTF-8 바이트 길이와 함께 **파일별 해시**에 포함합니다. 별도 고정 합성 fixture는 Zig와 Python의 같은 해시를 검사하고 Python self-test는 값·속성·중첩·namespace 변이를 확인합니다. 명령은 [개발·검증 명령](development-commands.md)에 둡니다.

로컬 두 corpus의 run 직접 수식 `shapeComment`는 111개였고, 모두 직접 하위 요소·속성이 없으며 텍스트가 비어 있지 않았습니다. 정규화 UTF-8 총 1,468바이트, 최대 16바이트였습니다. 이 표본 밖의 구조·버전 및 다른 도형의 주석은 실파일 대조로 확인되지 않았습니다.

2026-09-26 검증에서 독립 Python ZIP/ElementTree와 ReleaseFast 제품의 파일별 해시는 허용 476개 전체에서 일치했습니다(별도 ZIP 거부 6개·암호화 2개). Debug 전체 `zig build test --summary all`은 2,577/2,577, 수식 집중 테스트는 Debug·ReleaseSafe·ReleaseFast 각각 24/24 통과했습니다. `zig build -Doptimize=ReleaseSafe --summary all`, `zig fmt --check build.zig src`, 기존 known 문서 shard 0~7도 통과했습니다. Python oracle self-test는 일반·`-O` 모두 통과했습니다. 실파일 8개 shard와 독립 corpus 대조는 기본 전체 테스트 밖에서 실행했습니다.

수식 주석 문자열 보존은 주석의 화면 표시, 수식 조판, 편집·저장·무손실 왕복 구현을 뜻하지 않습니다.

적대적 재검토는 다섯 경계를 따로 보았습니다. (1) 공개 모델의 문자열 계약과 corpus 자식·속성 분포, (2) run 직접 수식·정확한 namespace·중복 및 원문 순서, (3) 엔터티/CDATA/UTF-16·중첩 자식과 tail의 문자 이벤트 부모, (4) 빈 값·단일 및 공유 바이트 한도·실패 시 할당 회수, (5) 제품과 독립 XML oracle의 고정 해시·변이 검출 및 실파일 파일별 대조입니다. 통과 범위는 위의 지원 경계에 한정됩니다.

2026-09-27 재검증: 한컴 고정 버전의 `shapeComment` 문자열 객체와 현재 수식의 직접 텍스트 누적 경계를 대조했습니다. `HWPX equation` 필터는 Debug·ReleaseSafe·ReleaseFast 각각 24/24, 주석 고정 XML의 독립 해시 테스트는 1/1, Python 오라클 자체검사는 일반·`-O`에서 각각 통과했습니다. 허용 476개 파일별 수식 해시가 일치했고, 별도 ZIP/XML 인벤토리에서 run 직접 수식 아래 주석 111개·UTF-8 합계 1,468바이트·최대 16바이트, 빈 텍스트·속성·하위 요소 0개를 다시 확인했습니다. 앞서 같은 제품 코드에서 통과한 known-inspections 8개 shard는 이번에 다시 실행하지 않았습니다. 다른 도형의 주석·표시·저장은 이 결과로 검증되지 않습니다.

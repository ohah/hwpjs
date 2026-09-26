# HWPX section parameterset 원값 트리

## 범위와 공식 근거

[한컴 공개 OWPML 모델의 ParameterList](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/ParameterList.cpp)는 `parameterset`의 `cnt`·`name`, 여덟 자식 `booleanParam`·`integerParam`·`unsignedintegerParam`·`bindataParam`·`floatParam`·`stringParam`·`listParam`·`arrayParam`을 정의합니다. `listParam`·`arrayParam`은 같은 목록 구조로 재귀됩니다. 이 구현은 공식 코드를 이식하지 않았습니다.

`Document.inspectParameterLists()`는 선택된 2011 HWPX section의 **모든 직접 `hp:parameterset` 요소**를 소유 결과로 반환합니다. `XmlTrees.inspectParameterLists()`는 기존 소유 트리를 재사용하고 `Document.inspectKnown().parameter_lists`도 같은 검사기를 호출합니다. 수식만이 아니라 그림·컨테이너 등의 출현도 포함하며, header·master-page와 다른 namespace 버전은 이 API 범위 밖입니다.

## 반환·자원 계약

`src/hwpx/parameter_lists.zig`만 파라미터 어휘·재귀·결과 소유권을 관리합니다. `Root`는 section 순번, XML 요소와 부모 인덱스, 부모 종류(`picture`·`container`·`equation`·`other`) 및 **정확한 부모 URI·로컬 이름**, 원문 XML, 연속 `Node` 범위를 제공합니다. 부모 이름도 복제하므로 트리 해제 후 `other`의 실제 이름이 소실되지 않습니다. `Node`는 루트/부모 노드·XML 요소 인덱스와 깊이, 종류, 루트 원문을 빌린 정확한 XML 부분 범위, `name`·`cnt`의 부재/빈 값/정규화 UTF-8 원값, 직접 자식·미등록 자식 수를 제공합니다. 스칼라 타입은 **직접** 문자·CDATA·문자 참조의 정규화된 문자열을 소유하며, 목록 타입의 `value`는 `null`입니다. 빈 스칼라 값은 빈 문자열입니다. 미등록 자식 내부는 원문에 남기지만 알려진 파라미터 노드로 승격하지 않습니다.

목록의 `cnt`는 unsigned32 어휘로 검사하고 실제 직접 자식 수와 다르면 `count_mismatch`로 보고합니다. 수가 다르다고 원문을 버리거나 자동 보정하지 않습니다. 스칼라의 Boolean·정수·부동소수점·BinData 참조의 **값 자체는 아직 타입별 의미나 범위를 검증하지 않습니다**. 스칼라에 붙은 예기치 않은 `cnt`도 원값만 보존합니다. 따라서 타입 이름을 인식한다는 이유로 해당 값의 의미를 지원한다고 주장하지 않습니다.

기본 한도는 루트 100,000개, 노드 1,000,000개, 깊이 64, 속성값 및 부모 URI·로컬 이름 각각 UTF-8 4 KiB, 스칼라값당 1 MiB, 복제 원문·속성·부모 이름·값 바이트 합계 128 MiB입니다. 이 한도는 배열/arena/해시맵 메타데이터를 포함한 프로세스 실제 메모리 상한이 아닙니다. 결과는 임시 XML 트리·패키지·입력 버퍼 해제 후에도 유효하며 `Report.deinit()`으로 해제합니다.

## 검증과 제한

합성 검사는 여덟 자식 종류, 중첩 순서·부모·원문 부분 범위, 빈 값과 부재, 문자 참조·CDATA·UTF-16 양 endian, 모르는 자식·namespace, `cnt` 불일치와 잘못된 unsigned32, 깊이·노드·속성·값·소유 바이트 경계, 패키지/트리/known 경로의 독립 수명, known 후속 실패 시 메모리 회수 및 모든 할당 실패를 포함합니다. 독립 Python ZIP/ElementTree oracle은 OPF spine의 section을 따로 선택하고 **파일별 해시**로 부모·요소 위치·종류·재귀 순서·속성 부재/값·직접 텍스트·자식 수·불일치를 대조합니다. oracle self-test는 동등한 XML 텍스트 및 값·속성·부모·namespace·중첩 변이를 검사합니다. 재현 명령은 [개발·검증 명령](development-commands.md)에 있습니다.

로컬 corpus의 실제 출현 3건은 그림 2건·컨테이너 1건이며, 각 트리는 `parameterset → listParam → stringParam` 3노드였습니다. 독립 oracle과 제품은 HWPX 484개 후보를 허용 476개·ZIP 종료 레코드 거부 6개·암호화 2개로 동일하게 분류했고, 허용 파일 476개의 **파일별 해시**가 모두 일치했습니다. 양성 3건은 `inspectKnown()`과 독립 `inspectParameterLists()`의 해시도 일치했습니다. 스칼라 UTF-8 값 합계는 81바이트, 미등록 자식·`cnt` 불일치는 0건이었습니다. 실파일 수식 `parameterset`은 0건이므로 그 부모 경로는 합성 테스트 근거뿐입니다. 이 결과를 모든 버전·파라미터 종류의 실파일 검증으로 확대하지 않습니다.

2026-09-26 최종 코드에서 Debug 전체 `zig build test --summary all`은 2,585/2,585, 파라미터 집중 테스트는 Debug·ReleaseSafe·ReleaseFast 각각 9/9 통과했습니다. `zig build -Doptimize=ReleaseSafe --summary all`, `zig fmt --check build.zig src`, 독립 Python oracle self-test의 일반/`-O` 모드, 파일별 전체 corpus 대조와 기존 known 문서 shard 0~7도 통과했습니다. 실파일 대조와 shard는 기본 전체 테스트 밖에서 실행했습니다.

적대적 검토는 (1) 공식 모델 어휘와 관측 XML, (2) 정확한 namespace·부모·재귀 순서, (3) 부재/빈 값·CDATA·엔터티·UTF-16, (4) 자원 상한·모든 할당 실패·패키지 해제 후 수명, (5) 독립 오라클의 값·속성·부모·namespace·중첩 변이와 전체 허용 파일 해시를 각각 확인합니다. 추적한 파라미터의 제품 의미·이미지 동작·편집·저장·무손실 왕복, header/master-page 및 비-2011 버전은 남아 있습니다.

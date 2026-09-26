# HWPX indexmark·dutmal 문자열 컨트롤

## 범위와 근거

[한컴 공개 indexmark 모델](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/indexmark.cpp)은 `firstKey`·`secondKey`를, [dutmal 모델](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/dutmal.cpp)은 `mainText`·`subText` 및 `posType`·`szRatio`·`option`·`styleIDRef`·`align`을 정의합니다. 네 자식의 값은 `CStringValueObject` 문자열이고, `posType`·`align` 어휘는 [공개 enum 표](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/enumdef.h)를 따릅니다. 공식 코드를 이식하지 않았습니다.

`Document.inspectInlineStringControls()`는 선택된 2011 HWPX section의 모든 정확한 `hp:indexmark`·`hp:dutmal`을 소유 결과로 반환합니다. `XmlTrees.inspectInlineStringControls()`는 이미 소유한 트리를 재사용하고 `Document.inspectKnown().inline_string_controls`도 같은 검사기를 사용합니다. 부모 위치는 원값으로 보존하되 여기서 run 직접 자식 여부를 강제하지 않습니다. 다른 namespace·header·master-page·비활성 분기 선택은 별도 범위입니다.

## 결과·소유권·한도

`src/hwpx/inline_string_controls.zig`가 두 컨트롤의 직접 자식 선택·속성·소유 결과를 한 곳에서 관리합니다. 공통 문자 청크 정규화와 바이트 한도는 `xml_direct_text.zig`를 재사용합니다. `Control`은 section 및 요소·부모 인덱스, 복제된 부모 URI·로컬 이름, 정확한 원문 XML, 직접 텍스트, 자식 범위·미등록 자식 수를 갖습니다. `dutmal`의 다섯 속성은 각각 부재와 빈 값과 정규화된 원값을 구분하며, 존재하는 `posType`·`align`은 공개 enum 어휘, 세 숫자는 unsigned32 어휘를 검사합니다. `Text`는 직접 자식 네 종류의 정확한 순서·원문 부분 범위·정규화된 **직접** 문자/CDATA/참조 값·미등록 속성/내부 자식 수를 갖습니다. 모르는 자식과 속성은 승격하지 않고 원문에 보존하며 수로 보고합니다. 누락된 `secondKey`를 빈 값으로 발명하지 않습니다.

기본 한도는 컨트롤 100,000개·문자 자식 200,000개, 부모 이름과 선택된 `dutmal` 속성값 각각 4 KiB, 직접 텍스트값당 1 MiB, 복제 원문·부모 이름·선택 속성·값 합계 128 MiB입니다. 미등록 속성은 원문과 상위 XML 한도에만 묶입니다. 배열/arena 메타데이터까지 포함한 프로세스 RSS 상한은 아닙니다. 결과는 입력 ZIP과 XML 트리 수명에서 독립되고 `Report.deinit()`으로 해제합니다. `styleIDRef`는 숫자 어휘까지만 검사하고 header style 색인에 연결하지 않습니다. 인덱스 생성, 덧말 표시 위치·크기, 편집·저장도 여기서 해석하지 않습니다.

## 실파일·적대적 검증

로컬 두 corpus의 HWPX 후보 484개에서 ZIP 종료 레코드 거부 6개·암호화 2개를 제외한 허용 476개를 독립 Python ZIP/ElementTree oracle과 **파일별 해시**로 대조했습니다. 실제 양성은 파일 2개에 `indexmark` 3건(`firstKey` 3건, 모두 `hp:ctrl` 직접 자식)과 `dutmal` 1건(`mainText`·`subText` 각 1건, `hp:run` 직접 자식), 컨트롤 4건·문자 자식 5건·UTF-8 직접 텍스트 82바이트입니다. 미등록 직접 자식·모델 밖 속성은 0건입니다. `secondKey` 실파일 양성은 0건이라 합성 근거만 있습니다. 두 양성 파일의 standalone과 known 보고서 해시도 일치했습니다. 재현 명령은 [개발·검증 명령](development-commands.md)에 있습니다.

적대적 검토는 (1) 공식 부모/자식·속성 모델과 실파일 양성, (2) namespace 위장·잘못된 자식 종류·미등록 원문 보존, (3) 문자 참조·CDATA·UTF-16·직접 텍스트와 후손 텍스트 분리, (4) 속성 부재/빈 값/숫자·enum 오류와 자원 한도·모든 할당 실패, (5) 독립 오라클의 값·속성·부모·자식·namespace 변이 검출과 전체 파일별 해시를 검사합니다. 이 검증은 모든 OWPML 버전, 화면 결과, 저장 왕복 또는 문서 전체 스키마 적합성의 증명이 아닙니다.

2026-09-26의 Debug 전체 `zig build test --summary all`은 2,601/2,601, 집중 테스트는 Debug·ReleaseSafe·ReleaseFast 각각 9/9를 통과했습니다. Python oracle의 일반/`-O` 변이 self-test와 전체 corpus 대조, `zig fmt --check build.zig src`, ReleaseSafe 제품 빌드 및 known 문서 shard 0~7도 통과했습니다. 실파일 corpus와 known 연결은 기본 전체 테스트 밖의 선택 검사입니다.

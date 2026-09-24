# HWPX 차트 경로와 XML 경계 검증

기본 보고서는 조건부 양쪽 분기를 관측합니다. 호출자 capability를 적용한 선택적 결과는 [조건부 참조 선택](hwpx-switch-selection.md)을 참조합니다.

`Document.inspectChartReferences`는 보호되지 않은 문서의 선택된 spine section을 읽어 `hp:chart.chartIDRef`를 ZIP 내부 엔트리의 **정확한 경로**로 대조합니다. `binaryItemIDRef`처럼 OPF manifest `item.id`로 해석하지 않고, 경로의 대소문자를 바꾸거나 `chartN.xml` 이름을 생성하지 않습니다. 한컴 공개 모델에는 [`chartIDRef` 속성](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/ChartType.cpp#L75-L88)이 있고, 별도 [차트 파일 쓰기](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPMLApi/OWPMLSerialize.cpp#L548-L566) 경로가 있습니다. 실파일에서는 `chartIDRef="Chart/chart1.xml"`이 manifest에 없는 같은 이름의 ZIP 엔트리를 가리켰습니다. 따라서 경로 기반 연결은 공개 모델과 실파일을 함께 근거로 한 구현 판단입니다.

section의 `p/run/chart`와 `p/run/switch/case|default/chart`를 검사합니다. 조건부 양쪽 분기를 각각 관측할 뿐 선택 조건을 평가하지 않습니다. 속성 부재·빈 값·안전하지 않은 경로·ZIP 엔트리 부재·해결된 참조·출처가 확인되지 않은 같은 속성을 별도로 보고합니다. 첫 문제 경로·문제 종류와 첫 미분류 값은 반환 보고서가 소유하거나 기록하며 해당 section의 manifest 항목 인덱스도 보존합니다. `Report.deinit`으로 소유 문자열을 해제합니다. 동일 ZIP 경로의 중복 참조는 각각 세지만 차트 XML은 한 번만 해제·검사합니다.

참조된 차트 엔트리는 ZIP CRC와 해제 길이를 검사하고, XML 문법·namespace 및 `{http://schemas.openxmlformats.org/drawingml/2006/chart}chartSpace` 루트를 확인합니다. section 엔트리당 128MiB·합계 256MiB, 차트 엔트리당 32MiB·고유 차트 합계 128MiB, 속성값 4096바이트, 위치 100만 개, 고유 차트 10만 개가 기본 한도이며 XML 공통 요소·깊이 한도도 적용됩니다. XML 안의 `numCache`·`strCache` [개수·인덱스 구조](hwpx-chart-cache.md), [수식 참조 구조](hwpx-chart-formula.md)와 [값·수식 텍스트 관측](hwpx-chart-text.md)은 같은 API에서 별도 책임으로 검사합니다. 차트 시리즈별 값의 의미·데이터 레이블, OOXML 관계 파일과 외부 리소스, 렌더링·편집·저장은 아직 검증하지 않습니다. 이 단계만으로 전체 문서 검증을 완료한 것은 아닙니다.

## 실파일과 적대적 검증

레거시 fixture와 로컬 `edwardkim/rhwp` 커밋 `e8800c8def63449808a4092798442652ed460552`의 `.hwpx` 484개에서 ZIP 거부 6개·암호화 2개를 제외한 476개와 section 544개를 검사했습니다. 차트 참조 93개가 모두 93개의 차트 XML로 연결되고 루트·문법·CRC 검사를 통과했습니다. 미분류 속성·끊어진 경로는 0개였습니다. 선택 조사는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX corpus chart path and XML read-only survey'`로 단독 실행했으며 로컬 `reference/rhwp` 클론이 필요합니다. 전체 선택 조사 묶음의 통과를 이 단독 결과로 대신 주장하지 않습니다.

기본 합성 테스트는 manifest에 없는 정확 경로, XML 문자 참조, 중복·서로 다른 차트, 조건부 양쪽 분기, 부재·빈 값·경로 위장·다른 namespace, 잘못된 차트 루트·XML·CRC, 정확한 바이트·위치·개수 한도, 암호화 거부, 모든 할당 실패와 ReleaseFast 명시적 소유권 회계를 다룹니다. 새 기본 테스트는 Git에 없는 `rhwp` 샘플을 요구하지 않지만 기존 HWPX 테스트 중에는 로컬 클론을 요구하는 항목이 남아 있습니다.

적대적 할당자 테스트에서는 `Document`를 만든 할당자와 검사 보고서의 할당자를 다르게 주자 기존 `document_xml.read`의 ZIP 해제 버퍼를 잘못된 할당자로 반환해 DebugAllocator가 실제로 중단됐습니다. `Archive.decode`가 반환한 버퍼는 `archive.allocator`가 소유한다는 규칙을 HWPX XML 소비자 전반에 적용했고, 차트 검사와 기존 문서 검사 API를 두 할당자로 다시 실행해 양쪽 할당량이 0으로 돌아오는 것을 확인했습니다. 이 변경은 차트 payload의 의미 검증을 뜻하지 않습니다.

차트 경로·XML 경계 커밋 `6d45fe96` 당시 기본 `zig build test --summary all`은 5/5 단계·2,112/2,112 테스트, HWPX 전용 ReleaseFast는 90/90 테스트를 통과했습니다. Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all`은 각각 40/40 단계·2,151/2,151 테스트 통과했습니다. 이후 추가한 캐시 구조의 현재 검증 결과는 [차트 캐시 문서](hwpx-chart-cache.md)가 소유합니다. 전체 HWPX 의미·편집·저장 검증을 통과했다는 뜻은 아닙니다.

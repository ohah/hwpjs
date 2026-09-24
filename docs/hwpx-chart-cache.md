# HWPX 차트 데이터 캐시 구조

`Document.inspectChartReferences`가 [차트 ZIP 경로·XML 경계](hwpx-chart-references.md)를 확인할 때, 같은 XML 순회에서 OOXML chart namespace의 `c:numCache`·`c:strCache`·`c:multiLvlStrCache`와 `c:numLit`·`c:strLit`를 별도 `chart_cache.zig` 계층으로 검사합니다. namespace URI는 `chart_namespace.zig` 한 곳에서 공유하며 ZIP 경로·문서 section 검사 규칙은 데이터 계층에 복제하지 않습니다. [Microsoft의 숫자 캐시 설명](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.numberingcache?view=openxml-3.0.1)은 `numCache`를 마지막 차트 데이터 캐시로, [포인트 개수](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.pointcount?view=openxml-3.0.1)는 값 수로 설명합니다. [문자열 포인트의 `idx`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.stringpoint?view=openxml-3.0.1)는 0부터 시작하는 unsigned 인덱스입니다.

캐시마다 직접 자식 `ptCount.val`과 `pt.idx`의 `u32` 원값을 읽고 직접 `pt/v` 요소의 존재를 확인합니다. [XML Schema의 `whiteSpace=collapse`](https://www.w3.org/TR/xmlschema-2/#rf-whiteSpace)에 따라 숫자 앞뒤의 XML 공백은 허용하되 내부 공백과 손상·초과 숫자는 오류로 반환합니다. `ptCount` 부재·중복, 선언 개수와 실제 포인트 수 차이, 중복·범위 밖 인덱스, `v` 요소 부재·중복 및 [leaf text인 `v`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.numericvalue?view=openxml-3.0.1)의 중첩 자식은 각각 보고서 진단으로 남깁니다. 희소한 포인트를 임의로 채우거나 개수 불일치를 자동 보정하지 않습니다. `first_cache_issue_path`는 처음 진단이 생긴 ZIP 경로를 소유하며 `ChartReferenceReport.deinit`으로 해제합니다. 중복 `chartIDRef`가 같은 차트를 가리키면 캐시도 한 번만 검사합니다.

기본 한도는 참조된 차트 XML 전체에서 캐시 세 종류와 리터럴 두 종류의 합계 10만 개, 포인트 100만 개, 다단계 레벨 10만 개, 숫자 속성값 4096바이트입니다. 기존 차트 XML의 엔트리당·총량·문법 한도도 그대로 적용됩니다.

[Microsoft의 다단계 캐시](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.multilevelstringcache?view=openxml-3.0.1)는 직접 `ptCount`와 `lvl`을, [각 레벨](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.level?view=openxml-3.0.1)은 직접 문자열 `pt`를 갖습니다. `ptCount.val`은 캐시마다 한 번만 선언 합계에 넣고, 실제 포인트 개수·중복/범위 밖 `idx`는 레벨별로 검사합니다. 레벨마다 인덱스 집합을 비워 다른 레벨의 같은 인덱스를 중복으로 오인하지 않습니다. 레벨 0개는 관측 수치일 뿐 오류가 아니고, 스키마 순서를 어겨 레벨 뒤에 `ptCount`가 오면 오류입니다. `v` 텍스트의 정규화된 길이·빈 값과 추가 한도는 [차트 값·수식 텍스트 관측](hwpx-chart-text.md), 값의 이스케이프 해독은 [ST_Xstring](hwpx-xstring.md)이 소유합니다. 숫자 표기·비유한 값, `c:f` 수식과 원본 표 데이터의 일치, 시리즈 유형별 제약, 조건부 OOXML 분기 선택과 렌더링·편집·저장은 아직 검증하지 않습니다. 구조 진단 0건은 차트 데이터 의미가 완전히 검증됐다는 뜻이 아닙니다.

[Microsoft Open XML SDK의 고정 스키마 정의](https://github.com/dotnet/Open-XML-SDK/blob/431ab05cf160248cc3885a4a766026d4f8243792/data/schemas/schemas_openxmlformats_org_drawingml_2006_chart.json#L10066-L10105)에서 `ptCount`는 최대 1개, `lvl`은 0개 이상이며 이 순서로 정의됩니다. 따라서 레벨 0개는 `empty_multilevel_caches`에만 세고 `issues()`에는 넣지 않습니다. `ptCount` 부재는 기존 캐시 검사와 일치하게 별도 진단으로 유지합니다.

## 실파일·적대적 검증

레거시 fixture와 로컬 `edwardkim/rhwp` 커밋 `e8800c8def63449808a4092798442652ed460552`의 `.hwpx` 484개에서 ZIP 거부 6개·암호화 2개를 제외한 476개를 제품 코드로 조사했습니다. section 544개에서 차트 참조 93건과 고유 차트 93개를 검사했고, 숫자 캐시 259개·문자열 캐시 477개·숫자 리터럴 11개·문자열 리터럴 5개·포인트 2,296개를 관측했습니다. 선언 포인트 합계도 2,296개이며 위 구조 진단은 0개였습니다. 이 수치는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX corpus chart path and XML read-only survey'` 단독 실행 결과로, Git에 없는 로컬 `reference/rhwp` 클론이 필요하고 전체 선택 조사 묶음의 통과를 뜻하지 않습니다.

기본 합성 테스트는 숫자·문자열 캐시와 리터럴, 명시적 인덱스, 누락·중복 개수, 불일치, 중복·범위 밖 인덱스, `v` 요소 누락·중복·자식 중첩, namespace 위장, 숫자 속성의 XML 공백·손상된 `u32`, 정확한 컨테이너·포인트·속성 한도, 모든 할당 실패를 검사합니다. 차트 ZIP 검사와의 통합 테스트는 중복 참조가 데이터를 중복 집계하지 않고 첫 문제 경로를 소유하는지도 확인합니다.

차트 캐시 커밋 `d412c13c` 당시 기본 `zig build test --summary all`은 5/5 단계·2,122/2,122 테스트, HWPX ReleaseFast는 100/100 테스트를 통과했습니다. Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all`은 각 40/40 단계·2,161/2,161 테스트 통과했습니다. ReleaseSafe 제품 빌드와 기존 JS 비교 빌드는 5/5·8/8 단계 통과했습니다. 이후 추가한 `v` leaf 검사와 수식 참조 구조의 현재 검증은 [수식 참조 문서](hwpx-chart-formula.md)가 소유합니다. 이는 차트 값의 의미나 전체 HWPX 문서 검증 완료를 뜻하지 않습니다.

다단계 지원 추가 시 독립 Python ZIP/ElementTree 조사는 로컬 차트 XML 93개에서 `multiLvlStrCache`·`multiLvlStrRef`·레벨·포인트를 모두 0건으로 확인했습니다. 양성 구조, 레벨별 인덱스, 누락·순서 오류는 합성 차트로만 검증하며 실제 다단계 차트와의 동치는 아직 입증되지 않았습니다.

최종 소스에서 차트 전용 테스트 43개가 ReleaseSafe·ReleaseFast에서 각각 통과했고, 선택 실파일 476개/고유 차트 93개의 제품 조사도 통과했습니다. 서로 다른 두 차트의 레벨 누적 한도와 다중 레벨 뒤 오류의 정상 할당 해제를 별도 반례로 확인했습니다.

전체 Debug `zig build test --summary all`은 2,379/2,379개, ReleaseSafe 전체 audit와 제품 빌드·JS 비교 47/47도 통과했습니다. 이 결과는 기존 차트 회귀와 다단계 합성 입력을 포함하지만 실제 다단계 차트의 표시·편집·저장 동치는 포함하지 않습니다.

# HWPX 차트 수식 참조 구조

`Document.inspectChartReferences`가 확인한 고유 차트 XML에서 `chart_formula.zig`가 OOXML chart namespace의 `c:numRef`·`c:strRef` 직접 자식을 검사합니다. [숫자 참조](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.numberreference?view=openxml-3.0.1)와 [문자열 참조](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.stringreference?view=openxml-3.0.1)의 `c:f` 수식 존재·중복, 같은 종류의 선택적 캐시 연결·중복과 캐시보다 늦은 수식을 구분합니다. 수식 `c:f`는 자식 요소가 없는 [leaf text element](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.formula?view=openxml-3.0.1)이므로 중첩 요소를 진단합니다. `c:multiLvlStrRef`는 아직 해석하지 않고 미지원 건수로 드러냅니다. 이 계층은 [차트 캐시 개수·인덱스](hwpx-chart-cache.md) 규칙을 복제하지 않습니다.

고유 차트 전체에 기본 참조 한도 10만 개를 공유하며 미지원 다단계 참조도 한도에 포함합니다. 첫 구조 진단의 ZIP 경로는 `first_formula_issue_path`가 소유하고 `Report.deinit`이 해제합니다. 같은 차트를 여러 section이 참조해도 수식은 한 번만 집계합니다. 캐시가 없는 참조는 별도 건수로 기록하지만 자동 오류로 판정하지 않습니다.

수식 문자열의 문법·빈 값·원본 셀 주소나 외부 데이터와의 일치, 수식 계산, 차트 데이터의 렌더링·편집·저장은 아직 검증하지 않습니다. 특히 숫자 포인트의 `c:v`도 [OOXML에서 `ST_Xstring`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.numericvalue?view=openxml-3.0.1)이므로 이 계층에서 부동소수점으로 강제 변환하거나 정상 문자열을 임의로 거부하지 않습니다. [공식 수식 설명](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.formula?view=openxml-3.0.1)은 스프레드시트의 데이터 원본 참조와 워드프로세서의 외부 데이터 사용을 구분하지만, 이 구현은 HWPX 실파일에 존재하는 수식을 삭제하거나 변환하지 않습니다.

## 실파일·적대적 검증

레거시 fixture와 로컬 `edwardkim/rhwp` 커밋 `e8800c8def63449808a4092798442652ed460552`의 HWPX를 제품 코드의 선택적 차트 조사로 확인합니다. 476개 수용 문서의 93개 고유 차트에서 숫자 참조 259개·문자열 참조 477개와 수식·연결 캐시 각 736개가 관측됐고 구조 진단은 0건이었습니다. 수식 텍스트의 내용은 아직 제품 보고서가 검사하지 않습니다. 선택 조사는 로컬 `reference/rhwp` 클론이 필요하며 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX corpus chart path and XML read-only survey'`로 실행합니다.

합성 테스트는 정상 참조와 생략 가능한 캐시, 수식 누락·중복, 캐시 종류 불일치·중복, 수식 leaf 위반, 다단계 참조의 미지원 표시, 리터럴의 잘못된 위치, 순서 역전, namespace 위장, 정확한 한도, 할당 실패를 검사합니다. 문서 통합 테스트는 중복 차트 경로의 한 번 집계, 서로 다른 차트 간 공유 한도와 첫 진단 경로의 소유권을 확인합니다.

최종 소스의 기본 `zig build test --summary all`은 5/5 단계·2,132/2,132 테스트, HWPX ReleaseFast는 110/110 테스트를 통과했습니다. Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all`은 각각 40/40 단계·2,171/2,171 테스트 통과했습니다. ReleaseSafe 제품 빌드와 기존 JS 비교는 5/5·8/8 단계 통과했고, 선택 실파일 차트 조사는 위 93개·736개 수치를 최종 소스로 재확인했습니다. 이는 수식 계산이나 전체 HWPX 문서 검증 완료를 뜻하지 않습니다.

# HWPX 차트 값·수식 텍스트 관측

`Document.inspectChartReferences`는 [공통 XML 본문 이벤트](xml-document.md)의 검증된 CharData·CDATA를 같은 순회에서 [캐시 포인트](hwpx-chart-cache.md)의 직접 `pt/v`와 [수식 참조](hwpx-chart-formula.md)의 직접 `numRef|strRef/f`에 전달합니다. XML 문자 참조는 해제하고 literal CRLF는 LF로 정규화하되, CDATA 안의 `&`는 참조로 해석하지 않습니다. 포인트·수식 leaf별 정규화된 UTF-8 바이트 수와 빈 문자열 건수, 문서 전체 합계·최대 leaf 길이를 보고합니다. 텍스트는 일시적으로 할당·해제하며 보고서나 문서 모델에 원문 문자열을 보존하지 않습니다.

기본 한도는 포인트 값과 수식 각각 leaf당 1 MiB, 참조된 모든 고유 차트의 값 텍스트 합계 64 MiB·수식 텍스트 합계 16 MiB입니다. 한도는 XML 원본 바이트가 아니라 해제된 UTF-8 바이트에 적용되며 XML 자체의 기존 엔트리·총량·문자·참조 한도와 별도입니다. 빈 `v`·`f`는 관측값이지 자동 구조 오류는 아닙니다. [OOXML 숫자 포인트 `v`는 `ST_Xstring`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.numericvalue?view=openxml-3.0.1), [수식 `f`는 XML Schema string](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.formula?view=openxml-3.0.1)입니다. 값의 `_xHHHH_` 해석은 [별도 계층](hwpx-xstring.md)이 소유하며 수식에는 적용하지 않습니다. 숫자 파싱, 수식 문법·계산, 원본 셀·외부 데이터의 일치, 렌더링·편집·저장은 아직 검증하지 않습니다. 길이·빈 문자열 0건만으로 값의 의미가 맞는다고 주장하지 않습니다.

## 실파일·독립 대조

로컬 `reference/rhwp` 커밋 `e8800c8def63449808a4092798442652ed460552`와 추적된 레거시 fixture의 HWPX에서 제품 선택 조사는 476개 수용 문서의 차트 파트 93개를 검사했습니다. 값 2,296개는 UTF-8 합계 12,374바이트·최대 21바이트, 수식 736개는 합계 10,540바이트·최대 17바이트였고 빈 값·빈 수식·기존 구조 진단은 모두 0건이었습니다. `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX corpus chart path and XML read-only survey'`로 재현합니다. 로컬 `reference/rhwp` 클론이 없으면 이 선택 조사는 실행할 수 없습니다.

독립 oracle `python3 tools/hwpx-chart-text-oracle.py`는 제품 Zig 코드를 사용하지 않고 Python 표준 라이브러리의 ZIP/XML 파서로 `Chart/*.xml` 멤버를 읽습니다. 입력 패키지 25,000,000바이트, 차트 XML 32 MiB를 상한으로 두며 초과 입력을 잘라서 성공 처리하지 않습니다. 차트 93개, ZIP 거부 6개, 값·수식 개수와 UTF-8 합계·최대·빈 건수가 제품 조사와 모두 일치했습니다. oracle은 `chartIDRef` 도달성을 판정하지 않고 모든 차트 멤버를 조사하므로 이 일치는 현재 corpus에서의 대조이며 일반 파일에 대한 동치 증명은 아닙니다.

## 적대적 경계

XML 공통 테스트는 참조 문자와 CDATA의 차이, literal CRLF와 numeric CR, 빈 CDATA, UTF-16LE/BE의 CDATA 종결 위치, 정확한 UTF-8 바이트 한도와 모든 할당 실패를 검사합니다. 차트 테스트는 분할된 본문·CDATA의 값 길이, 비숫자 `ST_Xstring` 허용, 빈 leaf의 별도 계수, leaf·문서 총량의 정확/부족 경계, 여러 차트 파트 간 총량 공유 및 실패 후 소유권 해제를 검사합니다. 이 계약은 [XML 문서 구조](xml-document.md)의 파싱 검증을 재구현하지 않습니다.

차트 텍스트 관측 커밋 `af88998e` 당시 기본 `zig build test --summary all`은 5/5 단계·2,137/2,137 테스트, HWPX ReleaseFast는 112/112 테스트를 통과했습니다. Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all`은 각각 40/40 단계·2,176/2,176 테스트 통과했습니다. ReleaseSafe 제품 빌드와 기존 JS 비교는 5/5·8/8 단계 통과했습니다. 위 선택 실파일 조사와 독립 oracle도 같은 텍스트 합계·최댓값을 재확인했습니다. 이 수치는 전체 문서 의미 검증이나 무손실 편집·저장을 증명하지 않습니다.

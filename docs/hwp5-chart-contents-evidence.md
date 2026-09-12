# 차트 Contents 명세와 실측 경계

## 공식 자료

한컴 [공식 공개 페이지](https://www.hancom.com/support/downloadCenter/hwpOwpml)의 [차트 revision 1.2 PDF](https://cdn.hancom.com/link/docs/%ED%95%9C%EA%B8%80%EB%AC%B8%EC%84%9C%ED%8C%8C%EC%9D%BC%ED%98%95%EC%8B%9D_%EC%B0%A8%ED%8A%B8_revision1.2.pdf)를 확인했습니다. 판본 표기는 20141120이며 전체 47페이지입니다. 받은 원본의 SHA-256은 `e014db3e4b55bc57d93b3aba0b186151b3487575e3a6397a2983715b43beeeb1`입니다. 원본은 조사용 `/tmp/hwpjs-chart-spec.mHJXWV/chart.pdf`에 두었고 수정·재배포하지 않았습니다.

PDF 8번째 페이지(인쇄 쪽 2)의 그림을 렌더링해 확인했습니다. 객체는 id, StoredtypeId, StoredName, StoredVersion, ChartObjData 순서이며 같은 타입의 재등장에서는 이름/버전 부분이 생략됩니다. 그림의 타입 표기만으로 문자열의 실제 직렬화 길이, 정수 폭, Contents 시작 전 부가 헤더, 각 객체 데이터의 종료 위치까지 확정하지 않습니다. VtChart 속성 표의 API 의미 설명을 그대로 저장 순서·바이트 오프셋으로 사용하지 않습니다.

로컬 `legacy/rust/documents/docs/spec/chart.md`는 5줄의 내용 준비 중 문서입니다. 이 파일을 구현 가능한 차트 명세로 취급하지 않습니다. 조사 대상은 기본 객체 그림과 VtChart 속성 표이며, 공식 47페이지의 모든 객체 필드를 검증 완료했다는 뜻이 아닙니다.

## 실제 바이트 관측

[OLE 표본 조사](hwp5-ole-container.md)의 동일한 584개 경로/52개 OLE 항목에서 내부 CFB를 열었습니다. CFB의 대소문자 무시 조회로 Contents 44개를 찾았습니다. 실제 이름은 Contents/CONTENTS 두 가지였습니다. `VtChart` 뒤 NUL까지 포함한 바이트열은 43개에 있었고 첫 위치는 모두 46이었습니다. 이 문자열 존재는 차트 객체 그래프 검증이나 안전한 형식 판정이 아닙니다.

나머지 하나는 대문자 CONTENTS이며 24,746바이트, 선두 `d7cdc69a`입니다. SHA-256은 `b672049cbc647c8e5ca847a2b5d5e7691ac7f3bdf9d562d979a441644f25ce4b`입니다. 네 종류의 관측용 Vt 문자열은 모두 없었습니다. 따라서 스트림 이름만으로 모든 Contents를 차트 파서에 전달할 수 없습니다. 이 조사에서는 해당 데이터의 전체 형식 검증을 하지 않았습니다.

43개 문자열 관측 표본의 선두 u32 LE 네 개는 `[65536,0,0,96]` 또는 `[65536,12012,12012,96]`이었습니다. VtChart 문자열 위치 46과 네 번째 값 96은 서로 다릅니다. 96이 잘못됐다는 증거는 아니며 그 필드가 무엇을 가리키는지 별도 검증해야 합니다. 고정 위치나 문자열 탐색 결과를 객체 경계로 승격하지 않습니다.

## rhwp와 구분

`reference/rhwp/mydocs/tech/hwp_chart_spec.md`의 초기 설계 설명은 CHART_DATA 하위 레코드를 중심으로 합니다. 반면 현재 `src/ole_chart/parser.rs`는 Contents의 시작 값과 문자열을 관측하고 `grid::scan_legacy_grid`를 호출하는 별도 경로를 갖습니다. 그 경로는 전체 object graph를 해석하지 않는다고 소스에 명시하며 반환 차트 종류도 Unknown입니다. 초기 설계 문서나 함수 이름만으로 현재 전체 지원 범위를 판정하지 않습니다.

rhwp의 legacy_chart_object_start 후보는 선두 네 번째 값을 사용합니다. 이번 실측은 그 이름이 실제 VtChart 문자열 시작 위치와 같음을 증명하지 않습니다. 이 차이만으로 rhwp의 파싱 오류라고 단정하거나 그 후보 규칙을 제품에 복사하지 않습니다.

## 재현과 적대적 검증

관측기는 `tests/hwp5/chart-contents-evidence.mjs`, corpus 조합은 `chart-contents-survey.mjs`, 단위 테스트는 `chart-contents-evidence.test.mjs`로 분리했습니다. 실행 명령은 [개발 명령](development-commands.md#차트-contents-관측)에 있습니다. 제품 파서나 정규 전체 audit에 연결된 검증기가 아니라 명시적으로 실행하는 조사 도구입니다.

단위 테스트 4/4 통과: 0~15바이트 헤더 부재와 값 0의 구분, 0/1/16/46/96/127 위치의 문자열, NUL·대소문자·중복의 첫 위치, 바이트 관측 결과의 입력 독립성을 검사했습니다. 별도 `/tmp/hwpjs-chart-evidence-mutants.LTSuDp`에서 위치를 46으로 고정, NUL 요구 제거, 짧은 헤더를 0으로 보완한 변형은 각각 3/1/1개 assertion 실패·종료 코드 1로 검출했습니다. import/실행 오류를 검출 성공으로 세지 않았습니다.

변경 JS 구문·공백과 문서 로컬 링크 26개(실행 명령 anchor 포함) 검사도 통과했습니다. 실제 조사 출력은 `/tmp/hwpjs-chart-spec.mHJXWV/survey.json`에 남겼습니다.

공식 문서 확보와 관측 도구 검증 단계입니다. 제품 Zig/WASM 소스는 바꾸지 않았고 기존 990개 테스트를 차트 의미 지원의 증거로 사용하지 않습니다. 다음 단계는 실제 타입 정의 헤더의 이름 길이·버전 폭·재등장 규칙을 검증하고, 객체별 데이터 경계를 확정하는 것입니다. 아직 확인하지 않은 값을 기본값으로 채우거나 임의 위치에서 재탐색하지 않습니다.

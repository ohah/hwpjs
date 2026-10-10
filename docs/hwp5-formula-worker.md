# HWP5 수식 패널 연결

## 제출 시 대상 재확인

검증은 공통 폼/HWP5 Worker/HWPX Worker3파일5/5·skip0·exit0(27346ms), 후속 문서 load 중 재진입의 새 enable 요구까지 추가한 공통 폼3/3·exit0입니다. 조회 내용을 JS로 바꾸어 native 성공을 가장하지 않았습니다. 이벤트 대역과 실제 Worker 모듈 검사이며 브라우저 재진입 E2E 완료는 아닙니다.

공통 수식 폼의 reportValidity 콜백 중 선택을 바꾸는 재진입 반례에서 대상7에 대상8의 AVG 초안을 제출하는 혼합을 재현했습니다. 제출 직전 capability·enabled·ready를 다시 검사하고 선택한 authoritative row가 동일한 경우에만 요청하도록 수정했습니다. 유효성 검사 중 pending 상태가 된 경우도 제출하지 않습니다. DOM 이벤트 대역의 반례이지 일반 사용자 브라우저에서 자연 발생을 확인한 보고는 아닙니다. HWP5/HWPX 공통 폼에 적용하며 native 원자성/identity 검증을 대체하지 않습니다.

## 구조 편집 후 Worker 회귀

후속 재검증에서는 동일 b8e5409a 후보와 속성 패널 열린 상태에서 실제 도구 모음 `#undo`·`#redo`를 명시해 클릭했습니다. AVG16.875 적용 → undo 후 SUM 입력값 → redo 후16.875 표시가 각각 DOM 조건을 만족했고 브라우저 오류는 없었습니다. 따라서 앞선 이름 기반 클릭 실패만으로 패널 겹침 제품 버그라고 단정하면 안 됩니다. 같은 접근성 이름의 메뉴 버튼과 도구 모음 버튼을 구분하지 못한 자동화 선택 문제이며 CSS 변경 없이 정상 경로를 확인했습니다. 이 검사는 수식 폼 이력 경로이지 실제 Canvas 분할 E2E는 아닙니다. agent-browser 스킬로 실행했고 소유 브라우저/임시 서버를 종료했습니다.

후속 실제 Chromium 확인에서 b8e5409a 후보를 loopback8085로 열고 픽스쳐 picker의 chart.hwp·편집 시작·속성 패널13수식·AVG 폼 제출 후16.875 표시까지 성공했습니다. 속성 패널을 연 상태의 접근성 이름 기반 실행 취소 클릭은 다른 form에 가려졌고, 후속 다시 실행 클릭도 find-input에 가려졌습니다. 이 클릭 실패를 수식 rollback 실패나 undo/redo 통과로 해석하지 않습니다. 후보의 실제 브라우저 구조 편집/이력 E2E는 여전히 미검증이며 기본 WASM은 그대로입니다. loopback 임시 서버는 종료코드130으로 종료했습니다.

2026-10-11 b8e5409af336c039c78b19e94b93eba880a2bd19996813feb321105e3b550899 후보에서 실제 Worker의 chart 본문 분할 후 수식 capability·빈 오류 목록·이동한 문단24 선택·기존 CTRL_HEADER handle 유지와 이전 문단23의 오선택 거부를 확인했습니다. 이동한 결과 영역의 직접 입력은 계속 ReadOnlyFormulaResult이며 저장 바이트가 불변입니다. 후속 SUM 정의 변경은67.5로 계산되고, 두 단계 undo는 AVG 정의와 분할 전 저장 바이트/선택을 각각 복원합니다. 공개 정의/API와 Worker2파일5/5·skip0·exit0입니다. Node self/fetch 경계 대역이며 실제 브라우저 분할/포인터 E2E나 기본 WASM 승격의 증거는 아닙니다.

## 실제 Chromium 및 기본 반영

2026-10-11 loopback8085의8bd5ab4e 후보에서 실제 픽스쳐 선택 chart.hwp·편집 enable·속성 패널 열기와13수식 목록을 확인했습니다. input에 `=AVG(B?:E?)`를 넣고 실제 submit 버튼으로 제출해 완료 안내와 목록의16.875를 확인했습니다. 실제 undo 버튼 후 SUM, redo 후16.875가 될 때까지 DOM 조건으로 기다렸습니다. 모델을 eval로 설치하지 않았으며 eval은 표시 값 읽기만 사용했습니다. 브라우저 오류는 없었고 agent-browser 스킬 절차대로 브라우저 close·소유 임시 서버exit130을 확인했습니다. 화면은 `/tmp/hwpjs-formula-panel-20261011.png`입니다. 기존 HWPX 전용 legend는 공통 `표 계산식`으로 수정했습니다.

이 GUI는 드롭다운/폼 경로이며 Canvas 포인터로 특정 수식을 선택·다운로드 재업로드·OS IME·원본 조판 검증은 아닙니다. 후속 기본/외부 반영과 backup 및 교체 후 검사는 [현재 데모 산출물](current-preview-artifact.md)이 소유합니다. 아래 기본 미반영/GUI 후속 표현은 당시 단계입니다.

`hwp5-formulas-content.mjs`는 native snapshot을 UI 목록으로 정규화합니다. 공통 패널의 beginElement는 HWP5에서는 세션의 CTRL_HEADER source_node이며 XML 요소 번호라는 뜻이 아닙니다. owner.paragraph는 native 현재 문단 번호입니다. Canvas 선택은 같은 구역/문단의 수식이 정확히 하나일 때만 연결하며, 여러 수식은 임의로 선택하지 않습니다. 드롭다운에서는 각 명시적 handle을 선택할 수 있습니다.

Worker의 formula-definition 명령은 현재 문서 포맷에 따라 HWP5 객체 인자 또는 기존 HWPX 좌표 인자로 분기합니다. 성공 후 native 저장본에서 preview를 갱신하고 수식 목록은 현재 native 모델에서 다시 읽습니다. 조회 오류는 formulaErrors로 보존합니다. native 조회/작성 export가 모두 있어야 HWP5 작성 capability를 표시합니다. 공통 패널도 명시적 capability·enable·ready·선택을 모두 요구합니다. HWPX Worker capability도 실제 export를 기준으로 갱신합니다.

2026-10-11 `8bd5ab4eb684e9f7a71c820df1a17239035cfa6f927334b9ecacaf0361fca7ae` 후보에서 실제 Worker 모듈의 chart13수식·변경/저장/재열기·undo/redo·잘못된 범위/원본 보존·계산 결과 직접 입력 ReadOnlyFormulaResult 거부를 확인했습니다. 문단의 editable=true와 결과 범위의 직접 입력 보호는 다른 계약이며 문단 전체를 비활성으로 바꾸지 않았습니다. adapter/capability/공통 패널3파일4/4·skip0·exit0, 기존 HWPX 수식 Worker 포함 초기3파일4/4도 통과했습니다. 기존 HWP5 Worker/Canvas와 신규 연결5파일188/188·skip0·exit0입니다(`/tmp/hwpjs-formula-worker-regression-20261011.log`).

처음 패널 검사는 부분 content 대역에 capability를 빠뜨려 실패했고 명시적 완전 응답으로 수정했습니다. 원본 계산 결과 문단의 editable=false 기대도 틀려 실제 결과 범위 거부로 검사를 교정했습니다. 실제 모듈 연결470개가 성공했습니다. Node의 self/fetch 및 DOM/Canvas 경계 대역이며 실제 브라우저 포인터·패널 제출·다운로드/재열기·기본 WASM 반영은 아직 후속입니다.

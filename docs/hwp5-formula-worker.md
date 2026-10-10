# HWP5 수식 패널 연결

`hwp5-formulas-content.mjs`는 native snapshot을 UI 목록으로 정규화합니다. 공통 패널의 beginElement는 HWP5에서는 세션의 CTRL_HEADER source_node이며 XML 요소 번호라는 뜻이 아닙니다. owner.paragraph는 native 현재 문단 번호입니다. Canvas 선택은 같은 구역/문단의 수식이 정확히 하나일 때만 연결하며, 여러 수식은 임의로 선택하지 않습니다. 드롭다운에서는 각 명시적 handle을 선택할 수 있습니다.

Worker의 formula-definition 명령은 현재 문서 포맷에 따라 HWP5 객체 인자 또는 기존 HWPX 좌표 인자로 분기합니다. 성공 후 native 저장본에서 preview를 갱신하고 수식 목록은 현재 native 모델에서 다시 읽습니다. 조회 오류는 formulaErrors로 보존합니다. native 조회/작성 export가 모두 있어야 HWP5 작성 capability를 표시합니다. 공통 패널도 명시적 capability·enable·ready·선택을 모두 요구합니다. HWPX Worker capability도 실제 export를 기준으로 갱신합니다.

2026-10-11 `8bd5ab4eb684e9f7a71c820df1a17239035cfa6f927334b9ecacaf0361fca7ae` 후보에서 실제 Worker 모듈의 chart13수식·변경/저장/재열기·undo/redo·잘못된 범위/원본 보존·계산 결과 직접 입력 ReadOnlyFormulaResult 거부를 확인했습니다. 문단의 editable=true와 결과 범위의 직접 입력 보호는 다른 계약이며 문단 전체를 비활성으로 바꾸지 않았습니다. adapter/capability/공통 패널3파일4/4·skip0·exit0, 기존 HWPX 수식 Worker 포함 초기3파일4/4도 통과했습니다. 기존 HWP5 Worker/Canvas와 신규 연결5파일188/188·skip0·exit0입니다(`/tmp/hwpjs-formula-worker-regression-20261011.log`).

처음 패널 검사는 부분 content 대역에 capability를 빠뜨려 실패했고 명시적 완전 응답으로 수정했습니다. 원본 계산 결과 문단의 editable=false 기대도 틀려 실제 결과 범위 거부로 검사를 교정했습니다. 실제 모듈 연결470개가 성공했습니다. Node의 self/fetch 및 DOM/Canvas 경계 대역이며 실제 브라우저 포인터·패널 제출·다운로드/재열기·기본 WASM 반영은 아직 후속입니다.

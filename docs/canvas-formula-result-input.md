# Canvas 수식 결과 텍스트 경로

## 소유권과 경계

Worker의 기존 `splice` 메시지는 일반/필드 바깥 경로 뒤에 수식 결과의 native range target을 조회하고, 유일한 결과 내부 범위만 `spliceManualFormulaResult`로 보냅니다. 문단 전체가 하나의 결과인 경우에만 해당 target의 전체 범위 일치를 근거로 whole-paragraph 편집을 표시합니다. 혼합 문단은 `query-edit-range`가 native 결과 범위 권한을 조회하며 결과 밖·모호한 선택은 허용하지 않습니다. 문자열 내용이나 source cache 길이로 소유권을 추측하지 않습니다.

`formula-result-text-command.mjs`가 선택적 capability·표시 projection·범위 치환 변환을 소유합니다. 필요한 splice/한도/목록/선택/표시 export5개와 JS method가 모두 있어야 활성화합니다. 이전 WASM에서는 보호 상태를 유지합니다. 문단 창 모드의 섹션 수식 지원 여부도 기존 수식 조회 모듈로 확인하고, 실제 범위는 native query가 판별합니다.

현재 결과의 좌표와 문단 표시 텍스트는 같은 일시적 `formula_result_projection.zig`의 Sites/보호 개체 segment를 사용합니다. 표시 예산 초과는 기존 `clipText`의 서로게이트 안전 절단과 읽기 전용 정책을 따릅니다. 편집 모델을 JS에 복제하거나 native query 결과를 영구 cache로 보관하지 않습니다. 구조/생성 표 제한은 [좌표 계약](hwpx-formula-result-targets.md)을 따릅니다.

## 실측

shared projection으로 분리한 후 native ReleaseSafe2/2·exit0입니다. 실제 chart의 입력 후 좌표7·문단 표시 `앞😀67.5` 일치와 OOM 전수에서 조회/표시·live override/원문/저장 불변을 확인했습니다.

ReleaseSafe 제품5/5·exit0 후보 SHA256은 `2232685d25405a0fabb9693d8aa7a3fe7a997919a890c3c817b60d132f73eb3e`입니다. 별도 `zig-out/manual-canvas-api/bin/hwpjs.wasm`이며 기본 작업 트리 WASM은 바꾸지 않았습니다.

실제 Worker 새 회귀6/6·fail/cancel/skip0·exit0(20396.243875ms)을 확인했습니다. export5개 각각 누락 시 결과가 보호 상태·splice 거부·원문 저장을 유지합니다. 정상 경로는 기존 splice 메시지→current 표시/좌표→독립 전체 XML/ZIP 일반/-O 및5변조→서로게이트 거부→undo/redo 원문/수정본 저장을 검사합니다. `query-edit-range`의 결과 내부 허용/바깥 거부 및 `query-edit-window`의 같은 현재 표시/좌표도 확인했습니다. 앞선 window/선택 권한 보강 전6/6(19426.014833ms)과 합산하지 않습니다.

이 Worker 결과만으로 브라우저 포커스·pointer hit·beforeinput·물리 IME·다운로드 E2E나 전체 fixture/조판 완료를 주장하지 않습니다. 후속 브라우저 검증은 아래에 별도로 기록합니다. 등록 묶음 전체 재실행·최신 native 전체·다른 문서/물리 IME/원본 조판 검증은 남아 있습니다.

## 실제 브라우저와 연속 입력 누락 수정

전용 agent-browser 세션으로 chart를 파일 선택해 편집 시작→찾기67.5→Canvas 입력 포커스→Home→브라우저 텍스트 입력 `브라우저😀<&`를 수행했습니다. 입력 컨트롤과 실제 수식 표시가 `브라우저😀<&67.5`로 갱신됐고 첫 후보2232685d의 다운로드 편집본/undo 원문/redo 편집본을 바이트 단위로 대조했습니다. 독립 전체 XML/ZIP 일반/-O와5변조 거부도 통과했습니다. 잘못된 초기 서버 루트404와 복잡한 hash eval 구문의 SyntaxError는 브라우저 준비/검사 명령 실패이며 제품 통과로 계수하지 않습니다.

이후 실제 Canvas 텍스트 위치를 마우스로 클릭해 I-beam·입력 포커스·커서 이동을 확인했지만, 원문 길이4를 넘는 커서10에서 추가 입력이 `InvalidTextPosition`으로 거부됐습니다. Worker 회귀에도 표시 길이7에서 커서6의 권한/입력을 추가해 같은 오류·exit1을 재현했습니다. 원인은 필드 바깥 계획 `field_source_outside_plan`의 수식 prepare가 result_overrides/source_display_options를 누락해 현재 결과를 원문 길이로 검사한 것입니다. 격리 사본의 해당2옵션만 연결했고 일반 경로 검사 순서는 유지했습니다.

수정 후보 SHA256 `13c89f0a4ea28e36bfe54788712d328bd28058f6432c89494103f82108006258`는 ReleaseSafe5/5·exit0입니다. 보강한 실제 Worker6/6·fail/skip0·exit0(24922.150625ms)으로 원문 길이 밖의 현재 권한·연속 입력·독립 XML/ZIP 양 Python 모드/변조·undo 저장을 확인했습니다. 이전 후보의6통과에는 이 연속 입력 검사를 소급하지 않습니다.

새 브라우저 세션에서 같은 원본/입력 후 실제 Canvas(748,587)를 클릭했습니다. 현재 커서8·I-beam·readOnly=false를 확인하고 `P`를 입력해 `브라우저😀<&P67.5`가 화면과 native 저장에 반영됐습니다. 브라우저가 받은 WASM hash도13c89f0a와 일치했습니다. 실제 다운로드 파일의 두 번 undo는 원본, 두 번 redo는 수정본과 같고, 한 번 undo는 앞선 접두 입력본과 같습니다. `canvas-followup-edited.hwpx`에 대한 독립 전체 XML/ZIP·일반/-O·각5변조 검사도 모두exit0입니다. `/tmp/hwpjs-manual-result-publication.ervxKq/`의 `canvas-followup-pointer-typed.png`와 다운로드4파일이 증거입니다.

두 브라우저 세션 및9019 임시 서버는 각 소유 trap으로 종료했고 세션 목록 부재·서버 PID96915/30133 부재·리스너 부재를 확인했습니다. 다른 작업 세션은 닫지 않았습니다. 이 검증은 한 실제 문서·한 결과의 찾기/마우스 포커스·브라우저 텍스트 입력·저장/이력 경로입니다. 물리 키보드 IME·전체 필드/문서·글꼴/조판 동일성은 검증하지 않았습니다.

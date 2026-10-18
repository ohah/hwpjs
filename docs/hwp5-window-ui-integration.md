# HWP5 구간 조회의 Worker·Canvas 연결 후보

## 책임과 현재 계약

구간 후보는 기존 문서 전체/native 편집 모델을 유지하고 표시할 문단과 소유 context만 선택합니다. `queryHwp5WindowContent`가 조회를 준비하고 `hwp5-window-selection`이 문단 수·원본 식별자·연속 선택·clipping·context 비편집 조건을 검사합니다. 표·그림·목록·필드·단·반복 영역·쪽 제어 의존성은 종류별 어댑터가 소유합니다. 원문/현재 문단 좌표를 화면 순번으로 대체하지 않습니다.

Worker의 조회는 편집 활성화를 뜻하지 않습니다. 활성 구간은 성공적으로 준비한 뒤에만 변경하고 잘못된 요청은 기존 구간/원문/이력을 유지합니다. 본 후보는 HWP5 구간 상태를 기존 HWPX 상태와 별도로 보관해 기존 HWPX 경로를 유지합니다. 기본 표시로 복원하면 전체 미리보기 경로를 사용합니다. 공개 구간 UI는 선택적 field-span ABI가 있을 때만 활성화합니다.

`hwp5-window-page-layout`은 완전한 선택·소유권·비부분 표를 확인한 구간에 한해 기존 페이지 계산기를 호출합니다. 구간은 `paragraph-window-fragment`이며 원본 페이지 번호 동치를 주장하지 않습니다. 부분 표 때문에 논리적 fallback을 사용하더라도 fragment scope와 `documentPageNumbersExact=false`를 유지합니다. scope 문자열은 해당 모듈의 상수가 소유합니다.

## Worker 요청·응답

`{ kind: "query-window", offset, count }`는 문서가 열린 상태에서 조회하며 편집을 활성화하거나 활성 표시 구간을 바꾸지 않습니다. `query-edit-window`는 편집 활성화가 추가로 필요합니다. `set-edit-window`도 편집 활성화가 필요하고 성공적으로 준비된 내용에 한해 활성 표시 구간을 바꿉니다. `{ kind: "set-edit-window", offset: null, count: null }`은 기본 미리보기를 복원합니다. 구간 이동은 문서 변경/이력 거래가 아닙니다.

`offset`은 0부터 시작하는 현재 문서 전체의 문단 순번입니다. 실제 편집 요청은 응답 문단의 원본 `section`/`paragraph`와 UTF-16 단위 위치를 사용하며 화면 배열 인덱스나 `offset`으로 대체하지 않습니다. UI의 시작 문단만 1부터 표시합니다. 응답은 기존 Worker envelope의 `content`에 `window` 및 문단별 `windowOrdinal`/`windowContext`를 붙입니다. 소유권 확인에 필요한 context는 선택 밖에 있어도 포함할 수 있으나 `editable=false`·`selectable=false`입니다.

잘못된 타입·음수·범위 초과는 `InvalidParagraphWindow`, 의존 문단/문자 예산 초과는 각각 `ParagraphWindowBudgetExceeded`/`ParagraphWindowTextBudgetExceeded`로 거부합니다. 선택적 ABI 또는 구조 검증 오류를 빈 데이터로 대체하지 않습니다. 실패 요청은 기존 활성 구간·원문·undo/redo를 보존합니다. 구간 UI의 HWP5 허용은 native `hwp5_edit_field_spans` 기능 비트와 ready/idle/입력 완료 조건을 모두 요구합니다. 기존 HWPX 구간 상태와는 분리됩니다.

## 초기 검사와 실패 이력

분리 JS 후보는 `/tmp/hwpjs-window-ui-publication.5u0iBt`, 주입 native는 별도 field-span 후보입니다. 정규 Git fixture inventory와 b17b942c WASM을 사용한 `window-ui-fallback-exact-regressions.log`는 정확한8파일·12/12·fail/cancel/skip0·exit0입니다. 일반45원본의723개 셀 소속 문단 독립 대조·셀 분할/이력, 표 캡션·텍스트박스·그림의 Canvas 소비, 양 형식 구간/실패/이력, 부분 표 fallback의 scope 반례를 포함합니다. 실제 Chromium 검사가 아니라 실제 Worker/WASM과 모의 DOM/Canvas입니다.

`window-fallback-before.log`의 실패는 부분 표 fallback이 scope를 `document-preview`로 잘못 표시한 재현입니다. 그 branch를 추가해 위12/12로 다시 검증했습니다. 최초 명시 Node 목록의 누락 파일은 조용히 제외돼8개 선언만 실행됐습니다. 파일을 넣고 exact-path runner로 다시 실행한11/11 및12/12만 전체 선택 목록의 근거로 사용합니다.

실제53,448문단 원본의5만 번째 문단 양성 편집 검사는 초기 후보에서 실패했습니다. 처음에는 field-span 종류/헤더 별칭이 막혔고 [구조 조회](hwp5-field-span-query.md)를 보강했습니다. 이후 `late-window-indexed-positive.log`에서는 load24,318.43ms·enable22,493.08ms·구간 준비37,286.06ms 뒤 조회에 성공했으나 `editable=true` 기대가 실제false로 실패했습니다. 당시 `%unk` 원본의 편집 source policy를 아직 해석/허용하지 않았으므로 해당 실행을 편집 성공으로 소급 변경하지 않습니다. 후속 성공은 아래 별도 후보·로그에 한정하며 전체 UI 지연은 해결되지 않았습니다.

표 그룹화의 별도 선형 인덱스는 [해당 계약](hwp5-table-cell-index.md)이 소유합니다. 합성 조회 횟수 감소를 위 대형 원본 전체 지연 개선율로 사용하지 않습니다. 미게시 구간 변경·기본 WASM/외부 데모·실제 브라우저·모든 소유권/조판 완료는 별도입니다. 기존 미게시 차트/수식/표 생성 코드를 Worker 전체 복사로 채택하지 않았습니다.

후속 [빈 RevisionSign 보존](hwp5-revision-sign-text-retention.md) 후보1a359d64에서는 같은5만 번째 문단의 Worker 편집 양성이1/1·exit0으로 끝났습니다(`late-window-retention-positive.log`,199,830.38ms). Canvas controller 선택·모의 beforeinput/input·독립 전체 Section·저장 이력도1/1·exit0입니다(`late-window-retention-canvas.log`,226,669.05ms). 앞선 실패 로그를 소급 통과로 바꾸지 않으며 실제 Chromium·포인터/IME·원본 조판·질의 지연 해결은 여전히 별도입니다.

## 실제 Chromium 후속 검증

같은 원본의 구역0/문단50000을 `--case=market`으로 검사했습니다. 처음에는 app의 구간 UI ready 조건이 HWPX만 허용해 disabled 클릭 guard에 실패했습니다. 양 형식 조건으로 수정한 뒤 단순 Home이 문단 시작이 아닌 표시 줄 시작으로 이동하는 검증 가정을 발견했습니다. Cmd+위의 추가 실패는 [문단 경계 단축키](canvas-paragraph-edge-navigation.md)의 실제 키 해석 오류로 분리해 수정했습니다. 세 실패 세션 모두 종료했고 실패 로그를 보존합니다.

`market-real-browser-navigation-fixed.log`는 신뢰된 beforeinput/input 두 이벤트, Worker의 원본 문단50000 및 삽입 범위0..0, undo/redo, 실제 다운로드를 확인했습니다. 독립 oracle은 전체 Section의 목표 외 레코드·다른 스트림·CFB 메타데이터를 대조하고 잘못된 입력 문자열의 음성 대조도 실패해야 함을 확인합니다. native 재열기와 브라우저 재업로드 후 같은 구간 재선택·텍스트 찾기도 통과했습니다. 마지막 `browser-audit-complete.success=true`, 전용 세션 `active=false`·`pid=null`, 서버 종료를 별도 확인했습니다.

주입 native SHA256은 `1a359d6459cc8c8ec13df8067eec40752c48e2adb668580458cdc32b91e0eb3b`, 원본은 `84d297375c48e1e903247a389e9ec3907e3cdc57a4a7e29a819a01c2a1e3a341`, 저장본은 `14c72b64b65241d78a51902b21ae1d3f1300b6fd85197d1887ad25105f7b7901`입니다. 캡처에서 삽입 문자열과 좁은 표 셀의 줄바꿈을 확인했습니다. 이 결과는 한 원본의 지정 경로이며 전체 포인터/IME·한글 조판 동치·성능 해결·기본 데모 배포 완료는 아닙니다. 최신 native 소스와 구간 JS를 합친 새 스냅샷 검증·게시가 남아 있습니다.

## 최신 native와 합친 게시 후보

`7f02026c`에서 시작한 `/tmp/hwpjs-window-integrated.oHnTVI/source`는 위의 구간 JS·선택 테스트만 합친 스냅샷입니다. native `src/`와 JS ABI 어댑터 `js/`에는 변경이 없으며 native 소스 디렉터리도 앞선 RevisionSign 후보와 일치합니다. 독립 ReleaseSafe 빌드는5/5·exit0이고 새 산출물 SHA256은 `574fc8f4f842db6d5be6cccbe12784cb0e3855938e54f4d8ae5b52ce88206405`입니다. 이전 산출물의 검증을 새 해시에 그대로 귀속하지 않습니다. export 비교는332대332·누락/종류 변경/추가0입니다.

새 산출물의975파일 리더 대조는944개 전체 JSON 동치·5개 동일 거부·26개 HWP3 제외로 종료됐습니다. 거부는 지원 성공이 아닙니다. HWPX 구간 회귀는 정확한5파일·10/10·실패/취소/건너뜀0·exit0이며 실제 Renderer 후반 구간 입력·실패 시 선택 보존·독립 저장 XML·구간 controller·대형 원본 마지막 구간 저장/재열기를 포함합니다. 모의 DOM/Canvas 검사이며 HWPX 실제 Chromium 증거로 사용하지 않습니다.

통합 산출물의 `market-browser.log`도 동일 원본의 문단50000에 대해 실제 입력·undo/redo·다운로드·독립 대조·재업로드를 완료했습니다. 최종 success=true·전용 브라우저 및 서버 종료를 확인했습니다. 저장본 SHA256은 앞선 브라우저 실행과 같습니다. 이 결과와 별도로 새 테스트를 등록한 정규 `hwp5-editor-audit`의 종료 판정이 남아 있습니다. 기본 WASM/외부 데모는 아직 승격하지 않았습니다.

최초 정규 실행 `editor-full.log`는451개 중450pass·1fail·cancel/skip0·exit1입니다. 실패는 새 그림 구간 테스트가 가져오는 `tests/hwp5/picture-byte-oracle.mjs`를 분리 스냅샷에 포함하지 않아 발생한 `ERR_MODULE_NOT_FOUND`입니다. 해당 독립 도우미를 포함한 뒤 정확한 그림 구간1파일은1/1·exit0으로 통과했습니다. 이를 최초 전체 실행의451/451로 소급 변경하지 않습니다. 같은 후보의 `editor-full-corrected.log`로 정규 묶음을 처음부터 다시 실행 중이며, 전체 종료 전에는 게시/승격 완료로 기록하지 않습니다.

재실행 `editor-full-corrected.log`는451/451·fail/cancel/skip0·exit0·7/7단계,1,115,428.23ms로 종료했습니다. 설치 산출물은 위574fc8f4와 일치하며 입력/구간 조회/부분 표 fallback/실제 fixture 소속/실패 이력/HWPX 구간 controller를 포함한 등록 묶음 전체의 근거입니다. 처음 실행의 누락 도우미 실패를 덮어쓰거나 두 실행을 합산하지 않습니다. 이 검증 뒤 구간 UI 소스를 main 게시 대상으로 삼되 기본 WASM/외부 데모의 승격, 전체 native 및 이후 성능 개선 후보의 정규 gate는 별도입니다.

후속 적대적 검증에서 조회 분기의 원본 정책 전달 누락을 재현했습니다. [구간 조회 원본 편집 정책](hwp5-window-source-policy.md)이 재현·수정·거부/이력 불변 계약을 소유합니다. 위451/451은 이 후속 수정 전 스냅샷이며 이후 변경의 전체 gate로 소급 사용하지 않습니다.

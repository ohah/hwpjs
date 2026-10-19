# 수정하지 않는 구역의 필드 보존

## 최신 후보의178범위 명시 정책 정규 회귀

전체 참조 감사의 편람 기본 정책 결과는10,514시도/10,336입력·이력,178개 `UnsupportedRangeSemantics`입니다. 이178개를 파서 실패로 단정하거나 기본 거부를 해제하지 않았습니다. 새 `manual-range-policy-reference.test.mjs`는 원본 SHA256 `40d6d05eac4d55bdc4b0c62c42d93af104d5123b447581246f36fd15de7bd46f`를 고정하고 기존 독립 range-prefix 검사기를 재사용합니다. 원본 레코드에서178곳·비교차 prefix0을 먼저 확인하고 각 위치의 기본 거부/원본 불변 뒤 명시적 half-open 입력·독립 전체 Section/비대상 stream/metadata·잘못된 기대 문자열 거부·undo/redo·재열기·원본/후보 불변을 검사합니다. 별도 미추적 manual-range-prefix 테스트는 채택하지 않았습니다.

e9aa1141 제품 소스의 분리 사본 `/tmp/hwpjs-field-interior-browser.DVJV5s`에 새 테스트만 추가해 Node24.20.0·nice10·후보 `9e75fd8bab9b879b3883f4703a7a8c2ffe100f98cd48c68a511eed797840b468`로 실행했습니다. `manual-range-policy.log/.stderr`는1/1·fail/cancel/skip/todo0·exit0·stderr0(226804.7245ms)이며 로그 SHA256은 `45c52a1a040de65932a9c0afc147d6fb01f2f69b7007dcbd63048aa958e842ac`입니다. 종료한 runner/test PID 부재와 최종 테스트 사본/작업 코드·후보 해시 일치를 확인했습니다. HWP5 editor gate에 한 번 등록했고 build fmt·JS 구문·등록 검사를 통과했습니다. 이전495개 gate에 이 새 회귀가 포함됐다고 소급하지 않습니다. 기본 정책10,336개와 명시 정책178개를 하나의 무거부 실행으로 합산하지 않으며 실제 한글 affinity·브라우저·조판 또는 전체 참조 완료를 뜻하지 않습니다.

현재 표·그림 등 로컬 개체 번호 참조는 [개체 번호 보존](hwp5-object-number-retention.md)을 따릅니다. 아래 roadmap 원본의 거부는 당시 기록이며, 최신 거부 회귀는 쪽 참조 파생 입력으로 보호를 확인합니다. 실제 대상 해결·번호 갱신 완료와는 구분합니다.

## main2d56f5ac 기반 분리 재검증 (2026-10-16)

같은 최신 후보로 실제178범위 문단의 명시적 half-open prefix와 중첩 범위의 시작/끝/내부 삽입·삭제·치환·서로게이트 거부·실패 후 redo·독립 전체 Section/비대상 stream·재열기를 별도 재검증했습니다. `manual-range-prefix.test.mjs`는2/2·fail/cancel/skip0·exit0(79450.5835ms)입니다. 기본 정책 거부를 유지하고 명시적 정책의 좌표/저장 계약만 검증했으며 한컴 affinity 일치나 모든 명령 완료로 확대하지 않습니다. 아래10,336개 기본 prefix 성공과178개 명시 정책 검사는 같은 기본 정책의 무거부10,514성공으로 합산하지 않습니다.

최신 분리 후보 `/tmp/hwpjs-unselected-fields-publication.s5BeqD/zig-out/bin/hwpjs.wasm`의 SHA-256은 `314fd38faf2025b906406d79cc37682b0d9857b96e7449bd463d054eaba970f5`입니다. main 코드에서 비대상 구역 검증 함수와 본문 splice·글자 속성·글자 모양의 세 호출만 변경했습니다. 수식 정의 경로와 선택 구역의 필드 입력 정책은 변경하지 않았습니다. 게시 여부는 Git 이력으로 확인하며 아래의 과거 후보 기록과 산출물을 혼용하지 않습니다.

실제 편람은 이전 후보에서 14개 구역 중 클릭 필드가 있는 2번 구역만 첫 문단 입력이 가능했고 나머지13개 구역은 거부됐습니다. 새 후보의 `unselected-field-sections.test.mjs`는 14개 구역 각각의 첫 문단에서 prefix 입력·글자 모양·크기/굵게/기울임을 실행하고, 독립 전체 Section/DocInfo·비대상 stream·CFB 메타데이터·재열기·각 단계 undo/redo와 원본 복원을 검사해1/1·exit0(18584.243958ms)입니다. 수정 전 WASM은 동일 검사에서 `UnsupportedSectionControl`로 실패합니다. 빠졌던 독립 글자 모양 oracle 모듈 때문에 처음 실행하지 못한 harness 오류는 성공/제품 실패로 계수하지 않습니다.

별도 실제 편람 전수 prefix 감사는10,514문단 중10,336입력/이력·독립 텍스트/비대상 stream·저장 재열기 검증,178개 `UnsupportedRangeSemantics` 거부·exit0입니다. 종료0은 전체 편집 지원을 뜻하지 않습니다. 각 구역 첫 위치의 전체 레코드 검사와 전수 prefix 텍스트 검사는 서로 다른 범위입니다.

새 native `hwp5_unselected_field_tests.zig`는 실제 누름틀49개 표본의 연결·원본 불변·전체 할당 실패와 헤더만 다른 지원 필드 종류로 바꾼 `FieldMarkerMismatch` 반례, 수식/미지 필드·제어 거부를 검사합니다. 최신 집중 바이너리 `61c496feabe19fd6efe436558bea7dbb225d815af2ba1be656b505a583fc60df`는2/2·fail/skip/log/leak0·exit0·관측 peak4,096,336바이트입니다. 최초 std.testing allocator 실행은1,445,889,416바이트로 같은1024MiB 한도를 넘어 중단됐습니다. 공통 checked allocator/전체 실패 주입으로 연결한 뒤 실패 인덱스·단언·누수 검사는 유지했으며 이 대조를 제품 메모리 성능 개선으로 해석하지 않습니다.

실제7구역 roadmap의 비대상 숫자 상호참조 보호 회귀도1/1·exit0이며 세 구역×세 명령9요청을 계속 거부하고 원본/빈 undo·redo를 유지합니다. 미지원 상호참조까지 허용한 것이 아닙니다. 정규 HWP5/CFB32파일 회귀는386/386·fail/cancel/skip0·exit0(501605.328291ms), source SHA-256 `12fa85c51845102fdd2753bc3db9a748143e1140a6643e606bf91fa34540fa75`와 WASM hash의 전후 불변을 확인했습니다. 전체 로그는 분리 폴더의 `unselected-fields-registered-32.log`입니다. 이후 상호참조 보호 파일을 후보로 옮겨 별도로1/1 재검증하고 정규 목록에 추가했습니다. 32파일 묶음과 별도1파일의 검증이지 단일33파일 명령의 실행 완료는 아닙니다. 전체 native·모든 명령·실제 브라우저/IME/조판 및 기본 WASM 승격도 별도입니다.


## 원인과 정책

실제 `2025 행정업무운영 편람(최종).hwp`는 14구역이며 2번 구역에 누름틀이 있습니다. 일반 본문 입력 거래가 수정하지 않는 구역에도 일반 구역 검사를 적용하면서, 다른 구역의 정상 입력을 `UnsupportedSectionControl`로 거부했습니다. 이전 metadata 후보에서 실제 0번 구역 입력으로 재현했습니다.

`source_policy.validateUnselectedSection`은 기존 레코드 검사와 필드 연결 검증을 재사용합니다. 수정하지 않는 구역의 정상 이름 필드 보존만 허용하며 수식·미지 제어·미지원 참조를 무조건 허용하지 않습니다. 본문 입력과 두 글자 서식 거래의 비대상 구역 검사에서 사용합니다. 선택한 구역의 필드 입력 정책은 바꾸지 않습니다.

## 후보 검증

후보 `zig-out/verification/unselected-named-fields/bin/hwpjs.wasm`의 SHA-256은 `a2bc4546ef166928f57565a0996a3b9041a41e4013fb0cff0a1ab1f885c1ed36`입니다.

`tests/hwp5/unselected-named-fields.test.mjs`는 실제 누름틀 레코드를 먼저 확인하고 0번 구역에 Unicode prefix를 입력합니다. 독립 CFB.js·레코드 oracle로 수정 구역 전체와 모든 비대상 스트림을 대조하며 원본 바이트 undo, 동일 편집본 redo, 새 editor 재열기와 추가 입력 저장을 검사했습니다. 1/1, skip 0, 종료코드 0입니다. 저장은 명시적 `allowStaleLayout: true`를 사용하므로 원본 조판 동일성 검증이 아닙니다.

포맷 검사와 focused native 테스트는 통과했습니다. root 포함 3/3이며 실제 이름 필드 허용, 수식/미지 제어 거부와 기존 상호참조 13개 라벨 보호를 포함합니다. 전체 native·이 후보의 전수 문단 감사·Worker/Canvas와 전체 글자 서식 명령 검증은 아직 완료되지 않았습니다. 후보를 기본 제품 지원으로 소급하지 않습니다.

후속 전수 감사 `/tmp/hwpjs-unselected-fields-manual-edit.json`은 동일 후보 hash로 10,514문단 중 10,336입력·이력·저장 재열기/독립 텍스트 및 비대상 스트림 검증, 178개 `UnsupportedRangeSemantics` 거부를 기록했습니다. 기존 구역 제어 거부는 해소됐지만 새로 도달한 범위 제한이 남아 있으므로 이 파일의 전체 편집 지원은 미완료입니다. 위의 전수 감사 실행 중 상태는 이 결과로 갱신하며 전체 native·UI 검증은 여전히 남습니다.

## 남은 범위 거부의 조사

독립 레코드 inventory로 178개 거부 위치 모두의 영역 태그를 확인했습니다. 원값별 출현은 `0`:178, `0x0100000e`:20, `0x0100000c`:7, `0x01000015`:9, `0x0100001e`:142입니다. 태그당 출현이므로 합계를 문단 수로 읽지 않습니다. 명세의 문단 영역 태그 표는 시작/끝/종류·데이터를 정의하지만 경계 삽입 affinity는 확정하지 않습니다. 기본 reject와 명시적 half-open의 계약은 [본문 입력 실험](hwp5-plain-text-edit-experiment.md)이 소유합니다.

`tests/hwp5/manual-range-prefix.test.mjs`를 추가했습니다. 감사 JSON의 실패 목록에 의존하지 않고 원본의 모든 비어 있지 않은 영역 태그 레코드를 수집하여 178개를 확인합니다. 기본 거부/원본 불변, 명시적 half-open Unicode 입력, 독립 전체 구역 및 비대상 스트림 비교, 새 editor 재열기, undo/redo를 전부 검사합니다. 현재 실행 중이며 통과나 한컴 의미 일치로 계수하지 않습니다. UI 기본 정책을 임의로 완화하지 않았습니다.

RHWP 참조 revision `e8800c8def63449808a4092798442652ed460552`의 `src/model/paragraph.rs` 삽입 경로는 삽입 UTF16 위치 이상인 range start/end를 각각 이동합니다. 삭제는 뒤 경계를 감소시키고 삭제 내부 경계를 시작점으로 모읍니다. 우리 명시적 half-open의 삽입/삭제 좌표 이동과 같은 방향이지만, RHWP의 해당 삭제 루프에는 축소된 빈 범위를 제거하는 코드가 없고 우리의 `text_ranges.prepare`는 빈 범위를 제거합니다. 이 차이를 무시하고 두 구현이나 한컴 동작이 완전히 동일하다고 주장하지 않습니다. Worker의 HWP5 splice는 전달된 정책을 기존 editor로 위임하지만 HWPX 경로는 reject 외 값을 거부합니다.

178개 전수 회귀는 73.58초 후 종료코드 0·1/1·skip 0으로 완료됐습니다. 위의 실행 중 상태를 갱신합니다. 범위 prefix 좌표/원문 보존 및 이력 검증이며 삭제·범위 내부 치환·구조 분할/병합이나 한컴 동일성 검사는 아닙니다. 이 문서는 아직 공개하지 않은 native 수정 후보의 실측 기록이며 소스·테스트·기본 WASM 배포 완료를 뜻하지 않습니다.

후속 `actual overlapping ranges` 회귀는 실제 1번 구역 104번 문단의 중첩 범위 `[0,71]`·`[3,9]`를 사용해 시작/끝/내부 삽입과 내부/전체/범위 교차 삭제·치환 10조합을 검사했습니다. 독립 전체 구역 및 비대상 스트림 oracle, 잘못된 기대 문자열을 거부하는 부정 대조, 명시적 `SplitSurrogatePair` 거부, 실패 후 redo 보존, 저장 재열기가 1/1·skip 0·종료코드 0입니다. 앞선 prefix 전수 결과와 별도이며 구조 분할/병합·한컴 의미는 미검증입니다.

`tests/hwp5/manual-range-worker.test.mjs`는 같은 실제 문단에서 기본 정책 거부와 명시적 half-open 치환을 Worker 경계로 실행하고 독립 저장 비교·undo 원본 복원·잘못된 정책 거부 뒤 redo 보존을 검사했습니다. 1/1·skip 0·종료코드 0입니다. mock self/fetch 기반 실제 Worker handler 검사이며 실제 Chromium/Canvas·OS 입력 검증이 아닙니다. UI 정책 선택은 아직 연결하지 않았습니다.

후속 UI 작업으로 HWP5 전용 범위 이동 실험 동의 체크박스를 추가했습니다. 기본 꺼짐이며 새 파일에서 초기화하고 편집 준비 전/처리 중/표시 실패/HWPX에서는 비활성화합니다. `range-policy-controls.mjs`는 동의와 현재 문서 상태만 소유하며 기존 editor controls가 일반 splice 요청에만 명시적 정책을 추가합니다. 이미 지정된 정책·저장·서식·구조 명령은 덮어쓰지 않습니다. native 좌표 계산을 복제하지 않습니다. 정책 및 기존 editor controls 10/10·skip 0·종료코드 0, app/editor syntax와 diff whitespace 검사를 통과했습니다. 아직 실제 브라우저 검증·게시 전이며, Canvas의 대상 권한/보호 위치 때문에 범위 문단 직접 입력이 가능하다는 주장은 하지 않습니다. 위의 UI 미연결 상태는 이 부분 연결로 갱신하되 전체 Canvas 지원은 남습니다.

실제 Chromium session `hwpjs-range-consent`·별도 loopback 18483·동일 후보로 편람을 업로드했습니다. 초기 준비 대기와 동의 활성화 대기가 각각 25초 시간 초과했고, 살아 있는 페이지의 status는 `읽는 중`·editor panel hidden·accessible 길이 0을 유지했습니다. network에서 Worker 스크립트 요청을 관측했으며 서버 직접 요청은 HTTP 200·약 1.5ms였습니다. 일부 서식 선택 목록이 생성된 관측만으로 load handler 완료나 옵션 검증 성공을 주장하지 않습니다. 읽기/표시 경계 정체의 원인은 아직 확정하지 않았습니다. 테스트 소유 브라우저와 서버는 종료하며 이 실행을 UI 통과로 계수하지 않습니다.

추가 실제 브라우저 관측에서 Worker가 `load`·10,514문단 응답을 먼저 반환하고 `InvalidNestedTableFlow`가 발생하는 것을 확인했습니다. 오류 정리의 `direct.reset()`이 renderer의 실패한 원래 content를 다시 조판하면서 같은 예외를 던져 상태 갱신까지 중단했습니다. 오류 처리에서 `renderer.clear()`를 먼저 실행하도록 바꾸자 동일 업로드는 즉시 `오류: InvalidNestedTableFlow`를 표시했습니다. 파서 대기나 무한 루프가 아니라 표시 오류와 오류 정리 재진입의 조합입니다.

동일 브라우저의 별도 실제 Worker 응답 그래프를 검사하니 12번 구역의 중첩 표 8개에서 host 문단의 tableCell 소유 연결이 충족되지 않았습니다. tableNode는 449/596/981/1410/1633/1832/2087/3193, hostParagraph는 100/132/220/323/377/426/482/731입니다. 원문 파서 소유권·표시 배열 제한/투영 중 어느 계층에서 연결이 빠지는지는 다음 조사 대상입니다. 검사기를 무조건 통과시키거나 표를 버리지 않았으며, 전체 편람 표시·동의 UI 검증은 여전히 미완료입니다.

원인은 `displayContent`의 텍스트 예산 200,000 UTF16 소진 후 문단 전체를 제외하는 분기였습니다. table bindings/placements는 원문 전체를 유지하므로 뒤 구역의 중첩 host만 사라졌습니다. 텍스트 한도는 유지하면서 최대 20,000문단 내에서 빈 clipped·비편집 문단 식별자를 보존하도록 바꿨습니다. native 문서나 저장 입력을 변경하지 않고 표를 제거하거나 소유권 검사를 완화하지 않았습니다. 문단 개수 한도 초과의 소유권 투영 문제는 별도이며 이 수정으로 전체 큰 문서 지원을 주장하지 않습니다.

`tests/hwp5/bounded-paragraph-identity.test.mjs`와 기존 Canvas preview는 13/13·skip 0·종료코드 0입니다. `tests/hwp5/manual-table-ownership.test.mjs`는 동일 후보의 실제 Worker load에서 10,514개 식별자 보존·텍스트 200,000 이하·전체 중첩 소유권 검사와 문제 8개 host의 정확한 parent/list 연결·clipped/비편집 상태를 확인해 1/1·skip 0·종료코드 0입니다. 실제 Chromium의 수정 후 전체 렌더링/옵션 검증은 다음 gate이며 아직 게시하지 않았습니다.

수정 후 실제 Chromium session `hwpjs-range-final`에서 편람의 `HWP 5.1.1.0 · 10514문단 · 표시 한도` 상태를 확인했습니다. 편집 준비 후 동의 옵션이 활성화됐고 실제 폼에서 1번 구역 104번 문단 `[4,7)`을 `브라우저😀`로 치환하여 명령 완료 및 접근성 텍스트 반영을 관측했습니다. 동의를 끈 동일 요청은 `UnsupportedRangeSemantics`로 거부됐으며 HWPX parashape로 바꾸자 동의가 꺼짐·비활성화됐습니다. 고급 폼 summary가 sticky Canvas에 가려 마우스 클릭은 실패했으므로 키보드 focus/Enter로 폼을 열고 제출했습니다. 이 별도 겹침 문제·Canvas 직접 입력과 실제 다운로드 바이트 검증은 아직 남습니다. 소유 브라우저와 테스트 서버는 종료했습니다.

고급 폼 겹침은 별도 CSS 수정 `4ff367e7`으로 게시했습니다. 닫힌 도움말 summary는 고정 작업 영역보다 앞에서 클릭 가능하게 하고, 하단 details가 펼쳐지면 작업 영역을 일반 흐름으로 전환합니다. 실제 마우스로 편람의 폼을 열고 `마우스검증😀` 치환·접근성 반영을 확인했습니다. 최종 펼침 흐름은 실제 parashape HWP5에서 `workspace: relative`·좌표 겹침 false이며 CSS 계약/기존 controls 10/10 통과했습니다. 정책 체크박스가 화면 아래 도움말에 가려진 때는 페이지 위로 스크롤한 뒤 체크했습니다. 실제 Canvas 입력·다운로드·좁은 화면 전수 검증은 별도이고, 브라우저/서버는 종료했습니다.

동의 UI와 공통 명령 위임은 `1a7a2609`로 게시했습니다. 별도 index에서 app의 documentFormat 전달과 HTML의 체크박스 한 줄만 추출하여 기존 차트 변경을 포함하지 않았으며 사용자 stage도 보존했습니다. 명령 경계 회귀는 실제 editor controls의 Canvas origin splice·처리 중 재요청 거부·실패 후 복구·다음 HWPX 문서의 초기화를 추가해 관련 11/11 통과했습니다. 이는 Canvas 키 입력 E2E나 native 수정 게시를 뜻하지 않습니다. 글꼴/글자 속성 동시 입력은 다른 명령이므로 이 옵션으로 완화하지 않습니다.

후속 실제 Chromium `hwpjs-canvas-range`에서 원본 편람을 열고 범위 동의 후 검색 `‘전자서명’(1999. 8. 7.)`의 유일 결과를 선택했습니다. Canvas input은 `[3,22)`를 선택했고 실제 `keyboard inserttext`로 `캔버스😀`를 입력하여 native 완료·현재 텍스트를 확인했습니다. 조판 경고 동의 후 브라우저 download 명령으로 `/tmp/hwpjs-canvas-range-edited.hwp`를 저장했습니다. 독립 CFB.js/레코드 `verifyRaw`로 수정 구역 전체·비대상 스트림을 대조하고 후보 editor로 새 파일을 재열어 정확 텍스트와 끝 CR 보존을 확인했습니다. 첫 재열기 기대값은 CR을 빠뜨려 실패했으며 원문 CR을 포함한 정확 기대값으로 교정 후 통과했습니다.

최초 다운로드 동의/버튼 클릭은 스크롤된 command bar에서 가려져 실패했습니다. 페이지 위로 스크롤해 동의 상태를 확인하고 download 버튼을 명시적 scrollintoview한 뒤 실제 다운로드가 성공했습니다. 이 경로의 스크롤 접근성 개선과 OS IME·Canvas 삭제/다문단·서식 동시 입력·전체 문서 전수 UI는 여전히 남습니다. 소유 브라우저와 서버를 종료했습니다. 이 검증은 지정 후보를 사용했으며 native 코드 게시나 기본 제품 WASM 승격은 별도입니다.

후속 소스 재검토에서 비대상 구역 검사 연결 실수를 찾았습니다. 기존 후보는 수식 정의에 새 검사를 넣고 글자 모양에는 넣지 않았습니다. 수식 정의 검사를 기존 정책으로 되돌리고 글자 모양 경로에 새 검사를 적용했습니다. 최종 적용 경로는 본문 splice·글자 속성·글자 모양입니다. 수식 정의까지 지원을 확대하지 않습니다.

새 후보 `zig-out/verification/unselected-fields-format/bin/hwpjs.wasm` SHA-256 `e1609e28fdc650a04fcd66fa067ad805d1c72181a8292a01070ed6c35444ee86`의 ReleaseSafe 빌드는 6/6·종료코드 0입니다. 실제 편람의 다른 구역 글자 모양 적용 회귀는 이전 후보에서 `UnsupportedSectionControl`로 재현했고 새 후보에서 독립 비대상 stream·수정 문단 char run ID·undo/redo·재열기를 통과했습니다. 실제 본문/글자 모양·범위 Worker·중첩 소유권 공개 회귀 합계 4/4·skip 0, focused native root 포함 3/3·종료코드 0입니다. 최신 소스의 전체 native gate를 `/tmp/hwpjs-unselected-format-native-full.log`에 별도 시작했으며 이전 source 실행과 구분합니다. native 수정은 아직 미게시입니다.

같은 최종 후보로 편람의 비대상 누름틀을 보존하는 본문·글자 모양·글자 속성 세 회귀를 확대했습니다. 글자 모양은 독립 전체 구역 기대값까지 대조하고, 속성은 DocInfo와 모든 구역·비대상 스트림을 독립 레코드 oracle로 검사했습니다. 잘못된 글자 크기 기대값은 거부되는 부정 대조이며 실제 크기/굵게/기울임·재열기 텍스트·undo/redo·잘못된 요청 후 redo 보존도 검사했습니다. 3/3·skip 0·종료코드 0입니다. 기존 4/4와 중복되는 두 사례를 더해 독립 7개로 계수하지 않습니다. 최신 전체 native 실행은 계속 살아 있으며 완료 판정은 하지 않습니다.

최종 e1609e28 후보의 전체 참조 읽기 `/tmp/hwpjs-unselected-format-reference-read.jsonl`은 종료코드 0입니다. 975경로 중 HWP3 26개 제외, 범위 내 949개 중 HWP5 509/HWPX 435개 읽기 및 입력 불변 검증, 총 690,523문단입니다. 암호 거부 2개와 기존 `SectionCountMismatch` 3개는 성공으로 계수하지 않습니다. 파일별 counts·문단 합계·고유 975경로·후보 파일 hash를 별도로 대조했습니다. 이는 전체 필드·편집·조판 완료 gate가 아니며 전체 편집 감사는 다른 후보로 계속 실행 중입니다.

`tests/hwp5/unselected-cross-reference-gate.test.mjs`는 실제 7구역 roadmap 원본의 0번 구역 상호참조 2개를 독립 관측하고, 참조가 없는 1/5/6번 구역 입력·글자 모양·속성 요청 9개가 비대상 구역 보호 때문에 거부되는지 확인했습니다. 각 거부 후 원문 저장과 빈 undo/redo를 검사했습니다. 기존 상호참조 gate와 합계 2/2·skip 0·종료코드 0입니다. 보존 허용이 미지원 상호참조 해결까지 확대되지 않았다는 반례이며, 이 문서 전체 편집 지원은 여전히 미완료입니다.

오류 정리 순서 수정은 `ee6270bd`로 별도 게시했습니다. 실제 app callback 추출 실행에서 failed content 제거·상태 보고·worker 종료·generation 갱신, 늦은 실패 무시를 확인했고 순서 반전 변이에서는 같은 오류가 보고를 가리는 것을 재현했습니다. startup 회귀와 합계 4/4이며 파서 native 게시와는 구분합니다.

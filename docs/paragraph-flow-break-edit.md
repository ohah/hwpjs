# 명시적 쪽·단 나누기 편집 기반

## 현재 상태: 양 형식 native·WASM·Worker·Canvas 구현

전체 root 바이너리 빌드·후보 교체·현재 실행 상태와 소스 고정 범위는 [전체 native 기록](native-current-main-gate.md)의 명시적 나누기 후보 항목이 소유합니다. 실행 중인 검사를 완료로 계수하지 않습니다.

쪽/단 명령을 일반 Enter 분할로 대체하지 않습니다. HWP5/HWPX native 단일 명령·저장·이력, optional WASM/JS API, Worker·Canvas capability와 키 입력을 구현했습니다. 메뉴/명령 검색/삽입 리본의 계약과 최신 전체 공개 회귀·실제 브라우저·재빌드 검증은 [쪽·단 UI](paragraph-break-menu.md)가 소유합니다. native 전수 실행의 선택형 skip과 별도 실행 범위는 위 native 기록을 따르며 단일 무skip gate 통과로 바꾸지 않습니다. 구형 ABI에서는 미지원 안내/비활성화를 유지하고 기본 WASM 승격은 별도입니다. 아래 실제 페이지 배치 반례도 수정했지만 전체 fixture/원본 한글 조판 동치 완료로 확대하지 않습니다.

현재 대상은 기존 분할이 가능한 top-level 본문 문단입니다. 표 셀 등 nested owner는 `UnsupportedParagraphBreakOwner`로 원본/이력을 보존합니다. 모든 표·필드·그림·주석 및 페이지 조판 지원으로 확대하지 않습니다.

HWPX `Session.splitParagraphWithBreak`와 History의 `.split` + `break_before`는 선택 삭제·분할·나누기 설정을 기존 draft의 저장 검증 이전에 한 번 적용합니다. 일반 split/canSplit/anchored split은 기존 동작을 유지합니다. `History.applyBatch`는 다른 command kind의 나누기 필드를 게시 전에 거부하며, 잘못된 추가 입력도 기존 split 계약으로 거부합니다. top-level owner·현재 draft의 오른쪽 generated ID를 확인하고 미지원 덧말 변경 상태는 보존 거부합니다. 현재 작업 트리의 기존 사용자 host-position 정책 변경은 보존했고, 분리 사본 검사는 게시된 기존 정책에 새 경로만 추가했습니다.

## SSOT와 거래

`model/paragraph_break.zig`는 의미상 page/column 종류만 소유하고 포맷별 비트나 XML 속성을 갖지 않습니다. HWP5 `Paragraph.break_before`는 새 continuation의 현재 편집 의도이며 불변 source 헤더 복사본이 아닙니다. 생성 문단의 기존 나누기 플래그는 여전히 복제하지 않습니다. 후속 일반 분할은 오른쪽 continuation의 의도를 초기화하고 왼쪽의 기존 의도는 유지합니다.

HWP5 `paragraph_breaks.current`가 명세 표59의 page0x04/column0x08 매핑을 한 번 소유하고 생성 문단 writer와 현재 flow getter가 공유합니다. 원본 문단에 위조한 의도는 거부하며 원본 unknown 비트는 무변경 경로에서 보존합니다. `structure_session.Split`의 선택 범위 삭제·분할·의도 설정·전체 Section 직렬화 검증은 한 draft 안에서 수행하고 기존 swap/History 경계로 한 번 commit합니다. UI의 split 다음 별도 setter 호출은 없습니다.

기존 model clone의 scalar 복사, reflection equality, checkpoint의 Paragraph 크기 계산을 재사용합니다. 별도 raw 캐시·JS 역명령·중복 이력 상태는 추가하지 않습니다. 후속 HWPX는 같은 의미 종류를 사용하되 속성 직렬화·현재 flow 조회·모든 split/merge adapter의 보존을 별도로 검증해야 합니다.

HWPX `paragraph_structure_values.Paragraph.break_before`도 같은 의미 종류를 사용하며 소유 clone이 복사합니다. `paragraph_flow_break_save`가 page/column의 두 boolean 투영을 단독 소유하고 flow getter와 저장이 공유합니다. 구조 writer의 모든 조립 분기 뒤 한 번 적용하므로 필드/수식 serializer마다 플래그 쓰기를 복제하지 않습니다. 현재 generated ID를 namespace-aware 문단에 대응하고 원본 ID 충돌·중복·누락·nested owner를 거부합니다. 무의도 경로는 추가 XML 파싱 없이 기존 출력 소유권을 그대로 반환합니다. 일반/Joined 분할·병합의 왼쪽 값은 보존하며 새 오른쪽은 null입니다. 아래 다단 그룹 재구성의 수동 복사 누락도 수정했으며 다른 조합의 전수 보존 검사는 계속 필요합니다.

## 검증 이력

### Zig0.17 형식 정리 후 제품 확인

격리 소스의 형식 검사에서 기존 `hwp5_edit.zig`의 enum 변환6곳만0.17 fmt 구문으로 갱신이 필요했습니다. HEAD에도 같은 구문이 있었고 주 작업본에는 이미 갱신돼 있음을 확인해 그 변환만 반영했습니다. `publish-zig-fmt-retry.log/.stderr`는 변경/추가 Zig36파일·exit0·stderr0입니다. 다른 사용자 API 변경은 채택하지 않았습니다.

`publish-formatted-product-build.log/.stderr`의 ReleaseSafe 빌드는exit0·stderr0이며 `/tmp/hwpjs-flow-publish.3IvUJZ/formatted-install/bin/hwpjs.wasm` SHA256은 `0619a0fea08941e6bd1548bb93ef4292d3328fbcf01e5b34dc912fdd974d27ca`입니다. 두 artifact를 먼저 WebAssembly.Module로 검증한 뒤 binary section 경계/길이를 순회해 custom 이외 전체 바이트를 비교했습니다. a754와0619의 runtime bytes는 같고 SHA256은 `a560e12bc61d6e13633fd8523edf403afc629964637296737c4e7f57ec2f4742`이며 다른 섹션은.debug_info/.debug_line뿐입니다. 증거 `publish-formatted-runtime-parity.json`의 SHA256은 `e4e6e72fdb7af79ca07603b2a0ac989c4f808e5564be268e54e1617e596bbd25`입니다. artifact 전체 hash가 같다는 주장은 아닙니다.

0619 제품으로 쪽/단·다단·후속입력·Worker owner·글꼴·암호7파일을 직접 검사했습니다. 최초37pass/3skip을 보존하고, 선택 ABI 부재3건에는 정확한 export명 helper로 metrics/metadata 함수3개만 제거한 검사용5607b7f9 파일을 제공해 재실행했습니다. 이는 과거 릴리즈 자체가 아니라 ABI 부재 파생 fixture입니다. `publish-formatted-focused-complete.log/.stderr`는40/40·fail/cancel/skip0·exit0·stderr0이며 로그 SHA256은 `7c42d4f245066aef1c276bd78158cacf64f20184801fb7dfecf954cbe38dc2ec`입니다. 진행 중 HWPX 전체 검사는 a754 제품이고 기본 WASM/외부 서버는 바꾸지 않았습니다.


### 최신 owner 수정 제품의 실제 브라우저 재검증

agent-browser 스킬의 기존 loopback 전용 감사로 a754 제품을 다시 검사했습니다. `publish-owner-browser.log/.stderr`는exit0·stderr0이며 로그 SHA256은 `eaea479a98462b823e162dcdc23e4c1917c092a746d61c3d6402694e75ebb0d5`입니다. 실제 charshape HWP5/HWPX × 쪽/단4경로에서 신뢰된 키 입력·정확한 Worker splitTarget·1→2측정페이지·실행 취소/다시 실행·독립 Section/XML/ZIP·실제 다운로드 재업로드가 모두 성공했습니다. HWP5-page와HWPX-column PNG도 직접 확인했습니다.

최종cleanup은 browserClosed/serverExited/success가 모두true이며 추가 session info에서 `hwpjs-flow-break-aa19183e3d39`가active=false/pid=null,58879 listener 없음도 확인했습니다. 이는 charshape4경로의 최신 제품 브라우저 증거이고, 중첩 headerfooter owner의 실제 키 입력·다단 그룹·Mac Cmd/OS IME·원본 조판 전체 동치까지 증명하지 않습니다. headerfooter owner는 위 native/공개 Worker·독립 XML 검사 범위를 유지합니다.


### 독립 owner XML 검증과 수정 후 전체 바이너리

공통 ZIP 봉투 `hwpx_numeric_package.expectation`과 기존 구조 기대값 비교기를 재사용한 `hwpx-flow-owner-oracle.py`를 추가했습니다. 실제 새 WASM의 headerfooter 저장본은 기존 기대값 비교기로2/2 실패했습니다. 차이의 첫 위치는 `section/1:p/0:run/0:ctrl/0:header/0:subList/0:p child count: 1 != 2`였습니다. 기존 비교기의 `paragraph.iter()`가 소유 본문과 nested p를 구분하지 않아, 기대값에서 nested 텍스트/lineseg까지 지운 것이 원인입니다. 제품 바이트를 허용 목록으로 삭제하지 않고 공통 비교기의 순회를 현재 문단 소유 노드로 제한했습니다.

공통 비교기 self-test는 일반/중첩 정상 분할과8개 변조 거부를 Python normal/-O 모두 확인합니다. 새 nested 반례는 머리말 텍스트·nested lineseg·nested ID 변조를 포함합니다. 새 owner oracle도 두 종류의 나누기·반대 종류 기대값 거부를 normal/-O에서 검사합니다. `publish-owner-oracle-fixed.log/.stderr`는 기존 공개 저장/Worker까지20/20·skip0·exit0이며 로그 SHA256은 `99f2cc4e3d1b48db212bb4bb1cf0f45683b6ca9a8a32f13b411b253e749467bd`입니다. 공통 비교기 소스 SHA256은 `b61188b5be4b22e2b0a61a5b5ecc4e452fd49a94ef5f73b164b865fc0ed2387f`입니다. 실행 중101파일 검사는 이 수정 이전에 시작됐으므로 최종 게시 gate에서는 고정된 최종 도구/103파일로 다시 검사해야 합니다.

수정 후 `owner-native-safe` 전체 root 빌드는exit0·stderr0이며 SHA256 `4c18b79568062a45b5c66b3d99582bbe41d9ec369c3000ad3bc986dccfee2b89`입니다. 표준 runner metadata는4,137개를 반환했습니다. 이 실제 전체 바이너리의864..865 새 owner 회귀1/1,2478..2480 기존 두 실패2/2가 각각 range-complete·skip0·logs0·leaks0·exit0입니다. 두 JSONL SHA256은 각각 `c92ed6d60057d05fdd104f416e76ac0ecac25e6ce56a908309f5b70f7a0111f3`, `f092caea572db44863ed973ca0f4cb9238acbdc26942e588cff9865332999dc0`입니다. 전체4,137개 실행 완료로 합산하지 않습니다.


### 중첩 owner 수정의 새 제품 검증

ReleaseSafe 제품 재빌드 `publish-owner-product-build.log/.stderr`는exit0·stderr0입니다. 산출물은 `/tmp/hwpjs-flow-publish.3IvUJZ/owner-fixed-install/bin/hwpjs.wasm`, SHA256 `a7545f5fb8a4b26479a294ac57fb55b7f17de6c4e9b6709a100a790f2baa48f9`입니다. 이전 fcf3와 다르므로 이전 전체 gate를 이 제품의 성공으로 소급하지 않습니다.

새 `paragraph-break-owner-worker.test.mjs`의 실제 headerfooter × 쪽/단2경로는 이전 fcf3에서0/2·SourceBindingMismatch·exit1(`publish-owner-worker-red.log`, SHA256 `675d2e07e3d210b040891b9244cab6a4a818baeae778bb05f396dde094f5e929`)로 재현했습니다. 새 a754에서는 두 경로가 성공하며 UI 응답의 splitTarget이 nested header를 건너 실제 오른쪽 body를 가리키는지, 기존 편집한 머리/꼬리 텍스트·플래그·Undo/Redo 저장 bytes·재업로드 텍스트를 공통 Worker/Canvas 모사 harness로 확인합니다. 실제 브라우저 증거와 구분합니다.

같은 제품의20파일 결합 `publish-owner-fixed-regression.log/.stderr`는320/320·fail0·skip0·exit0·stderr0이며 로그 SHA256은 `8b3dbba5fa114ee80e1818def7a5db9c2f5234acc55e885c740fba204aa3b0bc`입니다. 새 owner Worker2건·후속입력8건·기존 쪽/단/다단/API/Canvas/구조/이력/Worker를 포함합니다. 새 Worker 회귀도 build 등록 목록에 추가해 다음 전체 공개 gate는103파일입니다. 현재 진행 중인101파일/fcf3 gate와 전체 native/carry 바이너리는 이전 고정 산출물로 계속해 추가 반례를 찾으며, 이번 수정 후 전체 완료 증거가 아닙니다. 기본 WASM과 외부 서버는 변경하지 않았습니다.


후속 owner 전용 probe `publish-flow-owner-safe.log/.stderr`는2/2·exit0이며 stderr SHA256은 `6449a086967b71e748537ad056d5172aeeb33a838f1d9f754377267ad5899aba`입니다. 실제 headerfooter의 편집된 nested body를 둔 채 쪽/단 두 종류를 지정해 새 sibling의 정확한 ID 귀속·body host·재열기·전체 문단 텍스트·한 번의 Undo/Redo 바이트를 확인했습니다. 새 native owner 회귀는 root에, 새8경로 JS 회귀는 build.zig 목록에 등록했습니다. 이후 공개 gate 목록은102파일이며 이미 실행 중인101파일 검사의 범위를 소급 확장하지 않습니다.


### 전체 native에서 발견한 중첩 owner 회귀

수정 전 고정 carry 전체 검사에서 index2477/2478의 기존 머리말·꼬리말 분할2건이status1로 실패했습니다. 전체 검사는 그 바이너리 그대로 계속하며 후속 실패도 수집합니다. 게시 사본의 별도 root filter 실행 `publish-header-footer-focused.stderr`도1pass/2fail·exit1·`SourceBindingMismatch`로 재현했습니다(SHA256 `2e7d3cae7e1376a9a493b630102eabb66f5c123f145dada37896a116e618712c`). 새 나누기 처리에서 추가한 `selected_index + 1` 검사가 일반 split에도 적용돼, 머리말·꼬리말 descendant가 왼쪽 본문과 새 오른쪽 sibling 사이에 있는 정상 배열을 거부한 회귀입니다.

`paragraph_split_session`은 새 ID가 정확히 한 번 존재하고 왼쪽 뒤에 있는지 확인해 그 실제 행에 의도를 적용하도록 수정했습니다. 추가 할당·원본 캐시·다른 일반 분할 경로는 만들지 않았습니다. 같은 기존 두 검사와root를 재실행한 `publish-header-footer-fixed.log/.stderr`는3/3·exit0이며 전수 할당 실패 단언도 그대로입니다(stderr SHA256 `138e07b6391d27427f830229a5da6b3b836832437f1f3c8bf7b8798fa0ff1263`). 수정 소스는 이전 fcf3 WASM/실행 중 고정 carry 바이너리에 아직 반영되지 않았으므로 그 전체 결과를 수정 후 전체 성공으로 읽지 않습니다.

별도 `paragraph-break-followup.test.mjs`는 양 형식×쪽/단×일반 재분할 여부8경로에서 실제 생성 문단 후속 문자열/emoji 입력·병합·플래그·정확한 Undo/Redo 저장 바이트·재열기 텍스트를 확인했습니다. fcf3 후보의 `publish-flow-followup-text.log/.stderr`는8/8·skip0·exit0이며 로그 SHA256은 `5b7ffa613a8045fe62ddcedfb6a7888b29d863b9e8c4222fce547aeedb06d306`입니다. 이는 새 sibling-ID 수정의 제품 WASM 검사가 아니고, 실행 중101파일 gate에도 이 새 파일은 아직 포함하지 않았습니다. 추가 owner 전용 native 회귀는 별도 probe로 검증합니다.


### 문서 진입점과 기존 누락 구분

문단 구조 문서의 과거 `HWPX/ABI/UI 미연결` 요약을 현재 양 형식 로컬 후보 연결 상태로 정정하고 `hwp5-modules.md`에 이 주제를 연결했습니다. 분리 작업본 `publish-doc-tests.log/.stderr`는 문서 검사 도구2/2·exit0입니다. 실제 `publish-doc-links.log`는823문서/3570링크 중2개 누락을 보고했습니다: `docs/find-menu-command.md`의 `canvas-text-search.md`, `docs/hwpx-unmatched-field-exterior.md`의 미게시 테스트 파일입니다. 두 참조가 모두 HEAD 원문에 존재하고 대상은 HEAD 미등록인 것을 확인했습니다. 별도 사용자 문서/테스트를 자동 채택하거나 이 기존 누락을 본 기능 통과로 숨기지 않습니다. 링크 검사 자체는exit1이고 문서 전체 정상 판정이 아닙니다.

기존 문서 검토 manifest 조회는822추적/575현재 일치/229pending/18stale/미등록1입니다. 새 변경으로 기존 검토 hash가 달라질 수 있으므로 이 수치를 전체 기능 구현률로 읽거나 검토 manifest를 기계적으로 갱신하지 않습니다.


전체 gate 첫 실행은21초 후status1/signal null로 종료됐습니다(565건 중490pass/58fail/17skip). 57건의 명시적 ENOENT와 revision-sign-negative 파일 초기화 실패1건 모두 분리 checkout에 없는 `reference/rhwp/samples` 입력 경로가 원인입니다. 이 결과를 제품 성공으로 계수하지 않습니다. 기존 원본 samples 디렉터리를 참조 경로에 연결한 뒤 동일101파일·동일 fcf3 제품으로 `publish-full-hwp5-tap-retry.log/.stderr` 재실행을 시작했으며, 완료 여부는 그 최종 행으로만 판단합니다.


### 기존 Worker와 등록 공개 gate 확장

`reader-worker.test.mjs`의 기존 구형 ABI 모사에서도 같은 `hwp5_edit_split` prefix 오인식을 실제 재현했습니다(`publish-existing-worker.log`:4통과/1실패). 정확한 이름 helper로 교체한 `publish-existing-worker-retry.log/.stderr`는5/5·fail0·skip0·exit0이며 로그 SHA256은 `8b20c2964e7f6517f9212cdd9b8cd506ab8afb4898129c3e2ff2633b2ef7505b`입니다. 주 작업본의 기존 Worker projection 사용자 변경은 유지하고, 게시 분리 사본에는 이 helper 변경만 넣었습니다.

동일 fcf3 제품으로 build.zig의 `editor_api_tests`에 등록된101파일 전체를 중복 없이 추출해 직렬 TAP 검사를 시작했습니다. `publish-full-hwp5-tap.log/.stderr`가 시작 목록·최종 child status/signal을 소유하며 아직 최종 완료로 계수하지 않습니다. 새 checkout 내부 zig-out에는 이 제품의 검증 사본만 두었고 주 작업본 기본 WASM/외부 서버는 바꾸지 않았습니다.


### 기존 구조·이력 회귀의 검사 경계 수정

새 fcf3 제품으로 구조·열·host·HWP5/HWPX 이력·거부·생성 표·그림 owner8파일을 검사한 초기 `publish-existing-structure.log`는22통과/2실패였습니다. HWP5 구형 ABI 모사는 `hwp5_edit_split`의 바이트 prefix만 검색해 새 `hwp5_edit_split_with_break`를 잘못 변경했습니다. 기존 정확한 export명 helper를 재사용하도록 수정했습니다. HWPX 이력 파일은 기본 WASM만 읽어 새 checkout에서 실패했으므로 명시한 `HWPJS_TEST_WASM`을 우선합니다. 주 작업본에 이미 있던 HWPX historyRevision 관련 사용자 변경은 이 검사에 가져오지 않았습니다.

`publish-existing-structure-retry.log/.stderr`는26/26·fail0·skip0·exit0·stderr0이며 로그 SHA256은 `d38925c1d8a13d304b85694063682931f7394314fb621575bc8dca3ec15bf217`입니다. 앞선279건과 다른8파일이며 전체 native·전체 공개 API 완료로 확대하지 않습니다.


### 분리 작업본의 새 제품 산출물 검증

같은 HEAD 기반 작업본에서 `nice -n 10 mise exec -- zig build -Doptimize=ReleaseSafe --prefix /tmp/hwpjs-flow-publish.3IvUJZ/publish-install`을 완료했습니다(exit0·stderr0). 새 WASM SHA256은 `fcf3e9e69b2ea4181f8fd74ba8b4bd9040c4e026c48647a9aada7db835bac53d`입니다. 이 산출물로9파일을 재실행한 `publish-built-feature-js.log/.stderr`는279/279·fail0·skip0·exit0·stderr0이며 로그 SHA256은 `a78b832de29282ab700ef1f6a67d7e951df45230a5c8714d0e3c8677798ee0f0`입니다.

agent-browser 실제 검사 `publish-browser.log/.stderr`도exit0·stderr0이며 로그 SHA256은 `8fe3fe373691d9a09605206ac4fc094d08a77b2f57e53efa751048bcc8305303`입니다. HWP5/HWPX × 쪽/단4경로에서 신뢰된 Ctrl+Enter/Ctrl+Shift+Enter, Worker 좌표,1→2측정페이지, 실행 취소/다시 실행, 독립 Section/XML/ZIP 비교와 실제 다운로드 재업로드를 검사했습니다. `hwpjs-flow-break-aa19183e3d39` 세션·전용 서버의 종료가cleanup행에서 모두 확인됐고 HWPX 단 나누기 PNG를 직접 확인했습니다. Mac Cmd/IME·다단 그룹 브라우저·전체 fixture 조판 동치 증거는 아닙니다. 기본 WASM/외부 서버는 변경하지 않았습니다.


### 게시 기반 의존성 재검증

`/tmp/hwpjs-flow-publish.3IvUJZ`의 HEAD `00febe84` 기반 분리 작업본에서 새 공개 API·Worker·Canvas·다단 회귀9파일을 실행했습니다. 초기279건 중8실패는 Git 미등록 `hwpx-structure-save-oracle.py` 의존성6건과 기본 WASM 경로 의존성2건이었습니다. 독립 XML 비교 도구를 게시 검증 목록에 명시적으로 포함하고, 구형 ABI 검사는 명시한 후보에서 해당 export를 제거해 수행하도록 수정했습니다. 기본 WASM이 없는 새 checkout도 같은 경계를 검증합니다.

재실행 `publish-feature-js-retry.log/.stderr`는279/279·fail0·skip0·exit0·stderr0입니다. 로그 SHA256은 `99e9d90a78793ee099883f9ebfdfdb044fb9f2572bb149d507a02f54103640ae`이며 사용 WASM은 d56b7d4c 후보입니다. XML 비교 도구의 별도 self-test는 정상 분할과5개 변조 거부를 통과했습니다. 이는 분리된 JS 연결과 저장 검증 결과이며, 새 checkout 제품 빌드·전체 native·실제 브라우저 재검증은 별도입니다.


### 다단 그룹의 현재 나누기 값 보존

기존6b4e WASM에서 실제 `multicolumns.hwpx`의 source 병합→쪽 나누기 분할→생성 continuation에 다음 source 병합 순서를 수행하면 page_break=true가 false로 바뀌는 것을 공개 API로 재현했습니다. `tests/hwp5/paragraph-break-column-editor.test.mjs`의 실파일2종×쪽/단×연장/같은 그룹 재병합8조합도 기존 후보에서 모두 실패했습니다. 따라서 앞선 단순4조합/291개 통과를 모든 편집 순서의 완성으로 사용하지 않습니다.

원인은 `column_boundary_group_extend`와 `column_boundary_groups_merge`가 재구성한 문단의 현재 paragraph_shape_id만 복원하고 break_before를 빠뜨린 것, `column_boundary_joined_merge`가 left clone 대신 만든 새 row에서 같은 값을 빠뜨린 것입니다. 기존 현재값 복원 지점에서 같은 원본 row의 의미값을 함께 복사했습니다. 새 원문 캐시·format 비트 재해석·JS 역명령은 추가하지 않습니다. 병합되는 오른쪽 경계는 제거하되 남는 왼쪽 및 비대상 오른쪽 continuation의 경계는 보존합니다.

별도 `/tmp/hwpjs-flow-carry.yhoy68`의 `flow-carry-red.log/.stderr`는1통과(root)/2실패로 native 반례를 재현했고, 수정 후 `flow-carry-safe.log/.stderr`는3/3·exit0입니다. stderr SHA256은 각각 `65e853778e3c82140fe4e615c6710986cb756ea0e7b210eb64ba3edb28e78411`, `2266f75f358a33f4ae45c9f9f6a9d7676808ea87aec050f416418c947005de1c`입니다. 실제 다단2종×쪽/단×두 병합 경로8조합과 합성 양쪽 그룹2조합, 저장 재열기·generated ID 유지·정확한 Undo/Redo·원본 불변을 확인했습니다. 이 단계의3/3은 native 집중 결과이며 제품 후보의 공개8조합 및 전체 검증과 구분합니다. 원래 진행하던 전수 검사는 source superseded로 중단해 기록을 보존했고 최신 바이너리로 갱신합니다.

수정 제품의 `carry-product-build.log/.stderr`는 ReleaseSafe5/5·exit0입니다. `/tmp/hwpjs-flow-carry.yhoy68/corrected-install/bin/hwpjs.wasm`의 SHA256은 `d56b7d4c740de8dbeea1aabe5fec16a3cbc6f65a98406a592621d1b40ae408ad`입니다. 기존6b4e에서 실패했던 공개8조합도 이 후보에서는 모두 통과했습니다. 함께 실행한 `carry-public-regression.log/.stderr`는299/299·skip0·exit0·stderr0이며 로그 SHA256은 `57b2bc8c6a8ab5df2e30aaba8ee63c58d4a752f6bb36a049a8b76901a4399422`입니다. 기존291개와 새8개를 같은 수정 후보에서 재실행한 결과이며 이전 후보 결과를 합산하지 않습니다. 현재 UI4조합 브라우저 증거는6b4e 시점이고 d56b 후보의 브라우저 재검증·전체 native/reader 종료는 아직 남아 있습니다.

## 집중 검증

사용자 작업 트리의 reserved-ID 변경을 포함하지 않은 main 기반 분리 사본 `/tmp/hwpjs-task1749-ranges.9Y1P1R`에서 Zig0.17·ReleaseSafe의 `paragraph_break_session_probe.zig`를 실행했습니다. `explicit-flow-break-final.log/.stderr`와 명시적 binary 생성 실행 `explicit-flow-break-binary.log/.stderr`는 각각5/5(root 포함)·exit0입니다. 의미 검사는 쪽/단 각각의 좌우 UTF16·CR 보존, 현재 플래그/저장 재열기, 한 번 undo/redo, 후속 일반 분할/병합의 정확한 저장 상태 복원, nested owner 거부와 빈 이력, 선택 삭제+분할의 모든 할당 실패·기존 redo 보존을 포함합니다. 공통 실패 주입 helper의 명시적 leak 검사를 유지했습니다.

최종 stderr SHA256은 `087ea6e6362f0930e9dbd82f8da247d9fe4578c7b6b789c5c67525e3aa92a990`, host binary `explicit-flow-break-native-safe`는 `09c855037724ba1f3a76047c01c9bcf59374680e967013f76b2ed2a0d5acdbbd`입니다. 후속 Debug/Fast도 각각5/5·exit0이며 `explicit-flow-break-debug.log/.stderr`, `explicit-flow-break-fast.log/.stderr`로 구분합니다. 각 binary SHA256은 `a558a1a22b9ba525b38cd923417b626c50cbe05714975899e8420e0338001122`, `6d121b20ff84de638402f91bfb83300d4ed2ccf5453c147df94b30b02fcee4a4`입니다. 기존9e75 WASM이나 전체 native 결과와 합산하지 않습니다. 전체 구조 회귀·독립 전체 바이너리 oracle·새 WASM/브라우저·HWPX 편집 연결·한글 페이지 동치는 아직 완료 증거가 없습니다.

## HWPX 속성 writer 기반

`hwpx/xml_boolean_attributes_write.zig`는 의미 정책 없이 선택한 비접두 boolean 속성만 변경·추가합니다. 기존 값이 같으면 entity/true/false 표기를 유지하고 변경 시 따옴표를 보존합니다. 누락된 여러 속성은 하나의 삽입 span으로 합쳐 중복 span을 만들지 않습니다. namespace 속성·알 수 없는 속성·나머지 원본 바이트는 유지하고, 잘못된 boolean은 오류로 반환합니다. 생성 문자열만 기존 source writer의 serializer 경계로 전달하며 사용자 문자열을 trusted XML로 받지 않습니다.

같은 분리 사본의 `boolean-attributes-safe.log/.stderr`, `boolean-attributes-debug.log/.stderr`, `boolean-attributes-fast.log/.stderr`는 각각4/4(root 포함)·exit0입니다. 정확한 길이 예산/1바이트 부족, 빈 요소와 일반 시작 태그, namespace 동명 속성, entity 무변경, 혼합 추가/치환, start-tag 검증 후 전체 XML 재열기, 잘못된 값 거부, 모든 할당 실패와 누수를 검사합니다. 정규 root 테스트에 import했으나 전체 root 실행 결과는 아직 없습니다. 이 writer 자체는 HWPX 쪽·단 나누기의 Session/History/저장 연결 완료가 아닙니다.

## HWPX 저장·재열기와 반복 분할 반례

### Worker·Canvas 명령 경계

`paragraph-split-command.mjs`는 Worker의 `kind:"split"`과 별개인 `breakBefore:"page"|"column"`을 검증합니다. 속성 부재만 일반 split이고, undefined/null/잘못된 문자열·merge에 첨부한 intent·anchored와의 혼용은 거부합니다. HWPX의 UI0-based→native1-based 변환은 기존 Worker 위치에서 한 번만 수행합니다. enable 응답의 `paragraphBreakAvailable`은 실제 optional export 지원값입니다.

`paragraph-break-shortcut.mjs`는 Alt 없이 Ctrl/Meta 중 정확히 하나인 Enter만 쪽, 여기에 Shift가 있으면 단으로 해석합니다. Canvas는 capability가 정확히 true일 때 기존 split 거래에 intent를 붙이고, 일반 Enter·Shift Enter·생성 셀·대기 입력·다중 문단 거부 경계를 공유합니다. 문서 reset은 capability를 지우며 같은 문서의 이력 선택 복구 경로만 기존 값을 보존합니다. 포맷별 native 플래그를 Canvas가 재구현하지 않습니다.

`flow-break-worker-final.log/.stderr`는 helper 포함10/10·exit0·stderr0이며 로그 SHA256은 `d9590abc6ed09937fb42a8ea46864e773713f51a172a223cc6073df009fa1b44`입니다. 실제 양 형식 쪽/단·독립 Section/XML/ZIP·이력/재열기·구형 capability·잘못된 intent와 redo 보존을 검사했습니다. 최초 `flow-break-worker.log`는8통과/2실패였고 HWP5의 기존 `LayoutReflowRequired` 저장 동의를 테스트가 빠뜨린 원인이었습니다. 모든 저장 응답에 오류 없음/Uint8Array를 요구하고 재조판 전 저장 동의를 명시하여, undefined끼리 비교해 통과하지 않게 보강했습니다. 제품 동의 정책은 변경하지 않았습니다.

`flow-break-canvas.log/.stderr`는239/239·exit0·stderr0입니다. 로그 SHA256은 `8842cbc6a46a63c950740ec0665c6a8a3f9f18dc0f59d8e6ba26753fba5cd6d9`입니다. Ctrl/Meta 쪽·단 네 조합의 선택 삭제 범위·native 헤더·한 번 undo/redo와 reset/Alt/동시 Ctrl+Meta 거부, 기존 Canvas 회귀를 포함합니다.

### 실제 브라우저 왕복과 배치 제한

동일6b4e 후보에서 `flow-break-browser-retry.log/.stderr`는4조합(HWP5/HWPX × 쪽/단)·exit0·stderr0으로 완료했습니다. 로그 SHA256은 `ef6f32bf7838070e4b02c9b1fe17da64595fb3bececa4ae83e076c74b9722236`입니다. 신뢰된 Ctrl+Enter/Ctrl+Shift+Enter·정확한 Worker 좌표/intent·native splitTarget·실제 Undo/Redo 버튼·다운로드·독립 전체 Section/XML/비대상 ZIP 대조·재업로드를 검사했습니다. 실제 Meta 키/IME·여러 문단 선택·전체 fixture UI 검증으로 확대하지 않습니다. 선택 UI/JS 소스 해시와 후보 해시는 시작/끝 동일성을 확인했습니다.

수정 전 결과/캡처는 `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-flow-break-browser-FSJ32U`에 있습니다. `hwp5-page.png`와 `hwpx-column.png`를 직접 확인했으며, 당시 편집·저장은 성공하지만 각각 `IncompleteHwp5ColumnFlow`, `UnsupportedPageFlow` 경고로 논리 미리보기를 표시했습니다. 후속 입력 전후 비교 `flow-break-browser-layout.log`는 입력 전1페이지, HWP5 쪽/단과 HWPX 단 입력 후 논리 fallback, HWPX 쪽 입력 후2페이지임을 확인했습니다. 기존 제한으로 뭉뚱그리지 않고 아래 두 원인을 수정했습니다.

최초 `flow-break-browser.log/.stderr`는 대상 검색을 잘못 고정해 HWP5의 보호 표식 포함 문단을 선택한 뒤 assertion 실패했습니다. source native1번의 실제 텍스트 `기울임진하게`와 HWPX native1/UI0번의 `가`로 검색을 구분해 재실행했습니다. 두 실행 모두 owned 브라우저/서버를 종료했습니다. 최종 `hwpjs-flow-break-35c54947528a`는 active=false/pid=null, loopback58879 listener 부재를 별도로 확인했습니다. 기본 WASM 교체·기존 외부 서버 재시작/승격은 하지 않았습니다.

### 실제 배치 반례의 원인·수정

HWP5 `decodeHwp5ParagraphFlow`는 기존 generated 문단의 break_flags가 항상0이라는 불변식 때문에 native4/8을 `InvalidHwp5ParagraphFlow`로 거부했습니다. Worker는 이를 flowSourceErrors에 기록하고 현재 flow 전체를 투영하지 못했습니다. source 원값의 모든8비트는 계속 보존하고, generated는0/4/8만 허용하며4/8은 top-level body로 제한합니다. section/multicolumn/혼합 플래그 및 nested owner를 무작정 허용하지 않습니다.

공통 `paginateBodyRows`는 고정 다단 option이 없으면 column_break를 항상 거부했습니다. 수정은 해당 flow가 single_column=true이고 count1의 선언을 기존 `columnReferenceBoxes`로 검증했으며 실제 x/y/width/height가 기본 본문 전체와 정확히 일치하는 경우에만 다음 페이지 진행을 허용합니다. 선언 누락·두 열·잘못된 gap·유효하지만 더 좁은 단일 열은 거부하며 기본값을 추측해 선언을 합성하지 않습니다.

`flow-break-layout-red.log`는 새 반례2건 실패를 보였고, 최종 `flow-break-layout-separated.log/.stderr`는22/22·exit0입니다. 로그 SHA256은 `a9e02604043589aa265837d78cfa8a7d0841eb11179d23f7e968f38641e5ccb6`입니다. generated256개 비트값과 nested 거부·유효/무효 단일 열은 별도 소유 `tests/hwp5/paragraph-break-layout.test.mjs`에 두고, 기존 사용자 untracked wire/page-row 테스트에는 새 검사를 남기지 않았습니다. 기존 wire/page-row 회귀는 그대로 함께 실행했습니다.

수정 후 `flow-break-browser-layout-fixed.log/.stderr`는 네 조합 모두 입력 전1페이지→입력 후2페이지 assertion, 실제 키 입력·이력·독립 저장·재업로드·종료까지 exit0·stderr0입니다. 로그 SHA256은 `485acaeba42e2ffb7924512e0f4ace7a0802258a80fdb6b00ee49558d76f6066`입니다. 캡처 `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-flow-break-browser-ws3eVs`의 HWP5 쪽/HWPX 단을 직접 확인했습니다. decoder/페이지 배치 소스 해시도 browser 감사에 추가했습니다. 종료 뒤 동일 세션 inactive/pid=null·58879 미수신을 확인했습니다. 이는 측정 배치이지 원본 한글과의 페이지 동치 증거는 아닙니다.

최종 같은 후보의 `flow-break-integrated-js.log/.stderr`는 공개 API/어댑터·Worker·Canvas·wire/페이지 배치 묶음291/291·skip0·exit0·stderr0입니다. 로그 SHA256은 `21c491078bcdf33f42c821cba0fba734df9f0d9a5a70341732f3bca47a979ac2`입니다. 앞선20/10/239/22 결과를 더해 테스트 수를 부풀리지 않으며 전체 native·참조975편집·한글 조판 완료를 뜻하지 않습니다.

### 선택적 WASM·JS 경계 후보

`wasm/paragraph_break.zig`가 ABI tag1=page/tag2=column을 공유하고 나머지는 `InvalidParagraphBreakKind`로 거부합니다. 두 포맷에 `*_edit_split_with_break`만 추가하고 기존 split ABI는 바꾸지 않습니다. HWP5는 start/end, HWPX는 start/deleted 단위를 유지합니다. HWPX의 이력 비활성 경로도 현재 의도를 전달합니다. JS 공통 `paragraph-break-api.mjs`가 `supportsParagraphBreaks()`와 `splitParagraphWithBreak({section, paragraph, atUnit, endUnit=atUnit, kind})`의 수명·정수·range·종류 검사와 호출을 소유합니다. kind는 문자열 `page`/`column`뿐이며 ABI 부재를 `Hwp5ParagraphBreakAbiUnavailable`/`HwpxParagraphBreakAbiUnavailable`로 보고하고 일반 split로 fallback하지 않습니다. 기존 저장 응답 형태는 유지합니다.

분리 사본의 ReleaseSafe 제품 빌드는 `flow-break-wasm-build.log/.stderr`·exit0입니다. 설치 경로는 `/tmp/hwpjs-task1749-ranges.9Y1P1R/flow-break-install/bin/hwpjs.wasm`, SHA256은 `6b4e65cd291258d4f726360740c2b5fdb47de8305047a3a84d67ab614349a7da`입니다. 이전9e75의336exports에 두 함수만 추가한338exports이며 누락·kind 변경은 없습니다. export parity는 signature/전체 동작 동치 검사가 아닙니다. 기본 cbaa WASM과 외부 데모는 변경하지 않았습니다.

위 후보의 `flow-break-public-api.log/.stderr`는20/20·skip0·exit0·stderr0입니다. 로그 SHA256은 `148d4c7f9cc68550768e69292b6f93a0cd8a12bf698e63ee8b8049154bcf207b`입니다. 공통 JS 및 실제 어댑터 경계10건, 실제 양 형식 × 쪽/단 × 이력 on/off 8건, raw ABI 잘못된 tag와 대기 redo 보존2건을 구분합니다. HWP5는 기존 독립 전체 Section 분할 oracle에 명세의 헤더 byte11만 반영하고 전체 CFB metadata·비대상 stream을 대조합니다. HWPX는 `hwpx-flow-break-oracle.py`가 기존 전체 XML start-split oracle을 재사용하며 전체 비대상 ZIP/metadata·명시적 플래그를 대조합니다. Python normal/-O 모두 실행하고 반대 나누기 기대값을 확실히 거부하는 음성 대조를 포함합니다. candidate 환경변수 없이 실행한 편집 테스트의 명시적 skip은 성공으로 계산하지 않습니다. 정규 HWP5 등록 목록에 세 파일을 한 번씩 연결했습니다.

### 단일 명령·이력 집중 검증

같은 게시 기반 분리 사본의 초기 `hwpx-flow-break-history-safe.log/.stderr`는 테스트 helper의 잘못된 value dereference로 컴파일 실패했고 제품 실행 결과가 아닙니다. helper 수정 후 `hwpx-flow-break-history-safe-retry.log/.stderr`는4/4·exit0입니다. 실제 fixture와 실패 batch를 추가한 최종 `hwpx-flow-break-command-final-safe.log/.stderr`는16/16(root와 기존 구조 회귀 포함)·exit0이며 stderr SHA256은 `689b73b4e09d82dc2adf975add0490e54de67fc1a261cb8359c3f71866648470`입니다.

쪽/단 각각에 대해 `A😀BC`에서 선택한 emoji2 UTF16 unit 삭제·분할·지정·저장 재열기, 한 번 undo와 추가 undo 없음, redo의 정확한 ZIP 상태 복원을 검사합니다. batch 사전 검증뿐 아니라 첫 명령을 실제 적용한 뒤 두 번째 명령이 실패하는 경로의 rollback/기존 redo도 확인합니다. 표 셀 owner·anchored 명령의 잘못된 intent·예상하지 않은 inserted 문자열은 원본과 빈 이력을 보존합니다. 실제 `charshape.hwpx`는 secPr/colPr 각각1개 유지·나누기 조회·후속 일반 Enter·정확한 이력 상태 복원으로 검사합니다. 두 나누기 종류 모두 전체 할당 실패 주입에서 원본·대기 redo·누수를 검증합니다. `hwpx-flow-break-command-debug.log/.stderr`와 `hwpx-flow-break-command-fast.log/.stderr`도각각9/9이며 순차 runner exit0을 확인했습니다. 두 stderr SHA256은 동일한 `603b794ea603177a6bd58bf8e11b3b1f014603895cff7e7ae928eda98545feb5`입니다. 이후 probe import를 넓혀 기존 field/native split/history 회귀를 별도 실행하며 이 결과와 합산하지 않습니다.

후속 `hwpx-flow-break-existing-history-safe.log/.stderr`는15/15·exit0으로 완료했습니다. 기존 필드 선택 삭제/재분할·dirty 저장·이력과 전체 할당 실패, 구역 source ordinal·빈 마커 affinity를 검사합니다. stderr SHA256은 `eb57b060cc32cea7f67560c216196c1d0857a65a1b0cb0c90620b659373de46f`이며 전체 native gate로 확대하지 않습니다.

### 저장 계층만의 검증과 폐기한 실험

실제 `charshape.hwpx`를 일반 분할한 내부 draft에 의도를 넣고, 저장·현재 조회·ZIP 재열기·무변경 저장·체크포인트 교환을 검증합니다. 독립 사용자 명령 하나로 적용한 이력 검사가 아니며 아직 UI에서 호출하지 않습니다. 순수 저장기 검사는 원본 이외 XML 바이트의 정확한 유지, 값 clone 독립성, generated 대상 누락/중복/충돌/nested 거부와 모든 할당 실패를 포함합니다.

반복 분할 검사를 추가한 `hwpx-explicit-flow-repeat-red.log/.stderr`는4통과/1실패로 왼쪽 의도 누락을 재현했습니다. 해당 생성자의 현재값 복사를 수정했습니다. 이어 `hwpx-explicit-flow-repeat-fixed.log/.stderr`와 `hwpx-explicit-flow-merge-diagnostic.log/.stderr`에서 병합 저장 차이를 재현했습니다. XML 차이는 빈 메타데이터 run의 `<hp:t></hp:t>` 13바이트 추가였고 플래그 소실과 구분됩니다.

빈 노드 생성을 제거한 실험 `hwpx-explicit-flow-native-safe.log/.stderr`는9/9였으나, 확장 `hwpx-explicit-flow-regression-safe.log/.stderr`는12통과/1실패였습니다. 기존 `continuation empty run repeated split owns empty sites on both sides`는 재열기 후 빈 run의 입력/서식 귀속을 유지하기 위한 명시적 `<t>` 생성을 요구합니다. 따라서 단순 생성 제거를 버그 수정으로 채택하지 않았습니다. `paragraph_split_xml`, `character_style_missing_run`, 해당 스타일 테스트 파일은 실험 전 코드로 되돌렸습니다. 이9/9을 현재 소스 완료 증거로 사용하지 않습니다.

Merge는 Undo가 아닙니다. 현재 회귀는 반복 분할로 materialize된 빈 입력 사이트를 유지한 정확한 예상 XML을 만들고, 그것 외 다른 XML 바이트 차이가 없으며 나누기 조회가 유지되는지 검사합니다. 체크포인트 교환·무변경 저장은 여전히 ZIP 전체 바이트 동일성을 요구합니다. 수정 테스트의 `hwpx-explicit-flow-affinity-safe.log/.stderr`는 기존 split/ZIP/continuation 회귀 포함12/12, `hwpx-explicit-flow-affinity-debug.log/.stderr`와 `hwpx-explicit-flow-affinity-fast.log/.stderr`는 집중8/8로 각각 성공했고 전체 순차 runner도exit0입니다. Safe/Debug stderr SHA256은 각각 `2b2eefba5aaf05f7d478a947fb7658dafe3fb8d84bf58ab19c073d338f4d2d45`, `adb433973cb45e56b6b6677d648e39a808b3c02348fe75dd074ef9bcd2ef7fc8`이며 Fast는 Debug와 동일합니다. 새 source 전체 native·WASM·실제 브라우저 및 모든 fixture 편집 완료 증거로 해석하지 않습니다.

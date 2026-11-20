# HWP5 strict plain 측정 저장

이 변경은 기존 guard를 유지하면서 제한된 plain 본문을 실제 호스트 측정과 연결하는 선택 경로를 추가한다. 현재 합본 기준은 ed6b54300f0560c8346f414cfff775328f0add95다. 이 합본의 Native·WASM·SDK·브라우저 실행은 아직 없다. 독립 원본 후보의 정확2122c2b7 계약은 합성 측정으로 Native10/10을 실제 통과했고, 그 증거를 합본의 실행 통과로 바꾸어 표기하지 않는다.

## 지원 데이터와 거부 범위

원본5.0.1.7 이상5.0.x, 단일 구역·단일단·한 쪽 body에 들어가는 top-level plain 본문 전체가 대상이다. 왼쪽 정렬, 문단 내 단일 글자 모양, 같은 한글/Latin 요청 글꼴, 폭/상대 크기100%, 자간/위치 보정0, percent 줄간격, 문단 앞뒤 간격/들여쓰기/탭/heading/문단 테두리0으로 한정한다. 같은 조건의 현재 DocInfo 리소스는 정상 resource writer로 준비해 결합한다.

문자는 printable ASCII와 완성형 한글 음절, 기존 원문 LF hard break 및 마지막 CR이다. 첫 문단 secd/cold16단위를 원시 범위로 보존한다. 여러 문단과 원래 LF에 따른 마지막 빈 줄을 포함한다. 일반 splice의 새로운 LF/C0 입력 허용은 추가하지 않는다. 입력 정책과 기존 LF 보존은 별도 계약이다.

soft wrap, 쪽 넘침, 결합/보조 평면/방향 문자, 중첩·표·필드·그림·수식·메모 본문, 복합단, grid/keep/번호/미해석 속성은 거부한다. pending chart 자원도 strict plain 경로에서 거부한다. 기존 문서의 버전을 올리거나 explicit legacy factory 정책을 바꾸지 않는다. 원본 보존 작성부와 table62 필드는 [하위 계약](hwp5-layout-save-contract.md)을 따른다.

## 소유권과 정상 저장

Session.prepareStrictLayout는 정상 materialize/section/DocInfo serializer로 현재 원문과 version, header ordinal, raw UTF16, 현재 글꼴·크기·간격 및 page body 치수를 준비한다. 전체 eligible section의 문단을 빠짐없이 결합한다. Native snapshot은 Session owner, 단조 serial, 기존 History mutation ticket과 retained lease를 소유한다. 편집 시도·undo/redo·복원·거래 시작·poison·close는 예전 측정을 무효화한다. 닫힌 owner 주소가 재사용되어도 lease가 과거 결과를 거부한다. 같은 직렬 owner thread에서 사용하며 checkpoint에 측정 권위를 넣지 않는다.

History의 기존 bind/poison/current-epoch 검사를 재사용하고 활성 거래/formatting batch 중에는 준비·저장을 거부한다. 저장은 History revision이나 live 모델을 바꾸지 않는다. 실패한 편집도 측정 serial을 보수적으로 만료시킬 수 있으며 기존 undo/redo 데이터와 History epoch 정책은 유지한다.

Session.save의 내부 strict request는 caller의 boolean 인증이 아니다. commit 직전에 owner/serial/ticket을 확인하고 현재 정상 DocInfo와 section draft를 snapshot과 바이트 단위로 대조한다. 전 문단 raw coverage, hard break/empty flag, native percent advance, page bounds, baseline/line-box와 첫 쪽/단 플래그를 검사한다. 정상 section writer 뒤에서 header line count와 tag69를 적용하고 기존 정상 CFB writer를 호출한다. 실패 전에 원본/dirty/History를 바꾸거나 부분 CFB를 발행하지 않는다. stale CFB 후처리, dirty 초기화, 기본 stale 허용은 없다.

## chart·notes·문서 읽기 경계와의 통합

Main의 chart_resources dirty 판정, chart-aware CFB rebuild와 chart를 포함하는 checkpoint/rollback/restore를 유지한다. strict 요청은 추가 dirty 원인으로만 결합한다. pending chart 자원이 없는 strict plain 경로도 Main의 CFB writer를 그대로 사용한다. chart 자체를 strict plain 저장 지원으로 승격하지 않는다.

ABI close는 Main의 document_text_generation.invalidate와 strict snapshot cancel을 모두 수행한다. 새 저장 경로는 읽기 세대나 source version을 위조하지 않는다. Main의 document text API, chart/equation authoring ABI와 JS 연결은 보존한다. notes·UI의 별도 소스와 보호 정책을 변경하지 않는다. 원문이 plain 범위를 벗어나면 기존 guard가 남는다.

## 브라우저와 ABI

optional ABI는 hwp5_edit_strict_layout_prepare/cancel/save다. Native가 원문 snapshot을 소유하고 JS에는 wire 사본만 반환한다. commit JSON은 paragraph/typed segment 배열만 받으며 caller가 source/version/owner를 바꾸지 않는다. 길이·타입·중복/알 수 없는 필드·완전한 coverage를 검사한다. 모든 commit 시도와 close/reprepare는 pending snapshot을 소비한다.

실험 편집기의 saveMeasuredPlainLayout({fontFace})는 소유한 새 Canvas와 실제 loaded FontFace를 사용한다. 임의 metrics callback이나 certified 플래그를 옵션으로 받지 않는다. Native 요청 family/style/weight와 face descriptor를 결합하고 FontFaceSet membership/status/descriptor/loading 이벤트를 대기 전후 확인한다. FontFaceSet.ready 이전 Native snapshot을 만들므로 대기 중 편집도 만료된다. fontBoundingBoxAscent/Descent가 없거나 face가 모호하면 거부한다. 마지막 환경 검사 뒤 await·외부 callback 없이 Native commit을 호출한다.

이것은 신뢰한 브라우저 호스트의 실측 경계다. 공개 raw WASM에 악의적인 호스트가 직접 거짓 숫자를 쓰는 것을 암호학적으로 인증하는 기능은 아니다. Native는 source/geometry 결합을 검증하지만 OS 글꼴 선택이나 fallback 동일성을 독립 인증하지 않는다. 근사 preview 결과나 합성 callback을 실제 font measurement 증거로 바꾸지 않는다.

## 검증과 남은 연결

독립 후보 Native10은 factory/Session/History strict 저장, tag69, raw UTF16 앵커/본문/CR, 재열기·unchanged-save 전체 바이트 동치, 구조 split coverage, owner/epoch/close 만료, 늦은 오류·첫 할당 실패·C0 입력 guard를 확인했다. 이 측정은 합성이며 실제 브라우저/폰트나 공식 한글 수용 증거가 아니다. UTF8 needle을 UTF16 raw 버퍼에서 찾던 이전 기대값 오류와 최초 실패는 별도 보존했다.

이 합본은 새 Native10 및 chart·notes·문서 읽기 lifecycle 회귀가 필요하다. 같은 소스 official Small WASM, optional exports/import0, 정상 Web/public SDK와 타입/등록 정책도 확인해야 한다. 실제 loaded font의 브라우저 검사, 저장 파일 재열기/본문/캐시/쪽 의미, font 변경·편집 경합·overflow 거부를 별도 확인한다. 원래 브라우저 검사기는 native 신규 LF 삽입을 양성 setup으로 쓰지 않는다.

normal Core/CLI 기본 save와 Worker/UI의 기본 저장 버튼은 아직 이 window FontFace producer를 호출하도록 연결하지 않았다. 이 오버레이를 기본 저장 목표 완료로 부르지 않는다. 공개 SDK 등록 해시 갱신, 브라우저·기본 SDK/CLI 저장, 공식 한글 수용과 배포는 후속 단계다. 기존 guard와 공개 배포는 이번 소스 준비에서 변경하지 않는다.

새 validation/patch와 hard-line 입력 스캔은 O(U+R+L+P+F)이며 CFB 복사 B를 더한다. shaping 및 기존 전체 엔진의 비용을 상수나 이 검사만의 선형성 증거로 주장하지 않는다.

## Window font producer와 제품 Worker 연결

후속 a0de7d74 격리 패치는 기본 다운로드/Ctrl+S를 유지하면서 별도 ‘글꼴 측정 후 다운로드’ 버튼을 추가한다. 기존 Native 편집 세션과 History V2가 명시적으로 활성화되고3개 optional strict ABI가 있을 때만 버튼이 준비된다. 구형 엔진은 availability=false이며 편집/읽기 상태를 자동으로 활성화하지 않는다.

Worker의 준비/commit/cancel3개 요청은 Native snapshot을 token/requestId에 결합한다. 다른 요청은 준비 결과를 보수적으로 만료시키고 늦은 commit/cancel은 새 snapshot을 소비하지 못한다. Worker의 직렬 요청 큐와 기존 비밀번호 보호 해제 동의 검사를 유지한다. prepare가 응답하기 전 UI 취소도 requestId로 정리한다. 공개 normal SDK나 CLI의 기본 저장 정책은 바꾸지 않는다.

Window는 Native가 요청한 family/style/weight의 실제 loaded FontFace를 사용한다. 명시적으로 선택한 글꼴 파일은 측정 버튼을 누를 때만 읽고 SHA256과 실제 FontFace를 소유한다. 등록한 FontFaceSet을 기록하고 document 교체/종료 시 자신이 등록한 face만 해제한다. 다른 같은 family face가 있으면 덮어쓰지 않고 거부한다. 원문과 같은 실제 글꼴 파일을 선택해야 하며 내장 family/cmap·OS fallback 동일성을 이 연결만으로 인증하지 않는다.

Worker 왕복과 cancel 정리가 끝날 때까지 FontFaceSet 이벤트·membership·descriptor를 관측한다. 마지막 폰트/Window 세대 검증 뒤 같은 호출 스택에서 기존 downloadDocument를 호출한다. 편집·undo/redo·문서 교체·Worker 종료·파일 교체·폰트 변경으로 만료된 결과는 다운로드하지 않는다. 다른 읽기 요청도 보수적으로 만료시키므로 실제 idle 경로의 사용성과 경합은 브라우저에서 확인해야 한다.

이 패치의 Node31개는 모의 realm/Native transport로 논리·수명·경합을 검사했다. 실제 Worker/WASM/폰트/브라우저 증거가 아니다. `tools/browser/strict-layout-worker-ui-product.mjs`는 승인된 page와 같은 소스 WASM/own HWP5 fixture/폰트 파일의 핀, 검증한 caret 좌표를 받아 실제 제품 UI로 입력·기본 저장 거부·측정 다운로드·재열기 바이트 동치를 검사하도록 준비했다. 아직 실행하지 않았다. 실제 경합·fallback·지원 밖 문서/쪽 넘침·chart/notes 공존, 정상 SDK/등록과 공식 한글 수용은 후속 gate다.


## 공개 데모의 typed 측정 저장 후보

07603 기반 후속 후보는 기존 공개 HeadlessEditor와 canonical Worker를 재사용한다. @hwpjs/core/runtime의 createMeasuredPlainLayoutSaver(editor)는 Window FontFace 소유자와 기존 측정 producer를 연결한다. 원시 strict RPC는 requestExperimental에서 차단하며 내부 typed bridge만 현재 Core admission/FIFO를 통해 prepare/commit/cancel을 보낸다. DOM 폰트 객체나 측정값을 기존 save 옵션으로 전달하지 않는다.

apps/demo의 기존 파일 메뉴 저장 옵션에 ‘글꼴 측정 후 HWP 저장’을 노출한다. 현재 문서의 실제 optional strict/History V2 지원을 확인하고 명시 클릭으로만 시작한다. 기본 저장/Ctrl+S와 기존 stale 옵션은 그대로 유지한다. 차트 메뉴/공유 assets 또는 새 엔진을 추가하지 않는다. 해당 도구는 일반 단일 쪽 본문 지원 경계를 넓히지 않는다.

측정 전에 입력 flush를 거치며 Native 큐는 폰트 대기 동안 점유하지 않는다. model/content/token/view/surface 세대, settled 입력, History poison, abort/close와 문서 교체를 commit 및 최종 동기 publication에서 검사한다. Native 사본 생성 이후에도 폰트 변경과 cleanup 실패 시 다운로드와 savedOperationRevision 갱신을 거부한다. 동기 publication이 정상 반환한 경우에만 Core 저장 표시를 갱신한다. 파일 시스템에 실제 저장되었다는 인증이나 History의 조판 원본 갱신으로 해석하지 않는다. 암호 해제 사본 동의가 취소되면 다운로드도 거부한다.

집중 Node 검사는 모의 Native runtime/Window/DOM을 사용한다. 실제 WASM/브라우저/배포 증거와 분리한다. 기존 07603 preview E2E는 별도 증거로 유지하며 공개 제품용 tools/browser/strict-layout-demo-product.mjs는 승인된 기존 page와 새 공식 SDK/gallery Worker 및 WASM 핀을 받아 /demo/vanilla에서 수행하도록 준비했다. 현재 공개 SDK/gallery 재빌드와 브라우저 실행, React/Svelte 화면 및 실제 배포 확인은 남아 있다.

## 가시 본문의 측정 스타일 선택 후속 후보

공식633의 실제 Native replay는 기본 blank와 본문 삽입에서는 준비가 통과하고, 대표 글꼴을 raw16..20에 적용한 뒤만 실패했다. 실제 run은 [0,16) shape0 / [16,20) shape7 / [20,21) shape0이며 raw42바이트의 구조 prefix와 CR은 동일했다. 기존 formatter의 선택 밖 서식 보존을 유지하면서, 후속 source 후보는 가시 본문 문자에서 단일 측정 스타일을 선택한다. 물리적인 첫 run을 측정 스타일로 대신하지 않는다.

borrowed tag68의 선언 개수·8바이트 framing·start0·단조 증가·리소스 ID·점유 raw 범위를 검증한다. raw EOF의 one-past-end run은 이번 경로에 필요하지 않아 거부한다. 구조 토큰 내부를 가르는 스타일 경계도 거부한다. 가시 본문이 여러 스타일이면 UnsupportedStrictMixedVisibleStyle로 거부한다. 공백도 측정할 본문 문자에 포함하고 LF/구조 prefix/마지막 CR은 가시 문자 선택에서 제외한다. 가시 문자가 없으면 실제 빈 줄 marker의 스타일을 사용하며, 본문 내 빈 줄 또는 마지막 빈 줄의 marker가 다른 스타일이면 거부한다.

보존하는 비가시 스타일의 크기·attributes·ratio/relative-size/spacing/offset은 선택 스타일과 호환돼야 한다. 현재 후보는 크기와 attributes 동치, 기본 metric 배열만 허용한다. 기존 실제 shape0/shape7은 모두1100·일반체이며, 실제 font-only atomic 패치는 font IDs만 바꾼다. 숨은 font family는 다를 수 있으나 사용 리소스의 모든 언어 font 참조가 존재해야 한다. 본문 스타일의 기존 글꼴·문단·버전·Unicode/넘침·측정 owner 검사는 유지한다.

raw 문자, tag68의 모든 run, 구조/CR과 문서 리소스를 재작성하거나 병합하지 않는다. 기존 tag69 patch/CFB writer만 호출하고, current draft/DocInfo와 snapshot의 바이트 동치 및 History/Session lease 검증을 그대로 사용한다. 선택은 두 번의 순방향 문자 순회와 상수 크기 리소스 검사로 O(raw units + run count)다. 새 ABI 필드·default stale·기존 문서 버전 업그레이드를 추가하지 않는다.

후속 집중 회귀는 실제 factory/History에서 같은3run을 만든 뒤 synthetic 측정값으로 저장하고, 실제 출력의 raw/run 동치와 재파싱의 AppleGothic 선택을 확인하도록 준비했다. 진짜 가시 본문 mixed-style, 숨은 metric 불일치, empty-line marker·EOF/리소스/경계 음성을 별도로 둔다. 이 source 단계의 fmt/AST 검사와 Native 실제 실행/브라우저 폰트/공식 한글 수용은 서로 다른 증거다. 후보의 실제 실행 결과는 별도 동결 패킷이 소유하며 기존87bd 릴리스 결과를 바꾸지 않는다. genuine multi-style 측정은 후속 범위다.

## 선택 글꼴 디코딩 실패 후보

원본 파일은 변경하지 않고 File.arrayBuffer의 동일 바이트로 FontFace를 만든다. constructor/load가 거부되면 먼저 기존 check를 호출해 취소·문서 교체·owner 만료 오류를 우선한다. 여전히 현재 작업인 경우에만 원래 cause를 가진 StrictFontDecodeFailed로 분류하고, 선택 파일 이름·길이·원본 SHA·시그니처·요청 family의 읽기 전용 진단 profile을 붙인다. 이 profile은 내부 원본 family를 검사했다는 인증이 아니다.

공개 파일 메뉴의 strict 도구는 이 오류를 한국어로 안내하고 busy 해제 뒤 현재 작업의 활성 글꼴 입력으로만 포커스를 복구한다. 문서가 바뀌었거나 도구가 닫히면 상태·포커스를 갱신하지 않는다. 자동 재시도·폰트 대체·consent 변경은 없고, 기존 파일 메뉴 저장 선택과 기본 LayoutReflowRequired 정책을 보존한다.

경량 Node14는 모의 FontFace constructor/load 실패·취소/문서 교체 뒤 늦은 load 거부·직접 save promise의 오류 분류와 lease 해제/commit0/publication0 및 UI 안내/포커스를 검사했다. 실제 FontFace·새 GUI·Native 실행 증거가 아니다. 별도 실제 db614/9235 GUI는 AppleGothic 원본 SFNT의 잘못된 rangeShift/OS2 부재에 따른 OTS 실패와 다운로드0을 보존했다. 이 경로로 실제 Native strict 저장 회귀가 증명되었다고 해석하지 않는다.

후속 양성 코호트는 OFL 원본 Noto Sans KR2.004의 내부 family와 문서의 선택 family를 정확히 일치시키고 한글 cmap을 검증한다. 브라우저 실제 로드와 저장 line69/재열기는 별도 예정 검증이다. 일반 내부 family 불일치 검증이나 명시적 fallback 설계는 이 오류 분류 후보의 범위에 포함하지 않는다.

# 덧말 문자열의 원문 변경 계획

## 책임과 SSOT

dutmal_text_changes는 run 직접 dutmal의 mainText/subText 중 명시적으로 선택한 leaf에 대한 원문 Change 배열만 준비합니다. 중복·누락·외래 namespace·중첩 자식이 있는 대상은 거부합니다. 반환 배열의 새 텍스트는 호출자 버퍼를 빌리므로 XML 작성이 끝날 때까지 수명을 유지해야 합니다.

xml_content_source_span은 CharData와 CDATA 전체 컨테이너의 UTF-8 범위/포인터/구분자 검증을 소유합니다. 기존 text_sites도 같은 함수를 재사용하도록 분리했으며 기존 인코딩→사이트 한도→범위 오류 순서는 유지했습니다. 원문 재조립·이스케이프·빈 요소 확장은 기존 xml_source_writer가 계속 담당합니다. XML 파서나 별도 문자열 저장 모델을 만들지 않습니다.

전체 문자열 치환은 첫 직접 텍스트 위치에 새 값을 넣고 나머지 직접 텍스트만 지웁니다. 주석·PI·속성·다른 leaf와 불투명 원문은 보존합니다. 정규화된 기존 값과 같으면 변경 배열을 비워 CDATA 표기까지 그대로 유지합니다. 이 계획 자체는 문단 줄 배치 캐시·필드 dirty·세션 설치·이력을 처리하지 않으며 호출자가 그 거래를 책임져야 합니다.

## 검증

ReleaseSafe 집중5/5 exit0, 전체 build.zig/src fmt exit0입니다. 합성 사례는 CharData/CDATA/entity·주석/PI/속성/반대 문자열 보존·no-op·빈 요소 확장·Unicode/한도 거부·중복/외래/중첩 대상·prepare/write 전체 실패 할당·원문 불변을 검사했습니다. 공통 범위 계산기는 완전한 CDATA 구분자·범위 밖 버퍼·비 UTF-8 입력 거부를 검사했고 기존 본문 text_sites 회귀도 통과했습니다.

실제36389301에서 mainText와 subText를 각각 변경한 일시적 section XML을 재파싱해 선택 문자열만 바뀌고 반대 문자열/덧말 속성이 유지되는지 확인했습니다. 원본 세션 save는 입력 ZIP과 byte-exact였습니다. 실제 파일을 수정하거나 공개 편집 세션에 후보를 설치한 검사는 아닙니다.

이 계획을 현재값 intent·공통 save·필드/geometry 거래·clone/예산·History·WASM/Worker/UI에 연결하는 작업은 남습니다. native 변경은 전체 gate 완료 전 로컬 상태이며 내부 문자열 편집 지원 완료로 계수하지 않습니다.

## 현재 문자열 소유권과 체크포인트

dutmal_text_values는 control/kind 키마다 변경 문자열 한 개만 소유합니다. 같은 값은 no-op, 원본 정규화 값으로 복원하면 override를 제거합니다. 후보 clone과 전체 소유 바이트/항목 한도를 검사한 뒤 교환하므로 실패 시 원래 현재값을 유지합니다. source 값 조회와 Change 생성은 같은 collector를 공유하며 별도 XML 캐시는 저장하지 않습니다. clone의 중복 키 검사는 hash map을 사용해 항목 수에 대한 이중 순회를 피합니다.

Section의 해제·editor_checkpoint의 capture/해제/교환/예산에 연결했습니다. 이 시점에는 공통 ZIP 저장이 연결되지 않았으므로 pending override가 있으면 UnsupportedDutmalTextSave로 명시적 거부해 변경값을 조용히 누락하지 않습니다. 임시 안전 경계이며 최종 편집 지원으로 계수하지 않습니다.

ReleaseSafe 집중7/7 exit0, 전체 fmt exit0입니다. 본문/주석 독립 소유·clone 격리·원본 복원·no-op·Unicode/예산 거부·clone/set 전체 실패 할당·실패 후 기존 문자열 불변을 검사했습니다. 실제36389301 세션에서는 기존 체크포인트로 변경 문자열 복원/다시 교환·캡처 예산 거부·pending 저장 거부·원문 source 불변을 확인했고, override를 되돌린 상태의 save는 원본 ZIP과 byte-exact였습니다. 공개 setter/History·필드 dirty·geometry 캐시·저장 작성기·WASM/Worker/UI와 실제 거래 전체 OOM은 남습니다.

## 변경된 본문 XML과의 조합 작성기

dutmal_text_save는 기존 xml_identity_binding으로 원본과 본문 편집 후 XML의 덧말/컨테이너/표 소유권을 연결합니다. 원문 덧말 payload가 그대로 보존돼 있는지도 비교한 뒤 main/sub Change를 같은 현재 XML에 모아 적용합니다. 중복 slot intent·소유권 불일치·다른 경로가 이미 바꾼 덧말은 거부합니다. 바뀐 덧말의 직접 소유 문단 linesegarray만 제거하며 두 slot이 같은 캐시를 두 번 지우지 않도록 합니다.

ReleaseSafe 집중1/1 exit0, 전체 fmt exit0에서 앞선 본문 Unicode 입력과 두 문자열 변경 조합·정확한 전체 XML·소유 문단 캐시 제거/다른 문단 캐시 보존·중복/기존 payload 변경 거부·작성기 전체 실패 할당을 검사했습니다. 이 작성기는 아직 Session.save에 연결하지 않았습니다. 필드 dirty와 보호 문맥을 검증한 뒤 연결해야 하므로 pending 저장 거부는 유지합니다. 구조 재배치/동일 payload의 모호한 소유권·실제 ZIP 독립 비교·공개 API/이력/UI는 계속 미완료이며 native 변경은 로컬 상태입니다.

## ZIP 저장과 필드 보호 연결

Session.save에 덧말 작성기를 연결하고 모든 pending 저장을 거부하던 임시 경계를 제거했습니다. 구조 모델이 설치된 상태는 아직 UnsupportedDutmalStructuralSave로 거부합니다. 원문 소유권의 구조 재배치/모호성을 검증하기 전에는 순서 기반 연결만으로 게시하지 않습니다.

dutmal_field_dirty는 기존 source_field_analysis·필드 범위·field_source_scope·종류 정책을 재사용해 덧말 leaf를 감싸는 알려진 텍스트 필드의 dirty를 파생합니다. 기존 dirty 요청과 중복 없이 합치고 계산/미지 필드, 부분 겹침과 미해결 begin의 소유 범위는 거부합니다. source와 세션 field_dirty 목록을 직접 바꾸지 않으며 base XML 작성기에 이 일시적 요청을 전달합니다.

ReleaseSafe 집중3/3 exit0, 전체 fmt exit0입니다. 실제36389301의 mainText 변경은 ZIP save→재열기 문자열 확인·checkpoint 원문/수정본 byte-exact 복원까지 통과했습니다. 합성 dirty0 CLICK_HERE는 dirty1 저장/재열기, DATE는 UnsupportedDutmalFieldEdit, 미해결 CLICK_HERE는 ProtectedFieldRange로 거부했고 원문 source/기존 dirty 목록은 유지됐습니다. 최초 합성 반례가 기본 수식 픽스쳐의 id1과 충돌해 InvalidFieldLinks로 실패했으며 독립 구역 픽스쳐로 교정한 뒤 재검증했습니다. 링크 가드를 완화하지 않았습니다.

공개 setter·실제 ZIP 독립 oracle·필드 dirty 전체 실패 할당·구조와 다른 객체 편집 조합·WASM/Worker/UI는 아직 남습니다. native 수정은 전체 gate 완료 전 로컬 상태입니다.

## Native 세션 명령

Session.dutmalText/setDutmalText를 dutmal_text_session으로 분리해 연결했습니다. 활성 분기·구역/노드·leaf 검증 뒤 현재값 후보를 만들고 전체 Session.save 성공을 확인한 다음 문자열 소유자를 교환합니다. 후보는 기존 객체 값들을 빌릴 뿐 해제하지 않으며, 저장/검증 실패 시 기존 값을 게시하거나 바꾸지 않습니다. 본문 Sites와 덧말 override 문자열을 합산해 문서 텍스트 예산도 검사합니다.

ReleaseSafe 집중2/2 exit0에서 실제 세션 명령의 입력·no-op·잘못된 XML 문자 거부·현재값 조회·ZIP 재열기·체크포인트 원문/수정본 복원과 dirty0 텍스트 필드 갱신을 확인했습니다. DATE/미해결 필드의 명령 실패 뒤 override가0개이고 save가 원본과 byte-exact인지 재검증했습니다. 전체 fmt도 통과했습니다. 구조 제한은 유지하며, 공개 History 명령·실제 거래 전체 OOM·독립 실제 ZIP oracle·WASM/JS/Worker/UI 연결은 남습니다. native 코드는 전체 gate 전 로컬 상태입니다.

## 후보 WASM의 JS 편집 검증

Canvas 미리보기의 `dutmal-paint.mjs`는 현재 문자열 두 개를 각각 그리고 동일 폭/높이 계획을 measure와 paint에서 공유합니다. TOP/BOTTOM·LEFT/CENTER/RIGHT·명시적 비율을 처리하며 szRatio0은 미확정 원문 의미와 별개인 임시50% 미리보기 정책으로 표시합니다. 원문 값/저장과 보호 앵커의 UTF-16 한 글자 길이를 바꾸지 않습니다. draft 위치는 공통 anchored-object projection을 재사용합니다. 원본 스타일 참조/옵션/글꼴 shaping·원본 한글 Ruby 조판은 아직 지원 완료가 아닙니다.

실제 Worker/후보5fb9192e와 renderer 대역에서 본문/주석 별도 paint·작은 주석/위쪽 배치·한 글자 경계/폭, 순수 TOP/BOTTOM·정렬/미지원 값·draft 위치/원문 불변을 검증했습니다. 최초 실제 검사에서는 글꼴이 pt 단위라 px 전용 계획이 거부돼 실패했고 px/pt 처리 후 통과했습니다. 덧말 paint/renderer Worker/편집 Worker3/3 종료코드0이며 실제 브라우저 픽셀 검증은 아닙니다.

Worker 표시 데이터 연결 시 현재 일반 텍스트 스냅샷에 보호 앵커가 빠져 `DutmalBindingMismatch`로 실제 실패했습니다. 덧말 전용 `dutmalDisplayText(section,node)`는 기존 앵커 투영을 먼저 사용하고, 전체 편집이 거부된 필드 문단은 기존 fieldLabels 정책·source_field_paragraph_positions로 표시용 문자열만 얻습니다. 일반 스냅샷과 편집 권한은 바꾸지 않습니다. `dutmal-content.mjs`는 이 문자열과 현재 위치·값을 연결하고 sourceAttributes는 별도 복사합니다. 불일치/조회 실패/표시 예산 초과는 명시적 오류이며 편집 허용을 추가하지 않습니다.

후보 `zig-out/verification/dutmal-display-api/bin/hwpjs.wasm`(SHA256 5fb9192ef1e35bbf9a8078139cd4495f8974a391ed30bb5e7a4895b492429074)의 ReleaseSafe 빌드6/6과 덧말 Worker/sites/content·기존 checkbox Worker 테스트5/5 종료코드0입니다. native 코드는 로컬 상태이며 Canvas 덧말 조판·클릭 선택과 기본 WASM 승격은 아직 남습니다.

선택적 `hwpx_edit_dutmal_sites(section)`와 JS `dutmalSites(section)`는 현재 `{node,paragraph,anchor_unit}` 목록을 반환합니다. paragraph는 기존 native API와 같은1-based이며 anchor_unit는 보호 앵커의 UTF-16 위치입니다. JSON 디코더는 중복 노드/범위 밖 값/타입 변환/잘못된 UTF-8을 거부합니다. ABI가 없으면 `HwpxDutmalSitesAbiUnavailable`이며 빈 목록으로 대체하지 않습니다.

ReleaseSafe 후보 `zig-out/verification/dutmal-sites-api/bin/hwpjs.wasm`(SHA256 d2067cbf86f8aeae2ebf7d7a0de32ca6e6a3fb0e0c3311be55c43e217caf396e)의 빌드6/6 성공과 `dutmal-sites`, `dutmal-text-editor`, `dutmal-text-worker` 테스트6/6 종료코드0입니다. 실제 필드 prefix 입력 후 위치43→46·문자열 수정 후 위치 유지·독립 XML/ZIP·두 단계 undo/redo·잘못된 구역 조회 뒤 redo 유지·저장 재열기를 확인했습니다. native ABI는 전체 gate 전 로컬, JS 클라이언트는 선택적 API이며 기본 WASM·Canvas 조판/선택 지원을 뜻하지 않습니다.

`dutmal_display_sites.zig`는 현재 문단 순서를 `display_current_paragraphs`에서 빌리고 위치/소유권은 공통 `protected_display_host`로 계산합니다. 활성 XML 분기만 선택하며 UTF-16 위치를 main/sub 문자열 길이로 합성하지 않습니다. 실제36389301에서 문단26/위치43, 앞의 `앞😀` 필드 입력 후 동일 노드/문단과 위치46, mainText 값 변경 후 동일 위치를 확인했습니다. 활성 분기 제외가 포함된 최신 소스의 `zig test src/root.zig -O ReleaseSafe --test-filter 'dutmal display sites'`는2/2 종료코드0이고 변경 파일 fmt가 통과했습니다. 비활성 분기 전용 반례/구조 재배치/전체 OOM·WASM/Canvas 연결은 아직 남으며 native 코드는 로컬 상태입니다.

native `dutmal transaction allocation failures preserve prior values and ZIP`는 dirty0 CLICK_HERE 안의 두 leaf를 가진 합성 ZIP에서 먼저 mainText를 변경한 뒤 subText setter의 전체 할당 실패 지점을 순회합니다. 오류마다 기존 main/sub 값과 이전 저장 ZIP을 byte-exact 비교했고 성공 경로 후 subText 원값 복원도 확인했습니다. `zig test src/root.zig -O ReleaseSafe --test-filter 'dutmal transaction allocation failures'`는 대상 모듈 명시 등록 뒤2/2 종료코드0, 변경 파일 fmt도 통과했습니다. 최초 실행은 상위 root.test_0만1/1 실행돼 대상 근거로 제외했습니다.

이전 전체 gate의 실제 프로세스50117 샘플은 `HWPX underline batch allocation failures preserve original and prior redo` 내부 할당 실패 검사에서 실행 중임을 확인했습니다. 이는 이전 소스 실행이며 현재 native 전체 green이나 무한 루프 부재 증명이 아닙니다. 새 setter 테스트와 native 등록은 전체 gate 완료 전 로컬 상태입니다.

폼 busy 경로 반례에서 새 subText 선택을 조회 불가라는 이유로 무시해 이전 mainText baseline이 남는 결함을 재현했습니다. 강화된 폼 검사가 먼저 실패했고, 선택은 항상 새 native-query 상태로 전환하되 요청 거부 시 baseline을 비우도록 수정했습니다. 준비 상태 복원 뒤 제출해도 이전 leaf 쓰기가 발생하지 않으며 사용자가 다시 선택/조회해야 합니다. enable 실패/ABI 부재도 기존 목록·draft를 reset합니다. 폼/상태/실제 Worker 회귀4/4 종료코드0입니다.

독립 `python3 tools/hwpx-dutmal-inventory.py reference/rhwp/samples`는 .hwp/.hwpx 경로 중 실제 ZIP436개를 순회해 paragraph namespace 덧말1개(36389301)만 관측했습니다. HWP5-password-123456.hwpx 구역 XML 파싱 오류1개를 별도 보고해 종료코드1이며 이를 정상 조회/편집 성공으로 계산하지 않습니다. ZIP/XML census는 전체 HWPX 명세 지원을 검사하지 않습니다.

실파일 덧말 표본이 하나뿐이므로 같은 ZIP의 mainText만 self-closing 빈 leaf 또는 Unicode/특수문자 CDATA로 바꾼 메모리 파생본을 추가했습니다. explicit 후보0367ee46의 JS 테스트3/3 종료코드0에서 정상화된 원값 설정의 ZIP byte-exact/no-history·새 값 저장/재열기·독립 전체 XML/ZIP(일반 Python/-O)·undo 원본복원·no-op 뒤 redo 유지를 검사했습니다. 파생본은 추가 실파일 지원 건수로 합산하지 않습니다.

실제 headless Chromium과 후보0367ee46에서36389301 업로드→편집 시작→속성 패널의 덧말 선택/조회·수정·본문/덧말 재조회·undo 원값 복원·redo 수정값 복원을 확인했습니다. 자동화로 채운 textarea 값이 input 이벤트 기반 draft에 반영되지 않아 쓰기 요청이 없는 사례가 있어, submit에서 DOM 값을 다시 읽도록 보강하고 이벤트 없는 채움 반례를 폼 테스트에 추가했습니다. 재검증에서는 덧말 수정값이 재조회됐고 반대쪽 본문은 원값 그대로였습니다. 브라우저 reload 후 복원된 스크롤에서 상단 버튼이 Canvas에 가려진 자동화 실패는 구분했고 위치 정정 후 재실행했습니다. 제가 연 브라우저와 loopback18473 서버는 종료했습니다. 이 결과는 해당 후보의 속성 폼 동작이며 다운로드 전체 XML 비교/Canvas Ruby 조판/전체 픽스쳐 UI 완료는 아닙니다.

속성 패널의 덧말 대상/본문·덧말 선택/값 적용 폼을 `dutmal-controls.mjs`로 연결했습니다. enable 응답의 필수4개 ABI 존재 여부로만 기능을 활성화하며, 원문 목록 이후 native 현재값을 조회합니다. 응답 처리는 전역 busy 해제가 끝난 microtask에서 수행하고 문서 generation을 다시 확인합니다. 문서 교체/reset/pagehide는 상태와 리스너를 정리합니다. 폼 대역과 상태·실제 Worker 회귀4/4 및 JS 구문 검사가 통과했습니다. 기본 WASM 승격과 실제 브라우저 E2E·Canvas 덧말 조판/클릭 선택은 남습니다.

`dutmal-edit-state.mjs`는 native 현재값 baseline과 일시 draft를 분리합니다. 요청별 serial로 오래된 조회/수정 응답을 거부하고 조회 전·실패 후 미확정 baseline·중복 제출을 막습니다. no-op 제출은 쓰기 요청을 만들지 않으며 undo/redo 뒤에는 현재값을 다시 조회합니다. reset/close는 지연 응답을 무효화합니다. Worker 수정 응답에도 requestId를 보존했습니다. 상태 반례2개와 실제 Worker 회귀1개가 통과했으며 이 상태 모듈은 아직 화면 속성 폼에 연결하지 않았습니다.

Worker 조회 실패 응답의 요청 식별자 누락을 실제 재현했습니다. 잘못된 textKind에서 `requestId:17`이 undefined로 반환돼 강화한 테스트가 먼저 실패했습니다. `dutmalQueryIdentity`로 덧말/원문 조회 오류의 식별자를 보존한 뒤 잘못된 종류·존재하지 않는 노드·미지원 포맷 원문 조회와 redo 유지가 통과했습니다. 기존 체크박스 Worker 및 덧말 JS 포함4/4 종료코드0입니다. Canvas UI의 응답 대기를 실제 브라우저에서 재현한 결과는 아니며 Worker 계약 결함 수정입니다.

Worker의 `inline-string-sources`는 원문 노드 검색만, `dutmal-text-query`는 `section/node/textKind`의 현재값 조회만 수행합니다. `dutmal-text`는 활성 편집 이력 세션을 요구하고 `value`를 변경한 뒤 현재값과 갱신 display를 반환합니다. 문자열 명령 로직은 `web/preview/dutmal-edit-command.mjs`로 분리했습니다. 현재 원문 응답은 편집 후에도 source-only이며 표시 위치/편집 허용을 뜻하지 않습니다.

같은 후보로 `dutmal-text-worker`, 기존 `checkbox-state-worker`, default gate 등록 검사 3/3 종료코드0입니다. 실제 덧말 픽스쳐에서 Worker 노드 검색·두 값 수정·독립 전체 XML/ZIP·undo/redo·조회 종류 오류와 입력 실패 뒤 redo 유지·재열기를 확인했습니다. DOM은 대역이며 Canvas 덧말 조판/선택/입력 UI와 실제 브라우저 E2E는 아직 남습니다.

독립 `hwpx-dutmal-text-oracle.py`는 실제 ZIP의 비대상 payload와 전체 구역 XML을 비교합니다. 두 leaf 값과 직접 소유 문단의 linesegarray 제거만 기대하며, main/sub 각각의 잘못된 기대값이 실제 XML 불일치로 거부되는지 일반 Python 및 `-O`에서 검증했습니다. 선택적 JS `dutmalText`/`setDutmalText`는 `mainText`/`subText`만 받고 ABI 부재를 명시적으로 거부합니다. JS 클라이언트와 검증 파일의 게시가 native ABI 또는 기본 WASM의 게시를 의미하지 않습니다.

2026-10-13 `zig-out/verification/dutmal-text-api/bin/hwpjs.wasm`를 명시한 `dutmal-text-editor`, `inline-string-source-wire`, `inline-string-source-reference` 테스트는 5/5, 종료코드0입니다. 실제36389301에서 mainText/subText 별도 변경·Unicode/XML 특수 문자·저장 재열기·각 명령 undo/redo·no-op/잘못된 문자/종류 거부 뒤 redo 유지·원문 ZIP 복원과 source-only 응답 불변을 검사했습니다.

이는 후보와 로컬 JS/native 변경의 집중 검증이며 기본 제품 WASM 승격이나 native 코드 게시 완료가 아닙니다. 독립 ZIP/XML oracle, 전체 Zig gate, Worker/Canvas UI와 원본 조판 검증은 남습니다. 명령은 `HWPJS_TEST_WASM=$PWD/zig-out/verification/dutmal-text-api/bin/hwpjs.wasm node --test tests/hwpx/dutmal-text-editor.test.mjs tests/hwpx/inline-string-source-wire.test.mjs tests/hwpx/inline-string-source-reference.test.mjs`입니다.

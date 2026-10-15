# HWPX 차트 값 목록 UI

## 2026-10-16 미적용 초안 Escape 취소

차트 값 입력의 일반 Escape는 미적용 초안이 있을 때만 현재 native 조회값으로 복원하고 취소 안내를 표시합니다. 기존 pick 경로를 재사용하며 native setter/이력 요청을 보내거나 값을 직접 수정하지 않습니다. 변경 없는 Escape는 소비하지 않습니다. 이미 처리된 키·조합/229·수정키·반복키·busy/미활성/닫힌 상태는 처리하지 않고 close에서 리스너를 제거합니다.

수정 전 Escape 반례는 preventDefault 기대가 실패했습니다. 수정 후 main 기반 격리 라벨/표/폼6/6·55.051292ms·exit0, 실제 작업 트리의 추가 controls 포함12/12·44.321ms·exit0입니다. textarea 줄바꿈 정규화를 모사해 취소 후 값/요청0회와 다시 적용할 때 원래 native CR 문자열을 유지하는지 검사했습니다. 추가 controls 테스트를 이번 게시에 포함하거나 두 실행을 합산하지 않습니다. 브라우저 event 전파·물리 IME 실측과 native 단의 실행 중인 실패 주입은 별도이며, 아래 브라우저 검증을 이 Escape 변경에 소급하지 않습니다.


## 2026-10-16 현재 편집 포인트 표시

값 목록의 현재 항목에 `aria-current=true`와 굵은 글씨를 표시합니다. 표는 선택 순번을 저장하지 않으며, 선택 provider가 기존 포인트 선택 폼의 현재 ordinal을 반환합니다. 동일한 OOXML idx가 여러 행에 있어도 배열 ordinal로 구분합니다. provider가 없거나 현재 순번이 부재·문자열·분수·비유한·범위 밖이면 현재 표시를 만들지 않습니다.

기존 선택과 표의 페이지 복원·재조회·새 문서 초기화,130개 값/반복 idx의65번 표시·외부 provider 변경·거부된 선택·값 불변·close 후 provider 미호출을 검사했습니다. 수정 전 현재 표시 검사는 null 기대 불일치로 실패했고, 수정 후 main 기반 격리 라벨/표는5/5·44.079083ms·exit0입니다. 실제 작업 트리의 추가 controls를 포함한 묶음은11/11·40.904583ms·exit0이며 그 미공개 테스트는 이번 게시에 포함하지 않습니다. 아래 실제 브라우저 기록 이후 추가한 표시 기능으로, 이 변경의 브라우저/스크린리더 실측은 아직 별도입니다. native 모델·명령·WASM은 변경하지 않았습니다.


## 2026-10-16 실제 Chromium의 다단계 선택·편집·이력

미공개 차트 통합 후보와 main `161f8816`의 라벨 변경, WASM `f6decd1d…`를 별도 서버에서 실행했습니다. 실제 파일 선택으로 파생 HWPX를 열어 단계 노드48/57의 같은 포인트0이 다르게 표시됨을 확인하고, 두 번째 단계의 표 버튼 선택→원값 W→`브라우저 단계😀<&_x0008_` 입력/적용을 수행했습니다. 화면의 툴바 download/undo/redo 버튼으로 만든 Blob3개를 관측했으며 실제 OS 다운로드 위치 검증과는 구분합니다.

산출물은 `/tmp/hwpjs-chart-label-browser.mSkune/evidence/`의 edited/undo/redo.hwpx와 스크린샷·verification.json입니다. 편집/redo는303970바이트·SHA256 `22f55467d72ed2688c169447aacd77ed53f508d52568995b68c43a6726213a02`, undo는45360바이트·`1f27f19e55e3fb8b00de8c1881e476b51af78cef1e57a1f5f38f0fb143c6cadf`로 파생 입력과 byte-exact입니다. 독립 Python normal/-O XML/ZIP/OLE·비대상/형제 스트림 검증4회와 첫 단계 leaf로 바꾼 잘못된 기대값의 거부4회를 확인했습니다. 새 native 세션의 redo 재열기/무편집 저장도 byte-exact이며 브라우저 errors는 빈 목록입니다.

동일 이름의 메뉴/툴바 버튼을 자동화가 혼동한 첫 시도는 undo 조건25초 timeout이었고 다운로드 Blob은 없었습니다. 관측한 실제 toolbar ID로 대상을 고쳐 위 성공을 확인했으며 제품 상태를 직접 설치하거나 데이터를 주입하지 않았습니다. agent-browser 전용 세션 close와 자체9037 서버 종료·세션/PID/listener 부재를 확인했고 다른 프로젝트 세션은 유지했습니다. 합성 파생 cache의 표 선택/저장 증거이며 Canvas 차트 픽셀 선택·실제 다단계 원본·차트 재렌더링·물리 IME·RHWP 전체 UI 동치나 기본 WASM 승격의 증거는 아닙니다.


## 2026-10-16 다단계 범주의 표시 구분

동일 계열·동일 idx가 다른 단계에 있을 때 두 라벨이 완전히 같아지는 반례를 재현했습니다. `chart-point-label`은 multilevel_cache의 유효한 native u32 level_node만 “단계 노드”로 덧붙입니다. 순서/단계명/계열을 추정하거나 XML을 재해석하지 않으며, 부재·음수·분수·비유한·문자열·u32 초과는 표시하지 않습니다. 다른 point 종류는 추가 값을 무시합니다. 값 모델·point ordinal·선택·setter·이력은 변경하지 않았습니다.

main 기반 격리 라벨/표 테스트는4/4·49.048625ms·fail/skip/cancel0·exit0입니다. 실제 작업 트리의 추가 controls 반례6개를 포함한 묶음도10/10·40.2545ms·exit0이나 아직 미공개 controls 테스트까지 이번 라벨 커밋에 포함하지 않습니다. 실제 브라우저·다단계 원본 조판 검증은 별도이며 앞선194개 회귀 이후의 표시 변경으로 구분합니다.


`web/preview/chart-point-table.mjs`는 현재 네이티브 chart 조회 응답의 값을 표로 표시하고, 선택한 point ordinal을 기존 차트 편집 폼에 전달합니다. 자체 수정본·값 캐시·XML 해석이나 native 명령을 소유하지 않습니다. 계열/역할 라벨은 기존 `chart-point-label`이 소유합니다.

값 목록은64개씩 페이지로 나눕니다. 원본 point ordinal과 값을 유지하고 미지원 종류도 읽기 전용으로 표시합니다. 선택은 현재 readiness와 point 종류를 다시 검사하고, 분리된 이전 row·잘못된 ordinal·닫힌 controller는 거부합니다. point 선택만으로 native 값을 변경하지 않습니다. 실제 변경은 기존 폼의 적용 버튼과 setter/history/save 경로를 사용합니다.

값은 textContent로 표시해 markup을 실행하지 않으며 pre-wrap으로 줄바꿈/탭을 보존합니다. UI 페이지 상태만 소유하고 getChart provider에서 현재 응답을 다시 읽습니다. 문서/차트 재조회 중에는 목록을 지우며 close에서 listener와 DOM을 정리합니다.

## 구현·검증 경계

문서 재열기 실패 후 이전 차트 대상/초안이 남는 문제를 통합 테스트 실패로 재현했습니다. chart-controls의 load/unlock 응답은 이전 targets·points·초안·capability/정책 안내를 즉시 초기화하며 기존 request serial 폐기로 늦은 이전 조회를 거부합니다. 새 세션에서 이전65번 선택이 아닌 첫0번 값으로 시작하는 것도 검사했습니다. 이 수정과 최신 표/폼·실제 Worker/Canvas·CFB 정책/암호 retry 회귀는 같은 `50cabdb0…` 후보에서14/14 exit0(2322.771917ms)이고 정적491모듈·JS 문법·diff 공백도 통과했습니다. 새 실패 경로의 실제 브라우저 확인과 전체 제품 반영은 별도이며 DOM 테스트를 그 증거로 확대하지 않습니다.

후속 controller 통합 검사는 기존 Worker/Canvas 회귀와 함께10/10 exit0(1510.022917ms)입니다.130개 값의 두 번째 페이지에서65번 선택→폼 값/초점 이동→편집 요청 없음→적용 시 정확한65번 generic setter 요청→canonical 원값 불변→응답 재조회 중 표 제거→최신 값/같은 선택/페이지 복원·분리된 이전 row 거부·busy/close를 확인했습니다. DOM은 테스트 대역이며 새 표의 실제 브라우저 선택/저장 증거는 아닙니다.

통합 테스트의 의존성 범위를 다시 확인했습니다. 순수 chart-controls는 이미 공개한 chart-point-label/table만 import하고 native/Worker/app 모듈을 import하지 않습니다. 따라서 controller와 표 통합 테스트를 같은 커밋에 포함해 fresh checkout의 누락 import를 방지합니다. 데모 app/HTML 연결과 native ABI·기본 WASM 승격은 이 순수 UI 모듈 커밋에 포함하지 않습니다. 앞선 로컬 보류와 실제 데모 연결 완료는 구분합니다.

로컬 chart-controls/index.html에서 표를 기존 폼과 연결했습니다. UI 모듈·표 테스트의 독립 공개와 이 연결의 제품 반영은 구분합니다. 표는 계열 행렬을 추측하지 않으며 직접 다중 셀 편집·계열 추가/삭제·차트 렌더링을 구현한 것은 아닙니다.

`node --test tests/hwpx/chart-point-table.test.mjs tests/hwpx/chart-controls.test.mjs tests/hwpx/chart-current-canvas.test.mjs tests/hwpx/chart-current-worker.test.mjs`에 역할 후보 WASM SHA256 `50cabdb019974d12a6545d44281cf51cbabb86df5d987e185b41a11b3ccc2c24`를 명시한 실행은9/9 exit0(1443.050042ms)입니다. 표 검사는130값의 모든 페이지/마지막2개·미지원 값·분리된 row·빈/음수/분수/지수/범위 밖/불안전 ordinal·busy·현재 응답 교체·값 불변·close 반례를 포함합니다. 기존 실제 Worker/WASM 및 Canvas 대역 회귀는 통과했으나 그 검사는 새 표의 실제 브라우저 선택을 수행하지 않습니다.

JS 문법·diff 공백·정적491모듈 연결도 통과했습니다. 현재 후속은 새 표의 실제 브라우저 선택/저장·데모 app/HTML와 native 연결 코드 커밋·제품 승격이며 기존 폼의 browser 검증을 새 표 선택 증거로 확대하지 않습니다.

# 픽스쳐 읽기 요청의 수명

## 로컬 파일 선택값과 픽스쳐 전환

실제 Chromium에서 로컬 파일 업로드 뒤 픽스쳐를 열어도 `#file.value`에 이전 `C:\fakepath\charshape.hwpx`가 남는 것을 재현했습니다. 서버 픽스쳐가 현재 문서 원본이 된 뒤에도 네이티브 선택란이 이전 로컬 원본을 가리키는 상태였습니다. 이 관측과 운영체제의 파일 선택 대화상자 동작 검증을 구분합니다.

유효한 픽스쳐 클릭에서만 기존 요청을 취소한 뒤 `input.value = ""`로 네이티브 선택을 비웁니다. 일반 업로드의 change/close/잘못된 픽스쳐 선택에서는 값을 비우지 않습니다. loader·generation·Worker 경로를 추가하지 않습니다. 같은 원본을 다시 선택할 수 있는 선택 상태를 복원하며, OS 대화상자를 직접 자동화했다고 주장하지 않습니다.

`/tmp/hwpjs-zig017-current-fixtures.xouwd1/fixture-source-before-browser.jsonl/.stderr`는 `FixtureOpenMustClearPreviousLocalFile`에서 exit1이고 실제 이전 경로가 남았습니다. 소유 브라우저/서버는 cleanup에서 종료했습니다. 수정 후 `fixture-source-fixed-browser.jsonl/.stderr`는 value 빈 문자열·FileList 길이0을 확인하고 입력/undo/redo/독립 XML·ZIP/다운로드/재업로드까지 exit0·stderr0·cleanup.success=true입니다. 스킬의 격리 세션/실제 입력/종료 확인을 사용했습니다.

단위/서버/파일 선택/브라우저 인자 네 파일의 `fixture-source-units.log/.stderr`는19/19·fail/cancel/skip0·exit0·stderr0입니다. 새 두 회귀는 유효/잘못된 픽스쳐 선택의 구분과 새 로컬 선택값을 취소/close에서 지우지 않는 반례입니다. 본문 취소·동일성·이력 검사는 유지합니다. 기본 WASM과 외부 데모 서버는 교체하지 않았습니다.

커밋 후보 트리 `77c86f88196621aeb3df13e4d4afbafe1ba03019`의 JS/web/tools를 `/tmp/hwpjs-fixture-source-clean.OO5DvW`에 추출하고 실제 charshape 원본을 복사한 격리 검사에서도 집중13/13·skip0과 실제 브라우저 왕복이 exit0으로 통과했습니다. 이 검사는 게시 소스 Zig0.17 WASM `afb7fdfbbc8a9c9cc45a7cdb98ade6be7a6a88b1943e1c5354c63d6715b9e05e`를 명시했으며, `browser.jsonl/.stderr`의 verified=true·stderr0·cleanup.success=true를 확인했습니다. 격리 소스와 실제 작업 트리 모두에서 같은 파일 선택 해제 경계를 검사한 것이며 모든 문서·편집 명령 지원을 뜻하지 않습니다.

## 원인과 책임

픽스쳐를 연속 선택하는 재현에서 fetch 두 개 모두 취소 signal이 없었습니다. 기존 app의 generation 검사는 늦은 결과가 새 화면/Worker를 덮어쓰는 것을 막지만 HTTP 요청 자체를 중단하지는 않습니다. 화면 덮어쓰기 버그로 확정한 것은 아닙니다.

`fixture-controls.mjs`가 선택된 지연 파일 하나당 AbortController를 소유합니다. 다음 유효 픽스쳐 선택, 실제 파일 input의 change, close에서 이전 signal을 취소합니다. 알 수 없는 선택은 새 문서가 아니므로 진행 중 요청을 취소하지 않습니다. close는 멱등이며 자신이 등록한 버튼/input 리스너만 제거합니다. app은 input을 전달할 뿐 기존 generation·Worker 생성·오류 표시 정책을 유지합니다. bfcache의 persisted pagehide에는 기존처럼 close하지 않습니다.

파일의 arrayBuffer 호출 전에는 HTTP를 시작하지 않습니다. fetch 시작 전·헤더 수신 후·본문 읽기 후 signal을 확인하여 취소된 지연 파일이나 abort를 무시하는 transport의 늦은 HTTP 오류/본문도 반환하지 않습니다. 현재 요청의 404 안내·다른 HTTP 오류·64 MiB 한도는 유지합니다. 본문을 전부 읽은 뒤 크기를 검사하는 기존 한도이며 스트리밍 다운로드 메모리 제한 구현으로 해석하지 않습니다.

회귀는 별도 `tests/hwpx/fixture-request-lifetime.test.mjs`에 분리하고 정규 HWPX gate에 등록합니다. 이전 미커밋 fixture-controls 테스트를 이 커밋에 포함하지 않습니다. 명령은 [개발·검증 명령](development-commands.md)의 실제 웹 왕복/guard 항목을 따릅니다.

## 검증

`/tmp/hwpjs-zig017-current-fixtures.xouwd1/fixture-lifetime-body-browser.jsonl/.stderr`는 후보 `f4e0f396a3fea6e6354b364ff176e31d72ed00ec643fa566c4abbd8bc2f58d77`의 실제 Chromium 검사이며 exit0·stderr0·cleanup.success=true입니다. 응답 arrayBuffer 하나를 브라우저 경계에서 지연시키고 실제 파일 input으로 다른 열기를 시작해 controller 취소, 이전 Worker 미생성, 새 문서 오류 없음, 후속 picker 입력·이력·독립 XML/ZIP·다운로드/재업로드를 확인했습니다. 지연 대역을 사용한 수명 검사이지 실제 저속망의 전송량 측정이 아닙니다. 브라우저/서버 모두 종료했습니다. 기본 WASM과 Tailscale 서버는 교체하지 않았습니다.

최초 `fixture-lifetime-browser.jsonl/.stderr`는 fetch 함수를 로더 초기화 뒤에 가로채려 해 지연이 적용되지 않았고 wait 타임아웃으로 exit1입니다. cleanup에서 소유 브라우저와 서버는 종료됐습니다. 이 도구 실패를 제품 회귀나 후속 통과로 바꾸지 않습니다. 후속 검사는 제품 fetch 함수 선택을 바꾸지 않고 Response의 본문 읽기 경계를 지연시킵니다.

최종 집중 네 파일은 `fixture-lifetime-final-units.log/.stderr`에서17/17·fail/cancel/skip0·exit0·stderr0입니다. 요청 교체/종료, 지연 시작 전 취소, abort 무시 transport의 늦은 본문·HTTP 오류, 잘못된 선택의 비간섭, 현재 요청의 HTTP/크기 오류와 재시도를 포함합니다. 새 수명 회귀 자체는5개이며 기존 서버/파일 선택/브라우저 인자 검사를 합쳐17개입니다.

별도 커밋용 인덱스의 소스만 추출한 `/tmp/hwpjs-fixture-lifetime-clean.mzpAlb`에서도 새 수명/브라우저 인자 두 파일11/11·exit0·stderr0입니다. main 소스의 Zig0.17 WASM `afb7fdfbbc8a9c9cc45a7cdb98ade6be7a6a88b1943e1c5354c63d6715b9e05e`로 실행한 `browser.jsonl/.stderr`는 실제 지연 본문 취소·픽스쳐 입력/저장 왕복과 소유 브라우저/서버 종료 모두 성공·exit0·stderr0입니다. 이 사본에는 실제 charshape 원본만 복사했으며 전체 카탈로그 파일의 UI 검증으로 확대하지 않습니다. 원래 미커밋 fixture-controls 테스트는 보관 tar의 SHA256과 동일함을 확인했습니다.

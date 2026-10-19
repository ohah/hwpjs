# 픽스쳐 읽기 요청의 수명

## 같은 로컬 파일의 재선택

`file-input-events.mjs`는 change 콜백이 File 객체를 동기적으로 확보한 뒤 네이티브 선택값을 비웁니다. 이후 동일한 경로를 다시 골라도 change가 발생합니다. 초기화 전에 선택된 파일도 같은 경로를 사용하고 File의 비동기 바이트 읽기는 계속 유효합니다. 콜백 실행 중 다른 File 선택으로 대체됐다면 이전 콜백이 새 선택을 비우지 않습니다. 초기 콜백 실패에도 이전 선택값이 남아 재시도를 막지 않습니다. app의 빈 선택은 generation/Worker/편집 상태를 초기화하기 전에 반환하므로 빈 change가 현재 문서를 버리지 않습니다.

2026-10-19 새 `file-input-repeat.test.mjs`는 수정 전6개 중5실패/1통과·exit1을 재현했습니다. 수정 후 primary의 새/기존 파일 선택·픽스쳐 수명/응답·브라우저 인자5파일44/44·skip0·exit0·stderr0입니다(`/tmp/hwpjs-hwpx-nav-verification.Pfxh5x/file-repeat-after.log`). 분리 소스 `/tmp/hwpjs-file-repeat-publish.v9GrGT`에서는 게시된 수명/인자와 새 재선택3파일을 별도로 실행했습니다. 초기화·동일 경로 두 번·비동기 File 수명·재진입 선택 보존·초기 실패·빈 선택 guard를 검사하며 운영체제 파일 대화상자나 실제 브라우저 재선택 완료와 구분합니다. 이전 비추적 테스트 파일은 이 변경에 포함하지 않습니다.

재선택 최종 분리 검사도38/38·실패/cancel/skip0·exit0·stderr0입니다. `clean-regression.log` SHA256은 `90ea6a600cadfe3974675d0f427908a59231cdf3f777592290114ed2be081a04`이며 분리 build.zig의 Zig 포맷 검사도 통과했습니다. app의 무관한 미커밋 변경을 포함하지 않습니다.

공통 `document-menu-roundtrip.mjs`는 실제 로컬 업로드 뒤 value/FileList가 비었는지 확인하고 같은 경로를 다시 upload하여 두 번째 load와 새 세션을 요구합니다. 실제 편집 뒤 빈 change 이벤트를 주입해 선택·입력·요청 수·저장/undo 가능 상태가 유지되는지도 검사합니다. 빈 이벤트는 앱 경계의 음성 대조이지 OS 파일 대화상자 취소 자동화가 아닙니다. 파일 이벤트 모듈도 소스 해시 대조에 포함합니다.

2026-10-19 분리 소스의 실제 Chromium 검사 `clean-browser-repeat.log/.stderr`는 같은 파일 재열기·빈 change 보존·메뉴/입력/이력/저장 단축키·독립 XML/ZIP·다운로드·재업로드·소유 브라우저/서버 종료까지 exit0·stderr0·cleanup.success=true입니다. 로그 SHA256은 `a819873487af2056ff5edb775e94678adac16c8121a7f7b6280a0bdf69d64580`입니다. 소유 `hwpjs-menu-mnemonic-dd71c21a1b0e`는 inactive/pid=null,58863 listener도 없고 `reopened.png`를 직접 확인했습니다. 같은 분리 소스의 새/기존3파일은39/39·skip0·exit0·stderr0입니다.

기본 Tailscale10000 실행 `real-browser-repeat.log/.stderr`는 초기 준비의55초 대기에서 실패해 기능 검증에 도달하지 못했습니다. cleanup에서 소유 브라우저를 종료했고 외부 서버는 변경하지 않았습니다. 이 실패를 로컬 통과로 덮거나 원격 재선택 통과로 소급하지 않습니다. 모듈 준비 실패의 원인은 추가 네트워크 진단이 필요합니다. 로그들은 `/tmp/hwpjs-file-repeat-publish.v9GrGT`에 있습니다.

## 로컬 파일 선택값과 픽스쳐 전환

실제 Chromium에서 로컬 파일 업로드 뒤 픽스쳐를 열어도 `#file.value`에 이전 `C:\fakepath\charshape.hwpx`가 남는 것을 재현했습니다. 서버 픽스쳐가 현재 문서 원본이 된 뒤에도 네이티브 선택란이 이전 로컬 원본을 가리키는 상태였습니다. 이 관측과 운영체제의 파일 선택 대화상자 동작 검증을 구분합니다.

픽스쳐 컨트롤 자체는 유효한 픽스쳐 클릭에서만 기존 요청을 취소한 뒤 `input.value = ""`로 네이티브 선택을 비웁니다. 이 컨트롤의 일반 업로드 change/close/잘못된 픽스쳐 선택 처리는 값을 비우지 않습니다. 일반 파일의 전달 후 선택 초기화는 위 파일 이벤트 경계가 별도로 소유합니다. loader·generation·Worker 경로를 추가하지 않습니다. 같은 원본을 다시 선택할 수 있는 선택 상태를 복원하며, OS 대화상자를 직접 자동화했다고 주장하지 않습니다.

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

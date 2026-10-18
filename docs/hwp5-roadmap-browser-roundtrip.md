# 로드맵 HWP의 실제 브라우저 재검증

## 입력과 실행

e9d24ba4의 동결 JS/web/tools/tests 사본 `/tmp/hwpjs-hwpx-public-current.pbeDpJ`에서 `HWPJS_TEST_WASM=/tmp/hwpjs-unknown-anchor-probe.1MV5w4/candidate/bin/hwpjs.wasm node tools/hwp5-reference-browser-audit.mjs --case=roadmap --port=58851`을 실행했습니다. `roadmap-current-browser.jsonl/.stderr`는 exit0·stderr0·browser-audit-complete.success=true입니다. 후보 SHA256은eaaa0d2007a2e02fce27335e6218379284108e756e285d4859cad28167d0fe5f이며 기본 WASM/외부 데모는 변경하지 않았습니다.

원본은 `reference/rhwp/samples/issue5941/1490000-201600081_roadmap_research.hwp`, SHA256 a06f46ec3f175c7cfa84eb3178b8b3fbdf78e94f71b31d7d87f3417a2617dae9입니다. section0/paragraph5에 실제 Chromium의 trusted beforeinput/input으로 문자를 삽입하고 undo/redo·다운로드·재업로드를 확인했습니다. 독립 CFB 검사로 전체 Section 텍스트와 비대상 stream/metadata를 비교하고 틀린 기대 문자열이 거부되는지도 확인했습니다. 저장 SHA256은d7a030c6ef07a92ce55e7ef7d5fc25fd9125e277e03bf5ea03aaaf4906ed9985입니다.

## 화면과 종료

캡처/사본은 `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-reference-browser-tbUHif`에 있습니다. 재업로드 캡처도 직접 확인했습니다. 해당 캡처의 현재 viewport만으로 편집 대상 문단의 문자열까지 보인다고 주장하지 않습니다. 대상 텍스트는 Worker 응답과 재열기 독립 검사로 확인합니다.

소유 session hwpjs-reference-roundtrip-6d000ad15b68은 cleanup의 browserClosed/serverExited=true 이후 session info에서 active=false·pid/runtime=null이며58851 listener도 없습니다. agent-browser 스킬의 격리 세션·실제 입력·소유 브라우저 종료 흐름을 따랐으며 다른 세션은 닫지 않았습니다.

## 남은 페이지 배치 제한

화면은 HWP5 5.0.3.4·10,128문단·표시 한도에 따른 부분 미리보기이며 IncompleteHwp5PageNumberControls를 표시합니다. 같은 동결 Worker를 다시 조회해 pageControlSourceErrors의 section6/Hwp5PageControlOwnerMismatch를 확인했습니다. `attachHwp5PageControls`는 모든 구역의 제어를 조회하지만 표시된 문단에서 정확히 하나의 비잘림 소유자를 찾지 못하면 오류를 남깁니다. 표시 한도 밖 제어의 소유자를 추측하거나 그 구역의 번호 의미를 생략해 전체 조판을 성공 처리하지 않습니다.

이는 한 문단의 실제 편집/저장 증거이며 전체 구역·원본 페이지 조판·물리 IME·모든 편집 명령 완료는 아닙니다. 조회 오류를 없애기 위해 미리보기 한도나 보호 검사를 무조건 해제한 변경도 없습니다.

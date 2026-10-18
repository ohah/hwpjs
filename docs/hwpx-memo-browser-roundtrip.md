# HWPX 메모 라벨 실제 브라우저 왕복

## 공통 도구의 후속 검증

브라우저 실행·입력·이력·저장·종료는 `tools/browser/field-label-roundtrip.mjs`를 [제목 책갈피 검사](hwpx-title-field-browser-roundtrip.md)와 공유합니다. `field-label-cases.mjs`만 대상 원본·좌표·oracle을 소유합니다. 기존 메모 CLI/명시 후보·추가 인자 거부 정책은 유지하며 미지/프로토타입 사례 이름도 브라우저 설정 전에 거부합니다. 실패 로그는 마지막 완료 단계와 최근 Worker 관측을 보존하며 실패를 자동 재시도로 감추지 않습니다.

1ad19b14의 동결 소스 `/tmp/hwpjs-title-field-browser.ioRYFw`에서 공통 도구를 재검사했습니다. 첫 `memo-shared-browser.jsonl/.stderr`는 redo 대기 중 CDP 연결 닫힘으로 exit1이고 원인은 확정하지 못했습니다. 다음 `memo-shared-browser-retry.jsonl/.stderr`는 실제 splice/revision1까지 확인했지만 screenshot 저장의 ENOSPC로 exit1입니다. 두 실패를 제품 redo 오류나 통과로 분류하지 않았고 각각 소유 브라우저/서버의 종료를 확인했습니다.

종료된 검증의 전용 Zig 캐시351MiB/304MiB만 lsof·컴파일러 부재 확인 후 정리했습니다. 원본/소스/로그/WASM/native 바이너리는 보존했고 캐시는 재빌드로 재생성할 수 있습니다. 여유 공간 확보 후 `memo-shared-browser-space-retry.jsonl/.stderr`는 exit0·stderr0·verified=true·browserClosed=true·serverExited=true입니다. 후보2589a92e5e53b0fa222d373f78cba64900a1ae623f19a9c4ea6195df1290634c, 원본5e27ee51825d10f0f51bd04935f0f9f8fc24f930a010367d822638964fefd491, 저장본f53eff30d1b82c3fcdfca660d370701d4a00ea92570be0ea6eb2e6570657f6ca입니다. 입력·원본 undo·redo·독립 다운로드·재업로드를 모두 검사했으며 이전 c10의 저장본과 해시도 같습니다.

세션hwpjs-memo-roundtrip-f73653170389의 inactive와 port58861 listener 부재를 별도로 확인했습니다. `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-memo-browser-Rr5RMF/reuploaded.png`도 직접 확인했고 메모 라벨과 분리된 주석 본문이 남습니다. 공통 CLI/case/클릭/종료 guard12/12·skip0·exit0은 이 브라우저 실행과 별도입니다.

## 범위와 재현

`HWPJS_TEST_WASM=/absolute/frozen-candidate.wasm node tools/hwpx-memo-browser-audit.mjs`를 검증할 소스 루트에서 실행합니다. 추가 인자는 받지 않습니다. 별도 loopback 서버(port58861)와 worktree 전용 agent-browser 세션을 사용하며 활성 세션은 인수하지 않습니다. 점유된 포트의 기존 서버를 종료하지 않습니다.

대상은 `reference/rhwp/samples/hwpx/aift.hwpx`의 구역2 전역 문단3008(Worker 좌표3007), 원본 local 문단2694, MEMO ID2135782115입니다. [라벨 계약](hwpx-memo-label-edit.md)을 그대로 사용하며 메모 생성·삭제·스레드 UI·일반적인 한글 조판 동치를 증명하지 않습니다.

## 검증 경로

- 예상 WASM과 서버가 제공한 HTTP 바이트의 SHA-256을 대조합니다. 기본 WASM이나 외부 데모를 덮어쓰지 않습니다.
- 실제 Chromium에서 업로드·편집 시작·문단 창·찾기를 거쳐 대상을 선택합니다. 공유 click guard로 실제 hit target과 trusted click 전달을 확인합니다.
- 키보드로 caret을 시작 위치로 옮겨 한국어·emoji를 입력합니다. beforeinput/input의 `isTrusted`, Worker의 구역·문단·시작/끝 좌표와 화면 입력값을 검사합니다. 모의 DOM 이벤트 주입이 아닙니다.
- undo/redo 후 내려받은 HWPX를 독립 Python XML/ZIP oracle의 일반/`-O` 모드로 검사합니다. 주석 본문·작성자·비대상 XML과 ZIP payload/검사 대상 metadata의 보존을 확인합니다.
- 저장본을 다시 업로드하고 같은 문단을 찾아 표시값을 확인하며 입력·재업로드 화면을 캡처합니다. 원본 fixture 파일의 해시도 유지돼야 합니다.
- finally에서 전용 브라우저가 inactive가 될 때까지 확인하고 서버 종료를 기다립니다. 완료 로그는 성공적인 왕복과 양쪽 종료가 모두 있어야 success=true입니다. 로그는 공통 동기 JSONL writer를 사용합니다.

## 실측

`/tmp/hwpjs-formula-paragraphs.p5JzbK/memo-real-browser.log`의 첫 prototype 도구 실행은 exit0, verified=true, browserClosed=true, serverExited=true입니다. 후보 c10f3382b7a8872c0305f4b8e7537ff1359e3f2e1e93875681668f3b782757fd, 원본5e27ee51825d10f0f51bd04935f0f9f8fc24f930a010367d822638964fefd491, 저장본f53eff30d1b82c3fcdfca660d370701d4a00ea92570be0ea6eb2e6570657f6ca입니다.

첫 세션 `hwpjs-memo-c10-browser`의 inactive를 별도로 확인했습니다. `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-memo-browser-dKNciX`의 edited.png와 reuploaded.png를 직접 확인했으며 라벨 입력과 보존된 주석 행을 볼 수 있었습니다. 첫 도구에는 HTTP 바이트 대조/동기 로그가 아직 없었으므로 최종 도구의 증거로 바꾸어 기록하지 않습니다.

최종 도구의 재검사도 `memo-real-browser-final.log`에서 exit0, verified=true, browserClosed=true, serverExited=true입니다. 같은 c10/원본/저장 SHA-256을 확인했고, HTTP로 제공된 WASM 바이트도 대조했습니다. 세션 `hwpjs-memo-roundtrip-a6de91cc3307`의 inactive와 port58861 listener 부재를 별도로 확인했습니다. 최종 캡처는 `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-memo-browser-Zmn1Dw`에 있으며 재업로드 화면도 직접 확인했습니다. 두 실행은 같은 원본 한 곳의 반복 검증이지 다른 메모 유형 두 개의 coverage가 아닙니다.

명시 후보/잘못된 인자의 fail-fast, 공유 click/종료 guard의 단위 검사는9/9·fail/skip/cancel0·exit0입니다. 실제 브라우저 성공과 이9개의 음성/단위 검사를 합산하지 않습니다. 기본 WASM과 외부 데모는 교체하지 않았습니다.

실제 Chromium 키보드 입력은 OS IME 조합 입력 검증이 아닙니다. 화면은 현재 Canvas 표시이며 원본 한글 프로그램의 물리 쪽 배치와 동치라는 주장이 아닙니다. 전체 fixture 편집·최신 전체 native gate와 별도로 관리합니다.

# 실제 복합 문서의 Canvas 브라우저 왕복

명령: `HWPJS_TEST_WASM=/absolute/caption.wasm mise exec -- node tools/captioned-picture-browser-audit.mjs`.

이 도구는 caption ABI와 복합 페이지 조판 후보 JS가 함께 있는 작업 트리를 검사합니다. 기존 기본 WASM 또는 조판 연결 전 main 소스에서의 지원 완료를 뜻하지 않습니다. 후보 소스가 없으면 `CaptionPreviewSourceRequired`로 세션 생성 전에 거부합니다. 참조 `reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx`가 필요합니다. 잘못된 인자·명시적 후보 누락도 세션 생성 전에 거부하며 `tests/hwpx/caption-browser-arguments.test.mjs`로 검사합니다.

전용 loopback58884와 비활성 worktree-scoped 세션만 사용합니다. 기존 default 브라우저·기본 데모/원격 서버는 건드리지 않습니다. 모든 경로에서 소유 브라우저를 닫아 inactive를 확인하고, 자기 서버의 exit를 확인합니다. 다운로드/스크린샷은 임시 출력 폴더에 보존합니다.

업로드→실제 페이지 배치→편집 시작→찾기 UI로 원본30번 문단 선택→그려진 caret 좌표의 Canvas hit 확인→실제 마우스 hover/I-beam 및 trusted pointerdown→키보드로 문단 시작 이동→한글/emoji prefix 입력을 검사합니다. DOM selection/value를 대입하거나 Worker 요청을 대신 만들어 편집하지 않습니다. 허용되는 eval은 상태 관측·수동 이벤트 witness 설치이며 입력은 실제 브라우저 포인터/키보드에서 발생합니다. 최종 splice의 section/paragraph/UTF-16 위치·텍스트와 trusted input을 대조합니다.

실제 undo/redo 버튼, 다운로드, 독립 전체 XML/ZIP 검사(normal/-O), 잘못된 marker의 두 모드 거부, 저장 파일 재업로드와 원래 문단 재선택까지 확인합니다. 기존 `hwpx-anchor-prefix-oracle.py`를 재사용하며 별도 제품 파서를 oracle로 만들지 않습니다. 원본 문단 텍스트는 실제 Worker 표시 모델에서 관측합니다. 이 문단의 anchorText 조회는 구조 필드 보호로 거부되므로 잘못된 API 사전 조회를 사용하지 않으며 보호 정책도 완화하지 않습니다.

agent-browser0.31.1/Chrome155에서 후보 WASM SHA256 `b59f67c71105c93e4745cd9d5b172d45636939ddc06b4b636e4ca2a1769271e2`로 실제 완료했습니다. 원본/재업로드 모두 측정5페이지이며 그림6/6·해독6·실패0·대기0입니다. 저장 SHA256은 `c52f341a5fbd58ea4d6db7e716138fa2888fdbcec45e072fad0db13ba1b45fad`입니다. 최종 화면에는 정렬 간격 미지원5줄이 명시돼 있으며 원본 한글과의 페이지/픽셀 동치 또는 OS IME 검증으로 확대하지 않습니다. 고정8px Worker 검사의4페이지와 실제 브라우저 글꼴 측정5페이지도 구분합니다.

실제 pointer를 추가한 첫 시도는 CLI가 소수 좌표를 받지 않아 실패했고 브라우저/서버 정리는 완료했습니다. UI 기하를 수정한 것이 아니라 브라우저 커서 좌표를 정수 픽셀로 정한 뒤 hit를 다시 검사해 재실행했습니다. 최종 성공 출력은 `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-caption-canvas-pCWV2K`에 있습니다. 도구 SHA256은 `ae29b27dc7914b5567ec97170feb6ec3132c0edb4a5bd90646a12f1658063a94`이며 선택한 주요15소스의 시작/종료 SHA256과 WASM 응답 hash를 확인합니다. 전체 source closure나 배포 완료를 주장하지 않습니다. 별도 HEAD 추출 게시 소스의 CLI 계약1/1도 통과했지만 그 소스에서 복합 브라우저 배치까지 통과했다고 합산하지 않습니다. 기본 WASM은 교체하지 않았습니다.

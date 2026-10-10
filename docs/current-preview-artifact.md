# 현재 데모 WASM

고정 측정 페이지 배치의 전체 CFB 파일 범위·미지원 집계는 [페이지 감사](promoted-page-corpus.md)가 소유합니다.

반영 후 전수 prefix 편집의 파일별 집계와 거부 경계는 [기본 픽스쳐 재검증](promoted-fixture-edit-audit.md)이 소유합니다.

2026-10-10 기본 `zig-out/bin/hwpjs.wasm`과 외부 HTTPS `/zig-out/bin/hwpjs.wasm`은 SHA256 `7e70bbc74b7665553cd4f7e1b6a90aeb81a2e14c6c705e332d0ddac495e645e8`입니다. 외부 HTTP200·해시 일치·WebAssembly.compile 성공을 확인했습니다. 기존 브라우저는 새로고침해 Worker/WASM을 다시 로드해야 합니다.

직전 `f38c60ad10344e982e95dbfc5662d03f161add1a02caffe84e64617a01efb760` 사본은 `/tmp/hwpjs-core-ui-promotion-backup.TsKDoQ/hwpjs.wasm`입니다. 원본/후보 해시 guard, 정규 단일 링크 파일 확인, exclusive 백업/stage 복사와 같은 폴더 rename으로 반영했습니다. 임시 백업을 삭제하면 해당 복구 사본도 사라집니다. 서버/Tailscale 설정은 교체 과정에서 변경하지 않았습니다.

후보는 게시 UI tree `57fe8f8b56f37dfbf3e8b3aaceee70b94665b594`의 별도 ReleaseSafe 빌드입니다. Canvas/Worker 집중215/215, 암호·하이픈·불투명 도형 꼬리·HWPX 제목·정확 수식7파일13/13·skip0·exit0을 확인했습니다. 실제 loopback Chromium HWPX 입력/undo/redo 근거는 [UI 게시 검증](canvas-ui-publication.md)이 소유합니다. 암호 저장은 명시적 동의 후 평문 저장이며 재암호화가 아닙니다.

진행 중인574파일 public gate와 native3838 gate는 다른 artifact/snapshot입니다. 이 후보의 전체 실행으로 합산하지 않습니다. HWP5/HWPX 모든 원본의 모든 편집 명령·원본 조판·외부 GUI 전수·OS IME·미지원 객체 의미는 아직 미완료입니다.

교체 후 후보 환경 변수 없이 기본 경로의 하이픈·도형 꼬리·Worker·다운로드4파일13/13·skip0·exit0을 추가 확인했습니다. 전체 기본 artifact 전수 검증으로 확대하지 않습니다.

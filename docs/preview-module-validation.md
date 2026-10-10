# 미리보기 모듈 검사

정적 연결 검사는 코드 본문을 실행하지 않고 app·Worker·HWP5/HWPX API의 상대 import/export를 확인합니다.

```sh
node --experimental-vm-modules tools/preview-module-link-audit.mjs
node --test tests/hwpx/module-link-audit.test.mjs
```

별도 후보는 첫 인수로 저장소 루트를 전달합니다. 필요하면 그 뒤에 상대 진입점 목록을 전달합니다. 외부 import와 루트 밖 경로는 거부합니다. 순환 참조는 정상 연결해야 하고 누락 파일/export는 실패해야 합니다. 동적 import·브라우저 초기화·WASM ABI·편집·조판을 검증하는 명령은 아닙니다.

실제 제공 응답은 별도로 확인합니다.

```sh
node tools/preview-module-audit.mjs http://127.0.0.1:8080
```

이 명령은 app/Worker의 literal 상대 import 경로를 선택해 HTTP 상태·JS MIME·로컬 원문 해시를 대조합니다. 네트워크에서 읽은 코드를 실행하지 않습니다. 브라우저에서의 실제 픽스쳐 열기와 Canvas 입력은 별도 검증입니다.

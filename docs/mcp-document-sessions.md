# MCP 문서 읽기 세션

이 계약은 개발 중인 MCP 후보에 적용하며 npm 0.1.1에 추가 도구가 배포됐다는 뜻이 아닙니다. 기존 파일 기반 도구와 별도로 원본 스냅샷의 Native 문서를 서버 안에 유지해 반복 읽기의 재열기를 피합니다. 새 파서나 별도 편집 모델을 추가하지 않습니다.

## 수명과 제공 범위

`open_document_session`은 HWP5/HWPX 파일의 입력 스냅샷과 WASM을 기존 파일 호스트·엔진으로 열고 서버가 발급한 불투명 sessionId를 돌려줍니다. `read_document_session`은 같은 열린 문서를 기존 문서 모델·text/Markdown 렌더러로 조회합니다. `close_document_session`은 핸들을 닫고 Native 자원을 해제합니다.

이번 세션은 읽기 전용입니다. sessionId를 기존 `apply_document_changes`나 `edit_document`에 전달하거나 열린 문서에 편집을 누적하는 기능은 제공하지 않습니다. 기존 SDK 편집 세션의 undo/redo·선택 상태를 MCP로 공개한 것도 아닙니다. 세션 조회는 열린 시점의 스냅샷이며 디스크 파일이 이후 바뀌어도 자동 갱신하지 않습니다. 다른 파일을 읽으려면 새 세션을 엽니다.

핸들은 해당 서버 인스턴스에만 유효합니다. 닫힌 핸들·다른 서버의 핸들·허용되지 않은 추가 인수는 오류로 처리합니다. 서버 종료 후 핸들을 재사용할 수 없습니다. 문서 본문은 기존 도구처럼 text/Markdown으로 반환하고 세션 ID·원본 SHA 같은 제어 메타데이터만 구조화합니다.

## 자원과 실패 경계

기본 동시 세션은 4개, 각 입력은 64MiB, 예약과 열린 세션의 입력 바이트 합계는 128MiB로 제한합니다. 입력 예약은 비동기 열기가 끝나기 전에 적용해 동시 요청이 한도를 우회하지 못하게 합니다. 이 수치는 입력 크기 제한이며 파서 전체 heap/RSS 상한을 증명하지 않습니다. 한 읽기 응답은 16MiB로 제한합니다. 같은 문서의 읽기가 진행 중이면 다음 읽기는 `DocumentSessionBusy`로 거부하며 무제한 대기열이나 Native 관측 scope 교차를 만들지 않습니다.

실패한 열기는 Native 자원과 예약을 해제하고 핸들을 공개하지 않습니다. 열기·읽기가 진행 중인 상태에서 close나 서버 종료가 오면 새 사용을 막고 진행 중인 작업과 Native 수명을 조정해야 합니다. async 조회가 끝나기 전에 Native를 해제하지 않으며 종료 이후에 완료된 열기도 새 세션으로 게시하지 않습니다.

OCR 실행 권한은 [기존 보안 계약](ocr-process-security.md)을 그대로 유지합니다. 세션 입력으로 실행파일·경로 교체·임의 편집을 허용하지 않습니다.

## 검증 결과

집중 source 검사는 44개 중 40개 통과, 기존 Native820 선택 검사 4개는 환경 미지정으로 skip했습니다. 세션 전용은 22개이며 같은 문서의 1,000개 겹친 읽기를 Native 추가 호출·대기열 생성 전에 거부하고 후속 읽기 가능 상태를 확인합니다. 수명 검사는 동시 open 예약·실패/한도 해제·close 중 읽기 lease·EOF 중 pending open·연결/등록 실패·타 서버/닫힌 핸들 거부·출력 한도를 포함합니다. strict TypeScript와 대상 파일 Oxc lint/format 검사도 통과했습니다.

격리 SDK의 strict 선언 빌드와 설치 파일 126개 바이트 비교 뒤 실제 설치 패키지의 CLI/MCP E2E 2개, OCR 보안 E2E 2개, 세션 E2E 1개가 통과했습니다. 세션 검사는 Noori HWP5/HWPX 각각 text/Markdown × content/structure의 반복 읽기를 기존 파일 도구와 정확히 비교하고, 테스트가 소유한 파일 사본을 변경해도 열린 스냅샷 결과가 유지됨을 확인했습니다. 다른 서버·추가 인수·close 후 거부도 확인했습니다. 사용자 원본 fixture는 변경하지 않았습니다.

최종 JS는 `dist-bounded2`, 설치 패키지는 `consumer-bounded2.json`에 고정했습니다. 사용한 기존 WASM SHA256은 `c0d688139661d54f65fddf34a940e2aefbd8af9bb17513d82b52d3b470e8dba1`이며 코어 파서 교체나 전체 브라우저 검증이 아닙니다. 원자료는 `zig-out/verification/mcp-document-sessions-r1/`의 `verified-focused.log`, `verified-typecheck.log`, `verified-build.log`, `consumer-bounded2.json`, `verified-installed-{services,ocr,sessions,snapshot}.log`와 각 설치 증거 디렉터리입니다. 처음의 기존 16개 카탈로그 기대값 실패와 중간 패키지 디렉터리 충돌은 보존하고 통과 결과에서 제외합니다. 공개 npm 게시·main 푸시·데모/문서 배포는 하지 않았습니다.

 실행 명령은 [개발·검증 명령](development-commands.md)이 소유합니다.


## API 레퍼런스

MCP 전송·스키마·연결 종료는 설치된 공식 Model Context Protocol TypeScript SDK의 server/stdio 계약을 사용합니다. 문서를 한 번 열고 반복 조회하는 사용 흐름은 rhwp 0.9.0의 `hwp_open`·`hwp_doc_text`·`hwp_close` 공개 API와 비교했습니다. 해당 서버 코드를 복사하지 않고 hwpjs의 기존 파일 호스트·Native 엔진·문서 모델에 별도 수명 관리자를 연결했습니다. rhwp의 편집 누적·save 도구까지 이번에 지원한다는 뜻은 아닙니다.

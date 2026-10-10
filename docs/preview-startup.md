# 미리보기 초기화 상태

HTML은 `bootstrap.mjs`를 로드하고 bootstrap은 app을 dynamic import합니다. `preview-startup.mjs`는 loading/slow/ready/failed 생명주기만 소유합니다. 파일 입력과 픽스쳐 열기는 ready 이전에 비활성입니다.15초 지연은 실패 판정이나 로드 취소가 아니며 기존 import를 중복 실행하지 않습니다. 늦은 정상 완료는 ready로 전환하고 정리 후 타이머는 상태를 되돌리지 않습니다. 실패와 지연에서는 다시 불러오기 버튼을 제공하며 새로고침은 페이지의 전체 초기화를 다시 시작합니다.

모듈 오류 텍스트는 기존 failureMessage를 재사용하고 textContent로 표시합니다. 이 계층은 문서·Worker·편집 상태를 만들거나 parser 오류를 다른 의미로 재분류하지 않습니다. 파일 선택 안내가 앱 준비 실패를 감추던 문제를 보완합니다. bootstrap 파일 자체의 전송 실패까지 자동 복구하는 구현은 아닙니다.

2026-10-10 외부 Chromium 초기화25초 시간 초과 때129 script 요청 중 `picture-body-content-layout.mjs`에 응답 상태가 기록되지 않았습니다. 이것은 pending/관측 누락을 구분하지 못하는 증거이며404·HTTP2·서버 root cause를 확정하지 않습니다. 브라우저를 종료했습니다.

unit2/2·skip0·exit0은 지연 후 정상 완료·중복 load 방지·늦은 timer·동기 throw/비동기 reject와 정리를 검사합니다. 실제 로컬 Chromium 정상103옵션/입력 활성과 app 요청을 차단한 실패 반례에서 오류 안내·retry 표시·파일/픽스쳐 입력 비활성을 확인했습니다. 모델을 직접 설치하지 않고 agent-browser 스킬의 준비 조건 및 네트워크 차단을 사용했으며 브라우저 두 세션을 종료했습니다. 외부468모듈 HTTP/MIME/원문 해시도 모두 일치했습니다. 외부 앱 초기화·모든 픽스쳐 UI·원본 조판 완료와는 별도입니다.

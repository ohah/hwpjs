# HWPX 폼 LF 멀티라인 화면

HWPX 폼 텍스트 편집의 Canvas 연결을 설명한다. Native/SDK/CLI/MCP writer와 schema를 추가하지 않고 기존 formText/setFormText와 Core input lease를 재사용한다. 이 화면 연결 자체는 Native ABI를 추가하지 않는다.

지원 profile은 HWPX edit_box, source multiLine=true, 고정 Native width/height, autoSz=false, wordWrap=false, 유효 inline owner·font·색·drawFrame이다. 현재 문자열은 LF만 줄 경계로 사용하며 CR/CRLF·tab 또는 미지 multiLine/layout flag는 화면 입력 대상으로 확대하지 않는다. combo와 HWP5의 기존 단일행 경로는 유지한다. Native가 지원하는 모든 입력/문서를 Canvas가 지원한다고 주장하지 않는다.

기존 checkbox inline geometry의 동일 font resolver에서 fontHeight를 받아 명시 줄의 행 간격으로 사용한다. 별도 폰트 모델·unit codec을 만들지 않는다. 원본 Native frame을 늘리지 않으며 frame 안의 보이는 명시 행만 그려 잘라낸다. 이 화면 배치를 한컴의 전체 form typography/shaping과 동일하다고 주장하지 않는다.

여러 줄 편집은 textarea/wrap=off를 사용한다. Enter는 줄바꿈, Ctrl+Enter 또는 Cmd+Enter는 기존 한 번의 form-text 요청으로 적용, Escape는 취소다. composition 중 Enter는 적용하지 않는다. UTF16 예산·XML/Native permission/maxLength·source lifetime/history는 기존 계층이 검사한다. Source metadata/font/flags를 변경하거나 자동 폭·높이 보정을 하지 않는다. 브라우저 textarea의 CR 정규화로 원문을 잃지 않도록 CR profile은 아직 입장시키지 않는다.

실제 Native observation으로 geometry·guard·클리핑과 public Core 단일 이력/undo/redo/save/reopen을 검사했다. Vanilla/React/Svelte actual pointer/textarea/Enter/Ctrl+Enter/Escape, Native 상태0→1, 저장의 독립 XML normal/-O와 줄바꿈을 지운 wrong-text 반례도 구분한다. 기존 R3 단일행 edit라도 source multiLine=true이면 textarea와 Ctrl/Cmd+Enter 동작으로 노출한다. multiLine=false인 edit와 combo의 Enter 적용은 그대로다.

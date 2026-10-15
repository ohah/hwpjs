# HWPX 생성 셀의 텍스트 XML

`src/hwpx/created_cell_text_xml.zig`는 생성 셀의 UTF-8 텍스트 중 LF만 `<hp:lineBreak/>`로 직렬화합니다. 나머지는 공통 `xml/text_writer.zig`에 위임하여 Unicode·XML 문자 검증, escaping, CR의 `&#13;` 보존을 공유합니다. `created_table_xml.zig`는 이 결과를 기존 셀의 한 문단/한 run/hp:t 안에 넣습니다. 일반 XML text writer나 원본 셀의 저장 정책을 바꾸지 않습니다.

근거는 로컬 HWPX 명세 `legacy/rust/.claude/skills/hwpx-spec/10-8-t-요소.md` 표182와 `E-paralist-xml-스키마.md`의 t/lineBreak 정의입니다. RHWP `src/serializer/hwpx/section.rs`도 문단 안 LF를 lineBreak 요소로 출력합니다. Tab의 폭·형식이나 특수 공백의 출처를 이 모듈에서 추측하지 않습니다. 모든 특수 문자/여러 문단/서식 있는 셀의 완전한 작성 구현을 뜻하지 않습니다.

출력 바이트 한도는 escaping과 요소 길이를 포함합니다. 중간 오류/OOM에서 임시 버퍼를 해제하며 호출자가 반환 버퍼를 소유합니다. 문자열 안의 `<hp:lineBreak/>`는 요소로 실행하지 않고 escaped 문자로 남깁니다. 선행·연속·후행 LF와 CRLF의 CR은 각각 보존합니다. UI에서 CRLF를 LF로 정규화하는 정책은 이 저장기의 책임이 아닙니다.

현재 작업 트리의 ReleaseSafe 집중6/6(root 포함)에서 모든 부족한 출력 한도, 정확한 한도/빈 입력, Unicode/escaping/CR·잘못된 scalar/금지 문자/잘린 UTF-8, 생성 표 전체 작성의 할당 실패, 실제 생성 셀 Session 저장·재열기·undo/redo를 확인했습니다. native/JS/UI capability 배포는 별도이며 기존 기본 WASM에 수정이 들어갔다고 소급하지 않습니다.

## 게시 코드 분리 검증

HEAD 의존성에 이번 저장기/네이티브 회귀만 적용한 `/tmp/hwpjs-cell-xml-publication.quEZYe/tree`에서도 ReleaseSafe native6/6·실패0·exit0, ReleaseSafe 제품 빌드5/5단계 성공을 확인했습니다. 생성 WASM SHA256은 `3fd772657124a144131bed2b650a2738848592c2d4cf92cebe0a89e9cbe1b799`입니다. 최초 제품 빌드는 추출 목록에 js/abi-schema가 없어 실패했으며, HEAD의 js 의존성을 추가한 뒤 다시 성공했습니다. 그 실패를 통과로 계수하지 않습니다. Session 테스트의 기존 allocation_failures helper 변경은 이번 게시에 포함하지 않았고 HEAD의 원래 할당 실패 검사로도 통과했습니다.

같은 분리 WASM에서 새 `tests/hwpx/created-cell-xml.test.mjs`와 기존 table-creation의 정확한2파일5/5·실패/skip/cancel0·exit0을 확인했습니다. 새 검사는 네 셀의 선행/연속/후행 LF·CRLF·CR·emoji·XML 모양의 일반 문자열을 실제 공개 API로 입력하고 독립 Python ZIP/XML로 요소 개수/태그·한 문단 유지·정확한 문자열·비대상 멤버/목록 보존을 확인합니다. 저장 재열기·5회 undo 원본 바이트·5회 redo 저장 바이트도 비교합니다. 수정 전 기본 WASM에서 같은 검사가 XML lineBreak 자식 검사에 실패하는 부정 대조를 확인했습니다. 새 검사는 hwpx-text-audit 목록에도 등록합니다.

로컬 softline02 후보의 Canvas→Worker Shift+Enter/여러 줄 붙여넣기 검사1/1도 통과했지만 게시 저장기와 별개의 미게시 UI/capability 연결을 포함합니다. 기본 WASM·외부 데모·실제 브라우저를 이번에 교체하거나 실행하지 않았습니다. 최신 native 전체 전수·모든 fixture·조판 동치 완료의 증거가 아닙니다.

## 선택적 capability와 Canvas 입력 연결

후속 연결은 native `hwpx_edit_created_cell_soft_line_breaks()`가 정확히1을 반환할 때만 `supportsCreatedCellSoftLineBreaks()`를 참으로 봅니다. 생성 표 표시 snapshot과 셀 paragraph에 `softLineBreakAvailable`을 파생 전달하며 원본 native snapshot은 변경하지 않습니다. capability가 없거나0/2/boolean이면 여러 줄 UI 입력을 변경 요청 전에 거부하고 한 줄 입력은 유지합니다. 이전 단락의 '미게시 UI'는 해당 검사 시점 기록이며, 아래 게시 범위는 이 연결을 포함합니다.

Canvas `replaceSelection()`은 생성 셀을 source paragraph 치환으로 보내지 않고 기존 identity/row/column의 `created-cell-text` 거래로 전달합니다. 선택 범위는 기존 UTF-16 snap 규칙을 쓰고 CR/CRLF를 LF로 정규화합니다. Shift+Enter 및 `beforeinput:insertLineBreak`를 한 native 문단 안의 LF로 처리합니다. 일반 Enter로 여러 문단 작성은 아직 지원하지 않습니다. 원본 셀의 문단 분할 기능과 별개입니다.

HEAD 의존성+이번 정확한 hunk만 분리한 WASM SHA256 `b1b2ba3250474ff6cda9294f57b91d42d7ddfa336db764626d20f1a69d3fc96d`에서 ReleaseSafe 제품 빌드5/5단계 성공·fmt 통과입니다. 새 Canvas softline/표 snapshot/독립 XML/기존 표 생성/본문-노트 혼합/기존 노트 표의 정확한6파일20/20·실패/skip/cancel0·exit0입니다. emoji 범위 치환·pending 거부·줄나눔 두 이벤트·구형 capability 거부·잘못된 Unicode/native NUL 거부 뒤 셀/저장/redo 보존·저장 재열기와 다른 셀 불변을 검사합니다. 새 Canvas 검사는 hwpx-text-audit에도 등록합니다.

이 빌드는 다른 로컬 field/chart/currentReference 확장에 의존하지 않는 게시 범위를 검증했습니다. DOM/Canvas 이벤트 대역이며 새 브라우저·디바이스는 실행하지 않았습니다. 기존 기본 WASM을 교체하거나 데모 서버를 승격하지 않았고, 모든 fixture/서식/원본 조판/최신 native 전수 완료로 주장하지 않습니다.

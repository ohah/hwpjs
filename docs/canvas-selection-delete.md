# 선택 텍스트 삭제 메뉴

편집 메뉴의 `선택 텍스트 지우기`는 Canvas controller의 `deleteSelection`에 위임합니다. RHWP 참조의 delete 메뉴도 입력 핸들러에 위임하지만 객체 선택 삭제를 포함합니다. 이번 구현은 텍스트 선택만 대상으로 하며 표·그림·도형 객체 자체의 삭제 지원으로 해석하지 않습니다. 빈 caret에서 다음 문자를 삭제하는 명령도 아닙니다.

확정된 비어 있지 않은 선택과 편집 적격성이 있어야 실행됩니다. 기존 `settledSelection`·`selectionTextEditAvailable`를 복사/잘라내기/붙여넣기와 공유하며, 입력 draft·pending·history·IME·busy·close·보호 상태를 분리합니다. 삭제는 기존 `replaceSelectedText("")`가 단일 문단 splice 또는 여러 문단 교체 native 거래에 연결합니다. 값의 SSOT·저장·이력은 기존 native 세션입니다. 성공 요청 후 Canvas 입력 포커스를 복원하며 pending 중 중복 삭제는 거부합니다. 마지막 native 보호/소유권 검증은 그대로 유지합니다.

## 2026-10-11 검증

기본 WASM SHA256 `fe97aa698bcc1cdfef9bc75f3fcafc4941a3c0069724bc700f0a62923c48fc20`의 HWP5 parashape 표본에서 단일 삭제 한 거래·독립 전체 record/stream 대조·undo 원문/redo 저장본 byte-exact를 확인했습니다. 빈 caret·보호·busy·IME·close 및 pending 중 중복 요청 거부를 포함합니다. 기존 여러 문단 교체 검사에 menu-delete를 추가해 동일 native 저장/표시 기준으로 통과했습니다. 집중18/18, 메뉴/clipboard11/11이며 최종 Canvas 전체198/198·fail/skip0,2492.568625ms입니다.

agent-browser 스킬로 외부 데모에서 parashape.hwpx의 `문단 6` 검색 선택 후 메뉴 삭제를 실제 클릭했습니다. 빈 문단·undo 활성·변경 적용 상태와 activeElement=`canvas-input`을 확인했고 메뉴 실행 취소로 원문을 복원했습니다. 시작은 disabled 파일 입력의 준비 완료를 기다린 뒤 업로드했고 편집 시작 버튼은 도구의 내부 스크롤 영역에 노출한 뒤 클릭했습니다. 세션 `hwpjs-delete-menu`는 종료했습니다. 실제 HWPX 표본 한 개의 GUI 증거이며 브라우저 다운로드 XML/ZIP·전수 선택 조합·객체 삭제·원본 조판 완료는 별도입니다. 기본 WASM과 서버는 교체하지 않았습니다.

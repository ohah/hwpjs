# 미확정 표 플래그의 Canvas 편집 회귀

페이지 배치의 미지원과 셀 텍스트 편집 지원은 별개입니다. 미확정 TABLE 플래그를 삭제하거나 지원한 것으로 해석하지 않으며, 원본 플래그와 비대상 스트림을 저장에서 보존합니다.

`tests/hwp5/table-unknown-flags-canvas.test.mjs`는 실제 `table-bug.hwp`의 TABLE node453/1130/1796/1955에서 독립 레코드/셀 소유권으로 대표 scalar를 선택합니다. 각 표의 bit25 진단과 페이지 배치 실패를 먼저 요구한 뒤 실제 Canvas controller의 입력 이벤트가 Worker에 정확히 한 번의 원본 UTF-16 범위를 전달하는지 검사합니다.

실제 WASM의 저장 구역 전체를 독립 레코드 기대값과 비교하고 비대상 스트림·undo 원본·redo 저장본·재열기 텍스트/무편집 저장·입력 불변을 검사합니다. 공유 Canvas harness와 독립 레코드/셀 선택기를 재사용하며 테스트가 제품의 표 flags 해석기를 oracle로 사용하지 않습니다.

2026-10-19 격리 source `/tmp/hwpjs-flow-ui-publish.367rSf`에 이 테스트만 추가하고 후보 SHA256 `bacf2ef3cd5ed1b2cf5b2ffc9d50f755ae08092d4a52c9ccf6a264e936a7a9fc`로1/1·실패/skip0·exit0을 확인했습니다. 정규 editor API gate에도 등록합니다. 실제 Worker/WASM과 모사 DOM/Canvas의4대표 셀 검증이며 실제 브라우저/OS IME·전체 셀·원본 페이지 조판 동치는 아닙니다. 기존 동결 소스의 전체 gate 결과에 새 테스트를 소급해 포함하지 않습니다.

## Tailscale 후보의 실제 Chromium 왕복

같은 날짜 `https://macstudio.tailed42f2.ts.net:10001/web/preview/index.html`에서 실제 원본을 파일 선택하고 Canvas 편집을 시작했습니다. 찾기로 원본 문단262의 문자열을 선택한 뒤 실제 키보드 입력을 사용했습니다. Worker 관측에서 section0/paragraph262의 `[13,14)`를 `표입력😀`으로 치환하는 splice가 정확히1회이고 오류 없는 응답을 확인했습니다. 이 위치는 위 모사 검사의 대표 scalar `[0,1)`와 다르며 한 사례로 합산하지 않습니다.

최초 다운로드 요청은 동의 없이 `LayoutReflowRequired`로 거부됐습니다. 표시된 ‘원본 배치 정보 유지 저장 허용’을 직접 체크하고 다시 저장해 `/tmp/hwpjs-table-canvas-publish.EhN4M1/browser-edited.hwp`를 받았습니다. 독립 `expectedSection(original,262,13,14,"표입력😀")`와 전체 Section이 일치하고 스트림 목록 및 모든 비대상 스트림도 동일했습니다. 재업로드·편집 활성화·입력 문자열 찾기로 같은 문단262/선택`[13,18)`·`개인정보의 수집 및 이용표입력😀적`을 확인했습니다. 원본 배치 정보의 재계산이나 동의 자동 부여는 하지 않았습니다.

`browser-edited.png`를 직접 확인했습니다. agent-browser 소유 세션 `hwpjs-table-fallback-35c54947528a`는 close 후 재조회에서 active=false/pid=null입니다. 이 수동 Chromium 왕복은 한 셀 입력/동의/저장/재열기이며 실제 OS IME·브라우저4셀 전수·undo/redo·원본 조판 동치의 증거가 아닙니다. 페이지 배치는 여전히 `UnsupportedHwp5SectionNumbering`을 표시하고 논리 대체 화면을 사용했습니다.

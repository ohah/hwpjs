# HWPX 수식 후보의 실제 브라우저 검증

## 대상과 완료 경계

2026-10-11 로컬 미리보기 서버10009에 작업 트리 후보를 주입해 실제 Chromium으로 검사했습니다. 후보 SHA256은 `1e026c60f14315a6343453b486721eff6ef1be4a755a41cfca2d52b629c5310d`입니다. [수식 셀 계약](hwpx-formula-cell-scalars.md)의 공개 API 검증과 구분하며 기본 데모 WASM 승격/깨끗한 checkout/전체 fixture 검증은 아닙니다.

agent-browser의 실제 파일 선택으로 external BinData 파일을 열었습니다.2864문단 안내와 Canvas의 텍스트/표 표시, 편집 시작,67.83 검색/선택을 확인했습니다. 선택 후 활성 Canvas textarea가67.83/선택0..5인 것을 확인하고 키보드로70을 입력했습니다. 화면에서127.76을 검색해 계산된 표 합계가 강조된 것을 직접 확인했습니다. 페이지 exceptions/console 오류는 관측되지 않았습니다.

## 증거와 미검증

생성된 보고서·화면·영상은 `zig-out/verification/browser-formula/` 아래에 있으며 Git에 포함하지 않습니다. `recalculated-result.png`는127.76의 실제 Canvas 화면, `numeric-edit.webm`은 재업로드부터 입력까지의 과정입니다. 녹화 시작 후 업로드 상태가 초기화되어 처음 `numeric-edit.png`는 빈 상태이므로 성공 증거에서 제외했습니다. 같은 세션에서 다시 업로드하고 편집 준비 완료 후 검색을 반복했습니다.

실행 취소2회 후 검색에서67.83을 찾지 못했고 다운로드 도구도2회 Download was canceled를 반환했습니다. 다운로드된 파일이 없어 native 이력 복원과 화면/검색 갱신 또는 도구 동작을 분리 검증하지 못했습니다. 브라우저 undo/다운로드는 통과로 계수하지 않으며 아직 제품 원인으로 단정하지 않습니다. doctor는7pass/0fail, 페이지 오류는 없었습니다. 이 두 경계는 후속 재현·분석 대상입니다.

페이지에는 UnsupportedFloatingTableBody에 따른 논리 미리보기/표시 한도와 이미지 자원4실패가 명시됐습니다. 실제 원본 조판·전체 외부 이미지·OS IME/전수 편집을 검증한 것이 아닙니다. 해당 브라우저 세션은 종료했고 session info의active=false/pid=null을 확인했습니다. 다른 프로젝트의 브라우저는 건드리지 않았습니다.

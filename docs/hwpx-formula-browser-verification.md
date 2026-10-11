# HWPX 수식 후보의 실제 브라우저 검증

## 대상과 완료 경계

후속 단일 입력 세션에서는 실제 브라우저의 편집본 다운로드·undo 원문 전체 바이트 복원·redo 수정본 전체 바이트 복원을 확인했습니다. 아래의 이전 미검증/취소 관측은 이력이며, 이 성공을 전체 fixture나 연속 타이핑/OS IME 전체 검증으로 확대하지 않습니다.

2026-10-11 로컬 미리보기 서버10009에 작업 트리 후보를 주입해 실제 Chromium으로 검사했습니다. 후보 SHA256은 `1e026c60f14315a6343453b486721eff6ef1be4a755a41cfca2d52b629c5310d`입니다. [수식 셀 계약](hwpx-formula-cell-scalars.md)의 공개 API 검증과 구분하며 기본 데모 WASM 승격/깨끗한 checkout/전체 fixture 검증은 아닙니다.

agent-browser의 실제 파일 선택으로 external BinData 파일을 열었습니다.2864문단 안내와 Canvas의 텍스트/표 표시, 편집 시작,67.83 검색/선택을 확인했습니다. 선택 후 활성 Canvas textarea가67.83/선택0..5인 것을 확인하고 키보드로70을 입력했습니다. 화면에서127.76을 검색해 계산된 표 합계가 강조된 것을 직접 확인했습니다. 페이지 exceptions/console 오류는 관측되지 않았습니다.

## 증거와 미검증

### 후속 단일 입력과 다운로드 왕복

같은1e026c 후보를 제공하는 서버에서 새 진단 세션을 열고 파일 선택→편집 시작→67.83 검색/선택→insertText70을 한 번의 입력으로 수행했습니다. 내려받은 `single-input-edited.hwpx`는 독립 전체 XML/ZIP/Decimal 검사와5변조 거부를 일반/-O 모두 통과했습니다. 저장 상태에는 다운로드 요청 완료가 표시됐습니다.

이름 기반 undo 클릭은 성공 응답을 반환했지만 Canvas 상태/입력은 바뀌지 않았습니다. 최신 snapshot에 있는 실제 버튼 ref를 클릭하자 Canvas 상태가 이력 적용으로 바뀌고67.83이 복원됐습니다. 이때 내려받은 `single-input-undone.hwpx`는 원본220379바이트 전체와 일치했습니다. 같은 방식으로 실제 redo 버튼을 클릭해70이 복원됐고 `single-input-redone.hwpx`는 처음 수정본2135341바이트 전체와 일치했습니다. 브라우저의 성공 클릭 응답만으로 native 이력이 실패했다고 해석하지 않습니다. 이름 기반 클릭이 반영되지 않은 정확한 내부 원인과 이전 녹화 세션의 download cancellation 원인은 아직 단정하지 않습니다.

증거는 같은 생성 폴더의3개 다운로드 파일과 `screenshots/single-input-undone.png`입니다. 해당 세션도 종료했고 browserLaunched=false/pageCount0을 확인했습니다. 페이지 exceptions는 없었습니다. 이 검사는 원본 파일 한 개의 한 번 입력/undo/redo/저장 경로이며 원본 조판·전체 키 입력·모든 source field 편집을 입증하지 않습니다.

후속 [연속 입력 Worker 회귀](../tests/hwpx/formula-queued-history-worker.test.mjs)는 추적 chart 파일에서11.2 선택→7 입력 요청→첫 응답 전0 추가→70을 실제 Worker/WASM으로 검사합니다. 첫 응답이 대기 입력을 지우지 않아야 하고, 미응답 입력/이력 이동 중 추가 undo 요청은 거부합니다. 두 native checkpoint를 undo해7과11.2를 복원하고 원문 전체 ZIP 바이트 일치, redo 두 단계 저장본 일치 및 중간 bad 입력의 원자적 거부/redo 보존을 확인했습니다. 독립 전체 XML/Decimal 검사도 일반/-O에서 적용했습니다.

후보1e026c의 해당 회귀1/1·exit0(7355.124ms), 기본6a2512의 같은 회귀1/1·exit0(7206.561583ms)을 확인했습니다. DOM/Canvas는 대역이며 실제 브라우저나 external BinData 파일의 undo 실패 원인을 재현한 검사는 아닙니다. native/Worker의 연속 숫자 입력 이력이 이 표본에서 안정적이라는 분리 증거로만 사용합니다. Blob 다운로드는 기존 코드에서1초 뒤 URL 해제를 예약하므로 즉시 revoke를 원인으로 단정하지 않습니다. 브라우저 상태 메시지와 실제 다운로드 이벤트의 추가 대조가 필요합니다.

생성된 보고서·화면·영상은 `zig-out/verification/browser-formula/` 아래에 있으며 Git에 포함하지 않습니다. `recalculated-result.png`는127.76의 실제 Canvas 화면, `numeric-edit.webm`은 재업로드부터 입력까지의 과정입니다. 녹화 시작 후 업로드 상태가 초기화되어 처음 `numeric-edit.png`는 빈 상태이므로 성공 증거에서 제외했습니다. 같은 세션에서 다시 업로드하고 편집 준비 완료 후 검색을 반복했습니다.

실행 취소2회 후 검색에서67.83을 찾지 못했고 다운로드 도구도2회 Download was canceled를 반환했습니다. 다운로드된 파일이 없어 native 이력 복원과 화면/검색 갱신 또는 도구 동작을 분리 검증하지 못했습니다. 브라우저 undo/다운로드는 통과로 계수하지 않으며 아직 제품 원인으로 단정하지 않습니다. doctor는7pass/0fail, 페이지 오류는 없었습니다. 이 두 경계는 후속 재현·분석 대상입니다.

페이지에는 UnsupportedFloatingTableBody에 따른 논리 미리보기/표시 한도와 이미지 자원4실패가 명시됐습니다. 실제 원본 조판·전체 외부 이미지·OS IME/전수 편집을 검증한 것이 아닙니다. 해당 브라우저 세션은 종료했고 session info의active=false/pid=null을 확인했습니다. 다른 프로젝트의 브라우저는 건드리지 않았습니다.

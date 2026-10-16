# 포맷별 동의 항목 노출

`hwp5-consent-visibility.mjs`가 HWP5 전용 checkbox의 적용 가능성·label.hidden·disabled를 투영합니다. HWP5에서는 준비 여부에 따라 비활성화하되 경고/동의 문구는 보여 줍니다. HWPX·미선택·알 수 없는 포맷에서는 label 전체를 숨기고 checked를 해제합니다. HWP5 처리 중 상태는 동의를 해제하지 않습니다. 실제 명령의 range policy나 stale-layout 저장 권한 판단을 이 모듈로 옮기지 않습니다.

range-policy-controls는 기존 prepare/reset과 이 투영을 연결하며, editor-controls.loaded가 문서 로드 직후에도 노출을 갱신합니다. app의 updateSave도 같은 함수로 stale-layout 항목을 투영합니다. HTML은 두 label을 hidden으로 시작합니다. 포맷 상태를 DOM에 별도로 캐시하거나 타이머로 추정하지 않습니다.

2026-10-16 strict3파일16/16·fail/skip/cancel0·exit0(3720.046375ms)입니다. 초기 HTML, HWP5 준비/처리 중 동의 보존, HWPX·null·unknown 숨김/해제, HWP5→HWPX 실제 editor-controls 로드 전환, 기존 명시적 range policy 비변경·splice 경계, 공통 저장 준비/IME 차단과 표 도구 회귀를 검사했습니다. 실제 Chromium의 두 포맷 전환은 아직 미확인이고 초기 다운로드 안내 문구 갱신은 별도 미해결 항목입니다.

초기 다운로드 안내는 이후 [다운로드 상태 계약](canvas-document-download.md)의 전용 투영 함수로 수정했습니다. 후속 실제 HWP/HWPX 저장 회귀를 포함한22개 검사도 통과했으나 실제 Chromium 포맷 전환 검증은 여전히 별도입니다.

이후 실제 Chromium 포맷 전환도 확인했습니다. 정상4d8e900d 후보와 최신 UI를9140에서 제공하고 응답 WASM SHA를 대조했습니다. 초기 미선택은 숨김/비활성/미동의, HWP5 로드는 표시/비활성/미동의, enable 뒤는 표시/활성입니다. 두 항목을 실제 check 명령으로 체크한 뒤 HWPX로 전환하면 숨김/비활성/체크 해제이고, 다시 HWP5를 열면 미동의 상태로 표시됩니다. 확인에는 agent-browser 스킬의 실제 파일 업로드·클릭·체크·스크린샷·소유 세션 종료를 사용했습니다.

증거는 `/tmp/hwpjs-consent-ui-XPTByZ`입니다. 세 포맷 단계의 다운로드 초기/시작 안내도 [세션 안내 계약](editor-download-session-guidance.md)대로 확인했습니다. errors=[]·browserCloseStatus=0·serverExited=true이며 다른 프로젝트 브라우저는 종료하지 않았습니다. 이 세 파일 전환 검사를 전체 편집 UI·원본 조판 완료로 확대하지 않습니다.

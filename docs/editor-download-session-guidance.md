# 편집 세션 다운로드 안내

`download-session-status.mjs`는 성공한 enable 응답에 대한 안내만 소유합니다. app은 renderer.show와 direct.message 이후 호출하며, 입력 처리 완료 전 다운로드 가능하다고 단정하지 않습니다. load/save/splice·실패 enable·content 없는 enable은 현재 안내나 저장 실패 문구를 덮어쓰지 않습니다. 실제 save-controls/native 권한은 변경하지 않습니다.

배포용 제한적 편집·배포 플래그/재조판, 비밀번호 보호 해제, CFB 보정본/undo 기준 경고는 함께 유지합니다. 포맷별 checkbox 노출은 [동의 항목 투영](editor-format-consent-visibility.md)의 별도 책임입니다.

2026-10-16 정상4d8e900d 후보의 strict3파일22/22·fail/skip/cancel0·exit0(6634.686708ms)입니다. 성공/실패 안내 경계·경고 유지·기존 동의/저장 준비/IME 차단, 실제 parashape HWP/HWPX 편집본 Blob의 native close 후 재열기·속성/바이트 보존을 검사했습니다.

동일 후보의 실제 Chromium에서 parashape.hwp→parashape.hwpx→parashape.hwp를 순차 업로드했습니다. 세 번 모두 로드 후 초기 안내·성공 enable 뒤 세션 시작/입력 완료 조건 안내·다운로드 버튼 활성화를 확인했습니다. 증거는 `/tmp/hwpjs-consent-ui-XPTByZ/verification.json`과 step-0-hwp.png·step-1-hwpx.png·step-2-hwp.png입니다. HWPX 화면을 직접 확인했습니다. errors=[]·browserCloseStatus=0·serverExited=true입니다. 이는 세션 안내/포맷 전환 검사이며 새 편집본 저장·한글 조판·모든 문서/UI 완료의 증거가 아닙니다. 기존 실제 저장 검사는 위 native/이전 브라우저 저장 결과와 구분합니다.

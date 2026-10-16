# 문서 구간 도구 접기

문서 구간 입력은 기본 닫힌 native details#document-window-options 안에 둡니다. 현재 표시 범위/한도 안내인 document-window-status는 summary에 있으므로 접힌 상태에서도 보입니다. 열림 상태는 DOM만 소유합니다.

기존 form/입력/명령/status ID는 하나씩 유지하며 app/controller는 변경하지 않습니다. 표시 구간 조회·편집 권한·저장 모델을 복제하지 않습니다. HTML 배치/명령 단일성은 tests/hwp5/document-window-disclosure.test.mjs가 검사하고 기존 HWPX document-window-controls 회귀를 함께 실행합니다. 이 변경 후 실제 브라우저 geometry 검증은 별도입니다.

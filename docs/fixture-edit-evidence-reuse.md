# 픽스쳐 감사 체크포인트

오래 걸리는 편집 왕복을 검사기 수정 때마다 반복하지 않도록, 완료된 독립 검증의 기록만 재사용합니다. 재사용은 새 검사기를 실행했다는 뜻이 아닙니다. 새 실행과 경로·실행 여부·증거가 생성된 실행 디렉터리·당시 소요 시간을 구분합니다. 이전 실패/미지원/취소 기록을 덮어쓰지 않습니다.

`tools/headless-fixture-edit-evidence.mjs`가 다음 조건을 함께 확인합니다.

- 이전 실행의 입력·WASM·검사 구현 불변 확인이 성공해야 합니다. 중간 체크포인트의 취소 자체는 이미 완료된 관측을 취소하지 않습니다.
- WASM, 제품 진입 번들 두 개, 데모 로더, 기존 독립 원문 검사기의 기록된 해시가 같아야 합니다. prefix 검사 도입 이후의 증거는 source 경로 분류기와 ZIP/XML prefix 검사기의 해시도 같아야 합니다.
- 입력 인벤토리와 결과의 경로·SHA256·개수가 일치해야 하며 중복 결과를 허용하지 않습니다.
- loaded/applied/selectedText/saved/undo/redo/reopened/exactResave/complete가 모두 성공해야 합니다. 정상 종료와 소유 프로세스 그룹 종료도 필요합니다.
- independentVerified와 sourceUnchanged가 참이어야 합니다. HWPX는 일반/최적화 모드와 잘못된 기대값 거부가 모두 있어야 합니다.

다른 WASM이나 다른 원문 검사기에서의 성공을 현재 버전의 성공으로 재분류하지 않습니다. 이 검사는 해당 실행의 한 삽입에 대한 증거이며 전체 소스 호환성·모든 명령·조판 검사를 대신하지 않습니다.

집중 테스트3개는 취소 체크포인트의 완료 관측 보존, 다른 제품·입력·종료 코드·불완전 lifecycle·음성 대조 누락의 거부, prefix-era 검사기 변경의 거부를 확인합니다. 실제 체크포인트에서 charshape는 재사용하고 example/footnote는 새로 실행한3경로 smoke가 통과했습니다. 이후 example과 대형 편람의 prefix 검증 증거2개도 새 실행 없이 올바르게 기록됐습니다. 근거는 `zig-out/verification/headless-edit-checkpoint-smoke`, `headless-edit-checkpoint-prefix-smoke`입니다.

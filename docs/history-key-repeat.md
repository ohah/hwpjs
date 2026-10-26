# 이력 단축키 반복

브라우저가 전달한 각 keydown마다 undo·redo를 한 번 접수합니다. 최초 keydown과 repeat=true인 후속 이벤트를 같은 순서의 이력 입력 큐로 처리하며, 별도 반복 타이머를 만들지 않습니다. keyup은 새 명령을 생성하지 않습니다. 이미 접수된 명령은 개별 Native ACK와 이력을 보존하며 완료합니다. 문서 교체·표면 해제는 기존 큐 세대 취소 계약을 따릅니다.

정확한 물리 코드·Mod 플랫폼·사용자 JSON binding을 먼저 해석합니다. undo·redo 이외 명령은 반복 실행하지 않습니다. 비활성/재지정된 기본키는 기존 Canvas나 UA 기본 이력으로 우회하지 않습니다. 조합 이벤트·keyCode229·AltGraph·일반 입력 요소·이미 defaultPrevented인 이벤트는 접수하지 않습니다. beforeinput도 이미 차단된 이벤트를 다시 처리하지 않습니다.

CDP autoRepeat=true의 trusted DOM 이벤트 검증은 물리 OS 키 반복 주기나 실제 OS IME 검증과 구분합니다. 이력 바닥에서는 no-op이며 후속 입력을 잃지 않아야 합니다.

명시 실행 경로는 개발·검증 명령 문서의 이력 단축키 반복 항목이 소유합니다.

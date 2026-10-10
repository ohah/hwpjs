# 생성 셀 선택 주소

공통 text geometry의 `sameParagraph`와 `paragraphTarget`은 source paragraph와 생성 셀의 서로 다른 주소를 구분합니다. 생성 셀 주소는 section·createdCell.identity/row/column이며 원본 paragraph 번호를 갖지 않습니다. `sameCreatedCell`이 비교 규칙을 소유합니다. hitText가 이 주소를 반환하고 caret/selection rect도 같은 비교기를 사용합니다.

생성 rows/paragraph views는 이 단계에서 selectable=true, editable=false입니다. Canvas 선택 시 renderer의 생성 셀 text view를 읽지만 native 일반 편집·서식 범위 주소를 합성하지 않습니다. `editRange`/`selectedRange`는 생성 셀에서 source 문단 query/서식 명령을 반환하지 않습니다. 직접 입력 전송과 draft는 다음 단계로 남아 있습니다.

2026-10-11 geometry/flow 집중4/4·exit0은 identity·row·column·source namespace 분리, 빈 셀 클릭의 소유권, surrogate 중간 caret 거부와 올바른 caret/선택 rect를 확인했습니다. 실제 Worker/renderer2/2·exit0(1356.037167ms)은 wide identity 생성·저장/history와 빈 생성 셀의 pointer 선택·읽기 전용 input·source 편집 요청 부재 및 simulated paint를 확인했습니다. 실제 브라우저 포인터/IME·generated cell 입력 성공은 아직 검증하지 않았습니다.

같은 JS 변경의 기존 Canvas editor/geometry/flow3파일 회귀는202/202·fail/skip0·exit0(2398.384416ms)입니다. 기존 Canvas editor는 현재 기본 WASM을 사용하고 생성 셀 geometry/flow는 순수 테스트입니다. 두 실행의 수를 합쳐 전체 fixture/브라우저 검증으로 해석하지 않습니다.

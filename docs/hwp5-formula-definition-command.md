# HWP5 수식 정의 명령 작성 기반

`src/hwp5/edit/formula_definition_command.zig`는 원본 field Properties, 새 UTF16LE 계산식, 현재 모델에서 새로 평가한 숫자 결과를 받아 소유 명령 payload를 만듭니다. 계산식은 선행 `=` 없는 기존 Range 문법이며4096바이트로 제한합니다. format·instance ID·other·미해석 attributes/extra는 원본을 보존합니다. 계산식이 달라지면 modified 비트를 설정하고, 표시 cache는 공통 `formula_command_writer`로 새 결과에서 파생합니다. 같은 식/같은 표시 결과의 no-op은 byte-exact입니다.

이 계층은 세션을 수정하거나 평가를 수행하지 않습니다. caller가 제어 ID/소유권·편집 권한·현재 모델의 의존성/범위와 예산을 검증해야 합니다. 임의 숫자를 계산 결과로 승인하는 공개 API가 아닙니다. 모델에 명령 바이트/표시 문자열 cache를 추가하지 않습니다. 표현식과 평가 결과를 단일 편집 상태로 조립하고 기존 저장 writer에서 파생해야 합니다.

2026-10-11 ReleaseSafe root 필터 `formula definition command`는4/4·skip0·exit0입니다. root 등록·기존 HWPX 정의 거래1개와 신규 HWP5 준비2검사를 포함합니다. 신규 검사는 전체 할당 실패 주입·새 결과/포맷·ID/불투명 꼬리/unknown attributes 보존·원문 불변·정확 no-op·잘못된 envelope 삽입/홀수 UTF16/비유한 결과/크기 제한을 검사합니다. 첫 실패2개는 테스트 factory가 지역 wire 버퍼 포인터를 반환한 수명 오류였으며 정적 보관으로 수정했습니다. 실제 원본 문서 편집 실패로 계수하지 않습니다.

포맷 검사와 별도 prefix `/tmp/hwpjs-formula-definition-prep-20261010`의 ReleaseSafe 빌드도 exit0입니다. 기본 데모 WASM은 바꾸지 않았습니다. 실제 HWP5 수식 정의 세션 거래·모델 clone/해제·의존 재계산·저장 재열기/독립 oracle·WASM/JS/Worker/Canvas 연결·원본 전수는 후속입니다. 이 기반 추가를 HWP5 계산식 변경 API 완료로 해석하지 않습니다.

# HWP5 고정 이력 reference

이 디렉터리는 공개 Noori HWP 한 파일에서 원래 V2 엔진이 생성한 고정 reference다. 현재 엔진으로 생성하거나 bless하지 않는다. 정규 테스트는 catalog와 content-addressed HWP 10개만 읽으며 Git·verification·old 엔진이 필요 없다. 입력 SHA와 요청의 모든 필드가 다르면 adapter가 명시 거부한다.

원 소스는 ac196c0720a438871af26228051bcd3e738e15c6의 명시 454파일과 별도 검증 helper 한 파일이다. 전체 source를 vendor하지 않는다. 개발용 `tools/fixtures/hwp5-history-reference-source.json`과 helper patch가 경로별 SHA를 소유한다. shallow clone의 정규 테스트는 옛 commit을 조회하지 않는다. 재생성 개발 환경에는 해당 commit과 Zig 0.17, 독립 CFB 검사용 olefile이 필요하며 자동 설치하지 않는다.

저장 reference는 요청9종·논리 상태13개다. old 실제 undo/redo 검증과 독립 CFB stream 목록·비대상 stream exact·변경 stream 레코드 framing/DEFLATE 검사를 통과했다. 독립 CFB 검사는 모든 서식 의미의 독립 재구현 검증이 아니다.

payloadCost는 CFB bytes와 별도 ABI 계약이다. aarch64-macos-none/native64 16654는 old 실제 실행 값이다. x86_64-linux-gnu/native64 16654는 old 구성 타입16개 크기·정렬 및 동일 size식에 근거한 공유 값이며 Linux runtime을 실행한 결과가 아니다. wasm32-freestanding-none 12666은 old Session.open→checkpointSize를 실행한 별도 진단 WASM/Node 실측이다. 제품 WASM은 바꾸지 않았다. 다른 ABI는 명시 거부하며 skip하지 않는다. wasm32의 payload 실패/저장도 후속 old 진단 WASM에서 직접 실행했다. cap12665는 init 오류 전파·revision미생성·splice미시도이고, cap12666은 apply 오류 문자열·revision0이다. 둘 다 저장 원문 SHA exact다. adapter는 정확 cost와 cost-1 두 키만 구분 지원한다. 다른 budget을 일반화하지 않는다.

개발 재생성의 첫 단계는 다음과 같다. 출력은 새 verification 경로만 허용한다.

```
python3 tools/regenerate-hwp5-history-reference.py --output "$PWD/zig-out/verification/h5-reference-regeneration-new" --run
python3 tools/finalize-hwp5-history-reference.py --execution "$PWD/zig-out/verification/h5-reference-regeneration-new" --output "$PWD/zig-out/verification/h5-reference-regeneration-new/catalog-output"
```

이 두 단계는 실행 host의 관측 target만 생성한다. committed 다중 ABI catalog를 재생성하려면 관측 복사본의 두 checkpoint 파일에 `pub const ReferenceBudgetState = State;`만 추가하고 `tools/fixtures/reference-budget-layout.zig`를 세 target에서 object로 컴파일해 내보낸 고정 magic 배열의 sizeof/align을 비교한다. 원 runtime 본문은 바꾸지 않는다. `tools/fixtures/reference-payload-wasm.zig`는 같은 old source의 메모리 전용 진단이며 `wasm32-freestanding -fno-entry -rdynamic --export-memory`로 별도 출력한다. `tools/read-hwp5-reference-payload32.mjs <실행디렉터리>`가 실제 값을 회수한다. 이 후속 관측의 결과·source SHA를 PROVENANCE에 기록한 뒤 명시 검토로 catalog를 합성해야 한다. target 값 자동 추정이나 current checkpointSize 대체는 제공하지 않는다. 변경된 catalog SHA는 adapter의 고정값과 함께 검토한다.

PROVENANCE/CFB-ORACLE/BUDGET-LAYOUT/PAYLOAD32-ACTUAL은 각각 출처·독립 구조 검증·타입 object 비교·32비트 실제 실행의 범위를 나눠 기록한다. 전체 Native 통합·실Linux runtime·성능/O(n) 충족 증거로 확대하지 않는다.

생성 도구의 보안 검사는 assert가 아니라 require/raise로 수행하며 Python -O에서도 유지한다. 원 final-r2 및 정상 golden은 이 후속 보강과 구분해 보존했다.

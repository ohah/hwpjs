# 문단 원자 서식 API

`getFormattingCapabilities`와 `queryFormatting`은 명시 호출 시에만 Native를 조회합니다. 기본 load/input/undo/save에는 capability 또는 formatting query를 추가하지 않습니다. 기존 cb48처럼 atomic export가 없는 실행물에서는 `AtomicFormattingUnavailable`을 유지하며 Native 교체를 요구하지 않습니다.

`APPLY_FORMATTING_PATCH_COMMAND`는 `{ target, selectionVersion?, patch: { paragraph } }`를 받습니다. target은 `createParagraphSelection` 등 기존 공개 생성 경로를 사용합니다. owner/ref 또는 Native binding을 사용자 입력으로 만들지 않습니다. 이 단계는 문단 필드만 공개하며 문자·reset intent는 포함하지 않습니다.

공개 타입은 `ParagraphFormattingPatch`, `FormattingPatch`, `ApplyFormattingPatchPayload`, `FormattingObservation`, `FormattingBinding`, `FormattingNativeTarget`, `FormattingQueryResult`, `QueryFormattingOptions`, `FormattingCapabilities`, `FormattingCapabilityOptions`입니다. `queryFormatting(target)`의 fields 누락은 지원 필드 조회, `{ fields: [] }`는 binding만 조회하며 같은 의미가 아닙니다. unknown/unavailable을 false 또는 빈 값으로 바꾸지 않습니다.

관측 조회는 core state identity와 token scalar를 바꾸지 않습니다. Native가 readonly 거부 이유를 제공하면 그대로 유지합니다. 공개 Core operationRevision과 Native history revision은 서로 다른 축입니다. Native 원자 쓰기 직전 session/revision을 검사하며 조회 뒤 바뀐 binding은 적용하지 않습니다. dispatch 뒤 projection이 실패하면 이미 적용된 사실을 보존하고 `committed-refresh-required`로 분류합니다. 자동 재시도하지 않습니다. 진단 읽기·메모리 정리 실패에서도 적용 사실을 보존하는 규칙은 [Native 편집 완료 판정](native-edit-completion.md)을 따릅니다.

## 조회 참조의 수명

Native `binding`과 `targets`는 동일한 조회 결과의 한 쌍입니다. `ref`는 열린 세션의 현재 문단 좌표이며 단독으로 보관하는 영구 문단 ID가 아닙니다. 이전 조회의 targets에 새 binding을 붙이면 현재 같은 순번을 차지한 다른 문단을 가리킬 수 있습니다. 공개 Core 서식 명령은 현재 선택을 검증하고 새로 조회한 binding과 targets를 함께 전달합니다. `queryFormatting`의 관측 결과를 이후 명령의 쓰기 권한으로 재사용하지 않습니다. Native 실험 API를 직접 사용하는 경우에도 서로 다른 조회·revision의 쌍을 섞지 않습니다.

HWP5 original.id는 원 record-node 식별자이고 현재 paragraph 인덱스와 별개입니다. 기존 selection 및 original-reference 검증을 재사용하며 original.id를 paragraph 순번으로 치환하지 않습니다.

정규 합성 회귀는 packages/core/tests/commands/paragraph-formatting-patch.test.ts의 28개입니다. 실제 Native H5/HX stale-binding 2사례와 기존 저장 oracle는 별도 증거이며 합성 결과에 포함하지 않습니다. 실제 Worker transport, 새 공식 producer/packed 소비자 검증은 아직 남아 있습니다. 실행 명령은 [개발·검증 명령](development-commands.md)의 문단 원자 서식 항목을 따릅니다.

# HWP5 history owner-window 계약

이 문서는 COW08을 기준으로 한 history owner-window candidate03의 계약과 최종 source 검증 범위를 기록합니다. 최종 제품13은 formatter를 적용한02 대비 Array.from 한 줄 보강을 포함하며, 03 자체의 실제 Native13·pure147 및 품질/strict 결과를 별도 연결했습니다. 최초 source와02는 보존합니다. source packet의 성공을 SDK/브라우저/운영 검증으로 자동 승계하지 않습니다.

[bounded owner-window COW](hwp5-owner-window-cow.md)의 splice projection 및 공개 full 호환 계약과 [기존 full-snapshot/history 실증](hwp5-full-snapshot-exclusive.md)을 재사용합니다. 원 COW08의 undo full·실브라우저/저장 결과를 이 후보에 자동 승계하지 않습니다. UI known-none/CompositionBlocked·SDK69 변경은 이 계약과 합성하지 않습니다.

## Native SSOT와 metadata hint

문서·undo/redo 이력·저장의 단일 권위는 Native 모델입니다. private history edge는 owner·revision 등 metadata만 보관하며 원문/역편집/undo snapshot을 JS에 복제하지 않습니다. metadata hint나 edgeToken만으로 편집권한·Native origin을 발급하지 않습니다. hint는 어느 owner를 현재 Native에서 다시 읽을지 제안하는 내부 입력일 뿐입니다.

기존 canonical runtime admission과 실제 module/context 검증을 통과해야 history-window 선호를 전달할 수 있습니다. 공개 Runtime.request는 full 경로이며 message 안의 caller 필드나 임의 JSON hint로 이 선호를 켜지 않습니다. Worker data helper는 관측 전달만 담당하며 local Module brand나 별도 issuer를 만들지 않습니다. custom/unknown runtime·module/code/platform은 기존 full fallback을 유지합니다.

## 실제 history 실행과 fresh 관측

1. controller는 현재 관측의 canonical context, scope·resource lease·sequence·operation revision·Native epoch/revision과 실제 reachable history metadata를 확인해 기존 private edge를 조회합니다. capture와 edgeToken을 내부 수명에 결합하되 외부 권위로 노출하지 않습니다.
2. Reader는 현재 Native revision과 대상 source/parent·reference/window를 읽어 hint의 before 상태와 맞는지 확인합니다. 힌트가 없거나 부적격이면 기존 full history 경로를 사용합니다.
3. 실제 Native undo 또는 redo를 **한 번만** 호출합니다. changed가 참이고 기대 Native revision이 맞을 때만 해당 owner의 reference·전체 bounded window·character ranges를 새로 읽습니다. source/parent, 증가한 epoch, window 길이·CR·UTF-16, 연속 range coverage·shape ID, 마지막 reference 재조회가 정합해야 합니다.
4. adapter는 실제로 읽은 packet에만 history-window origin을 연결합니다. core는 전후 editor/document/generation/request context·현재 sequence·epoch/revision·scope·lease를 재검증하고 실제 ACK의 reachable 목록으로 같은 edge를 다시 조회합니다. edgeToken이 capture 때의 값과 같고 현재 source 권위가 유지돼야 merge합니다. 중간 문서교체·dispose·재진입·lease/revision 변화는 과거 hint로 통과하지 않습니다.
5. 소유 immutable full baseline에서 대상 text/ranges와 필요한 reference epoch를 갱신하고 나머지 문단·자원 관측을 유지합니다. 대상 owner 유일성·plain subset 및 조립 후 관측을 다시 확인해 전체 EditorState를 설치합니다. 부분 owner만 남기는 view가 아닙니다.

기존 splice의 last_text_delta_receipt 조회·검증은 원 경로로 유지합니다. undo/redo용 receipt를 새로 합성하거나, 남아 있는 splice last delta를 새 history mutation의 Native 증거처럼 재사용하지 않습니다. history 텍스트는 역편집 계산이 아니라 실행 후 fresh Native window에서 읽습니다.

## 세 종류의 증거를 구분

| 이름 | 의미와 권위 경계 |
|---|---|
| Native exclusive-text receipt | 기존 Native splice가 발급한 실제 receipt. history-window용 새 receipt가 아님 |
| adapter origin history-window | 한 번의 실제 undo/redo 뒤 읽은 fresh 관측 packet의 검증된 전달 경로. Native exclusive receipt 발급이 아님 |
| controller evidence history-text | edge/capture·현재 Native 관측을 재검증한 controller 파생 증거. Native 모델/이력의 대체본이 아님 |

기존 history-text도 Native가 같은 이름의 receipt를 발급했다는 뜻이 아닙니다. 위 이름이 같거나 달라도 canonical context와 현재 edge/Native 상태 대조를 생략할 수 없습니다.

## 실패 후 refresh와 공개 호환

history mutation을 실행한 뒤 packet을 읽거나 검증하지 못하면 읽기 전용 full refresh로 현재 Native 관측을 회복합니다. undo/redo를 다시 실행하지 않습니다. refresh 실패/적용 불확실성은 기존 committed-refresh-required·recovery/poison 정책을 유지하며 rejected-unapplied로 거짓 분류하지 않습니다. 실제 Native known-no-op은 기존 no-op 계약대로 처리합니다.

공개 Runtime.request 응답은 full입니다. core 내부에서 history-owner-window packet을 소비했어도 호환 CommandResult.reply는 설치된 전체 content로 복원하며 public 소유 복사 비용도 남습니다. 외부 소비자가 부분 DTO를 전체 문서로 받거나 history hint/edgeToken을 public API로 사용하는 계약이 아닙니다.

후보는 COW08과 같은 exact d849 및 검증된 plain-owner subset에 한정합니다. 비적격/unknown schema·record·owner, 빈/제어 owner·clipped 관측, 지원 밖 자원 종속성 및 HWPX는 기존 full 경로를 유지합니다. Native history를 새로 복사하는 별도 후보 경로는 없지만, 기존 Native undo 내부의 할당·복사까지0이라는 주장은 아닙니다. Native ABI나 history 구현도 이 문서 작업에서 바꾸지 않습니다.

history-window 성공 뒤 private preview는 dirty로 표시합니다. 후속 명시 window/full 조회는 Native에서 preview를 갱신한 뒤 소비하는 기존 COW 수명 계약을 유지하며 JS preview를 저장 원본으로 쓰지 않습니다.

## 복잡도와 호출 계수의 범위

현재 선별 경로의 scoped 처리 범위는 O(P+S+U+R+E)입니다. P는 전체 문단/flow, S는 확인하는 shape 자원, U는 bounded owner UTF-16/window·range 처리, R은 reachable revision, E는 retained metadata edge 수입니다. 이 표기는 검증/관측 조립의 범위이며 Native 전체 history 작업·public full 복사·renderer reflow/Canvas paint·전체 입력 지연의 복잡도 증명이 아닙니다.

최종 source03 packet의 history-window 구간에는 명시 추가 Native getter9와 hwp5_edit_reflow7이 관측됐습니다. characterRanges 경로는 materializeLiveText도 호출합니다. 실제 undo/redo1회·full preview0은 Native 작업0이 아니며, 실제 재조판 횟수 최적화 완료나 reflow0을 뜻하지 않습니다. 전체 Native query0 또는 기존 COW08 splice 비용과 동일하다고 주장하지 않습니다. 정확한 명령 구간과 함수별 사전은 final03 scalar/log packet이 소유합니다.

## source03의 최종 검사와 실제/순수 구분

frozen-candidate-03 제품13과 최종 manifest의 SHA를 직접 대조했습니다. 제품13 lint(max-warnings0)·fmt 및 focused strict는 모두 exit0입니다. strict는 backend .mjs companion, Reader/Worker/data adapter/entry/private union과 공개 request의 세 번째 인자 거부 probe를 포함하며 skipLibCheck=false입니다. 이 검사와 뒤의 공식 SDK strict는 별도 범위입니다.

| source03 실제 Native 검사 | 사례 수 | 근거 범위 |
|---|---:|---|
| Noori p15/p4/p18 | 3 | splice→undo→redo 전체 Native DTO 동치 |
| 확대 | 6 | source40입력/40undo/40redo, owner/branch/no-op, 서식 fallback·회복, 실패 edit 재시도 없음, custom/unknown full·권위 거부 |
| lifecycle·선택·구조 | 4 | 접수 직후 dispose, load ABA old-token 거부, 현재 토큰의 선택 복원, 구조 edge full |
| 실제 합계 | 13 | 별도 로그3묶음. lifecycle5로 세지 않음 |

supplemental admission1은 기존 dispose 사례의 scalar 보강이므로 실제13에 더하지 않습니다. 접수 직후 dispose와 load ABA에서 Native undo는0회였으며, commit 이후 Native ACK를 강제로 지연시킨 실험은 아닙니다. 확대의120step은 source 호출 반복이며 trusted 키보드 burst나 UI latency 검사가 아닙니다. source undo/redo 각1회, full preview0·last receipt0 및 전체 compatibility reply 동치의 의미를 Native 작업0으로 바꾸지 않습니다.

pure147은 기존 helper108 + hint/branch/512/보존9 + controller/COW30으로 구분합니다. 이 합성 시험은 실제 Native 권위를 모킹해 인증한 것이 아닙니다. Carson의 별도02 Reader/Worker/음성/dirty-read/save19도03과 같은 SHA의 새 사례로 합산하지 않습니다.

### 음성 5라운드의 연결

| 라운드 | 주제 | 실제 Native와 순수 근거의 구분 |
|---|---|---|
| 1 | 접수 직후 dispose | 실제 supplemental admission 관측 + pure reset. predispatch/일반 lifecycle이며 강제 delayed ACK 아님 |
| 2 | load ABA/reset/old capture | 실제 load ABA old-token 거부 + pure reset/delayed capture |
| 3 | reentrant owner | 실제 Native 사례 없음. owner descriptor reset·외부 unowned Proxy의 pure 거부 |
| 4 | metadata out of date | 실제 branch/no-op/full 회복 + pure revision/controller/lease/context 불일치 |
| 5 | late publication/eviction | 실제 Native 사례 없음. pure late publication·512 edge·기존 reentrancy55 |

5라운드는 source 계약의 실제/순수 근거 분류입니다. 5회의 실제 브라우저 실행, 5개의 lifecycle Native 사례 또는 전부 실제 delayed ACK였다는 뜻이 아닙니다. 원 loader/ownership/scope·하네스/strict 실패는 최종 packet 설명대로 별도 보존하며 source03 성공으로 덮어쓰지 않습니다.

## 공식 SDK와 브라우저 예비값: 별도 후속 근거

메인 전달 기준 SDK03은 source 입력1205·공식 산출76files 및 official strict0으로 완료됐습니다. 이는 source03 packet 자체의 SDKBuild0/browser0과 다른 후속 단계입니다. 이 문서 작성에서 SDK 입력 전체를 재검증하거나 빌드를 재실행하지 않았으며 exact build packet은 별도 소유합니다.

별도 small4는 실제 A08/B03 조합의 burst와30Hz를 각 방식 한 번씩 비교한 예비값입니다. 전달된 재입력→최종 관측은 burst1314.5→789.6ms,30Hz107.2→54.0ms입니다. typed DOM40은 같은 관측값이며 해당 지표가 개선됐다는 주장도 하지 않습니다. 각1회·제한된 문서/조건의 요약으로 일반 성능이나 pixel 표시 시점 개선을 보장하지 않습니다. source13/pure147·음성5라운드의 통과와 이 브라우저 예비값은 서로 다른 근거입니다.

후속 Chrome full16은 Noori paragraph4/15 × burst/30Hz × A/B 각2회가 모두 통과했습니다. 재시도 없이 최종 text/caret·busy=false·trusted40/undo40/repeat39 및 소유 브라우저 종료를 확인했습니다. 각2회 평균 재입력→최종 marker 관측은 아래와 같습니다.

| 조건 | A: 배포 COW08 | B: history03 |
|---|---:|---:|
| p4 burst | 1293.1ms | 747.7ms |
| p15 burst | 1291.9ms | 753.1ms |
| p4 30Hz | 107.75ms | 53.6ms |
| p15 30Hz | 113.65ms | 54.05ms |

이는 같은 브라우저·font·DPR의 제한된 문서 표본이며 small4와 중복 합산하지 않습니다. CPU profiler는 껐고 low-timeline 계측은 양쪽에 동일 적용했습니다. Native ACK/private receipt 또는 물리적 pixel 표시 시점을 직접 측정한 결과가 아닙니다. B 저장4개는 원본에서 사전 계산한 section326 record·비대상12 stream·metadata와 독립 CFB oracle로 대조해 통과했습니다. 기존 COW08의 Chrome16/CFB와 새 history03의 full16은 별도 세대입니다. 공개 관측 identity·운영 배포와 외부 HTTPS 판정은 별도 확인합니다.

메인 통합의 정규 회귀는 Native/Worker·공개 음성25개와 소스/응답 shape 음성7개, 총32개가 통과했습니다. focused strict 및 공개2인자/내부 preference companion strict도 통과했습니다. 이32개를 source13/pure147에 합산해 독립 기능 수로 표시하지 않습니다.

## 불변 증거와 재현 경계

| 입력 | SHA256 |
|---|---|
| CANDIDATE-03-MANIFEST.json | `ee3180fb521a410e5f0de36ea23256fec6d12fe094526102a4af2d25b915d1b2` |
| FINAL-TEST-PACKET.json | `1ac3b759142c7935805bcf67e01f93ed434bad7cfc68dec343ae655f10332991` |

로컬 기준은 `zig-out/verification/native-history-owner-window-prototype-r1/`입니다. final packet의 연결 파일, actual13/pure147 로그와 scalar, 음성5라운드 및 원02/initial manifest는 독립 지문을 보존합니다. ignored packet은 source-only checkout에 포함되지 않으므로 문서 자체를 재현 gate의 대체물로 사용하지 않습니다. 실제 통합 시 current create-editor/helper WIP에는 최소 hunk만 적용하며 frozen source 전체를 덮지 않습니다.

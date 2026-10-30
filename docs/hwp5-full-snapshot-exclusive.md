# HWP5 full snapshot의 Native exclusive 증거와 warm 그림 재사용

이 문서는 정확한 d849 엔진 바이트에서 실증한 HWP5 연속 텍스트 편집 계약과, 그 증거를 소비하는 r1/r2 및 history r3 JS 검증의 범위를 기록합니다. 현재 등록은 **exact SHA와 아래 한정 exclusive 계약의 실증**을 기준으로 합니다. 재현 가능한 Native build manifest는 아직 확보하지 못했으며, 이 한계를 기능 실증과 별도로 기록합니다. 문서 게시나 엔진 한정 등록이 JS 후보·공식 SDK·운영 통합 완료를 뜻하지는 않습니다.

권위 읽기의 공통 경계는 [내부 기하 읽기 포트](native-geometry-internal-port.md)를 따릅니다. 공개 root API/DTO에 권위 발급 setter를 추가하거나, caller boolean·임의 receipt를 Native 증거로 인정하지 않습니다.

## exact 엔진과 실증 입력

| 구분 | SHA256 |
|---|---|
| d849 WASM | `d849a4b22357e62d2425c3f1632edc07f2948ac18ce6d97009aede9d2b6cb1eb` |
| Noori HWP5 | `b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f` |

r1/r2는 기존의 이 두 입력을 명시적으로 읽었습니다. 원 HWP 파일 추가 복사나 fixture 전체 탐색은 하지 않았습니다. 좌표는 section/현재 display paragraph/UTF-16 위치이며 Native record-node ID와 혼동하지 않습니다.

| 검증 owner | Native source / parent | 연속 편집 |
|---|---|---|
| `0:4`, 최초 offset2 | `32 / 19` | 두 splice의 full DTO·Native receipt·window 대조 |
| `0:15`, 최초 offset0 | `87 / 80` | 동일 |
| `0:18`, 최초 offset0 | `99 / null` | 동일 |

parent가 있는 plain owner도 정확한 source/parent 대조를 통해 검증했습니다. 문서의 다른 곳에 표·그림이 있다는 이유만으로 blanket 거부하지 않습니다. 반대로 그림·제어 owner인 paragraph0은 window가 부적격이고 receipt도 `NoExclusiveTextDelta`였습니다. 별도 생성한 unknown direct record 입력은 Native가 `UnsupportedSectionRecord`로 편집을 거부하고 receipt를 발급하지 않았습니다.

이 한정 증거를 HWPX, 임의 owner, 모든 Native export 또는 다른 SHA의 엔진에 자동 적용하지 않습니다. 다른 엔진의 등록에는 해당 바이트와 계약의 별도 검증이 필요합니다.

## r1/r2·history r3의 full snapshot을 유지하는 exclusive 흐름

아래는 COW07 도입 전 확정한 full-snapshot 경로의 실증 범위입니다. 후속 내부 splice projection은 [bounded owner-window COW 계약](hwp5-owner-window-cow.md)을 따릅니다. 공개 Runtime.request와 호환 CommandResult.reply 및 undo/redo의 full 응답 계약은 유지하며, 후속 선별 경로의 Native getter 생략을 아래 기존 경로에 소급하지 않습니다.

1. canonical Reader가 기존 current-reference facade로 편집 전 Native reference와 H5W1 metadata를 읽습니다. 실제 성공 splice 뒤 기존 `last_text_delta_receipt`와 fresh reference의 완전한 bounded owner window를 읽습니다. 버전·정확 u64 epoch·범위·UTF-16/CR·runs·source/parent를 대조한 소유 복사본만 packet으로 연결합니다. optional 조회가 실패하면 이미 적용한 편집을 재시도하지 않고 기존 전체 display 경로를 유지합니다.
2. backend는 여전히 전체 `hwp5Display`를 만들고 `structuredClone`하며, core도 전체 snapshot을 설치합니다. owner-window patch/merge나 source heap 구조 공유로 바꾼 후보가 아닙니다.
3. 기존 built-in Reader의 module contract/authority/context/application/history gate를 통과한 receipt만 exclusive-text origin에 결합합니다. 외부 custom runtime, 미등록 직접 compile 모듈, 임의 JSON receipt는 기하 권위를 얻지 못합니다. d849의 exact 바이트 등록 허용이 이 origin/admission 검사를 완화하지 않습니다.
4. controller는 sequence+1, 전후 epoch/revision, editor/document/generation 및 operation/view revision 연속성을 확인합니다. owner text/ranges는 Native window/runs와 대조하고, 전체 header와 모든 비대상 paragraph의 own-data key/value를 비교합니다. 비대상 currentReference의 scope/id/kind 등은 유지되고 epoch만 정확한 새 Native epoch여야 합니다. 조건이 다르면 재사용을 거부하고 새 full-baseline으로 돌아갑니다. 기존 patch 분기의 windowUpdate 검증도 그대로입니다.
5. 검증된 연속 text에서만 resourceLease/scope를 유지하고 ownerTextRunGeneration을 증가시킵니다. 원 전체 DTO 비교에서 text/ranges 외 65개 currentReference epoch 차이를 삭제하거나, 축소 projection만 oracle로 비교하지 않았습니다. 비교 입력의 root는 core-owned/frozen이어야 합니다. 현 exactDisplayValue는 plain object와 null-prototype object를 모두 허용하고 같은 own-data key/value이면 값 동치로 처리합니다. prototype이나 freeze descriptor 자체의 동일성을 증명하는 비교는 아닙니다. bytes나 accessor가 포함되면 full fallback을 유지하고, 누락과 명시 undefined 및 -0의 차이는 구분합니다.

**resource query 생략0과 Native 전체 조회 수를 구분합니다.** `nativeResourceQueriesSkipped=0`은 생략한 Native 자원 조회가 0건이라는 뜻이며 Native 전체 조회0이나 기존과 같은 호출 수를 뜻하지 않습니다. 기존 style/font/DocInfo getter, full snapshot·응답 복사 비용은 그대로 남습니다. 여기에 새 splice 증거 검증 조회가 다음과 같이 추가됩니다.

| splice 증거 단계 | 추가 조회 | 개수 |
|---|---|---:|
| `captureExclusiveTextOwner` | refs + 편집 전 window | 2 |
| `readExclusiveDelta` | receipt + fresh refs + 편집 후 window | 3 |
| 합계 | 검증된 splice 흐름의 추가 증거 조회 | 5 |

위 5건은 기존 Native API로 수행하는 추가 조회이며, 새 Native ABI를 만들었다는 뜻은 아닙니다. resource query를 생략하지 않은 상태에서 증거를 확인하려고 더 읽는 비용을 숨기지 않습니다. warm provider 재사용은 이 5건을 없애거나 Native 전체 호출 수를 줄였다는 증거가 아닙니다. history r3 final03에서는 r2 대비 export별 실제 호출 사전이 같아 history 재사용의 추가 Native 조회0을 확인했습니다. 이는 splice의 추가5건과 별도이며, Native 전체 호출0을 뜻하지 않습니다. 전체 reflow/typing 복잡도나 UI 성능 개선도 이 수치로 증명되지 않습니다.

## r2의 warm 그림·배경 entry 재사용

그림 refresh를 생략하는 조건은 다음 세 가지의 교집합입니다.

- registry의 실제 Native exclusive evidence와 epoch/revision/owner generation이 연속입니다.
- 동일한 유효 frozen empty host provider token이 확인됩니다.
- 보유한 모든 그림·배경 entry가 warm입니다. bitmap/cost가 있고 refreshing이 아니며 오류가 없어야 합니다.

token만으로 Native 권위가 생기지 않습니다. `entry.pending`에는 이미 정착한 Promise가 남을 수 있으므로 warm 판정으로 쓰지 않습니다. pending/error entry는 원 refresh/retry를 유지합니다. 빈 cache는 보존할 이전 job이 없다는 뜻이며, 새로 보이는 자원은 기존 load로 읽습니다.

`CanvasSurfaceEnvironment.resourceProviderEpoch`는 optional 계약입니다. 미지정·부적격·descriptor 변조·예외에서는 기존 operation epoch 기반 refresh를 사용합니다. own data descriptor만 확인하고 원 host receiver로 호출하며, getter를 실행해 token을 추정하지 않습니다. surface/renderer의 host epoch 키와 descriptor reader는 `host-epoch-readers.mjs`를 공유합니다.

provider/decoder의 의미가 바뀌기 전에 host가 새 token으로 회전해야 합니다. token이 바뀌면 operation epoch가 같아도 clear하여 같은 bytes까지 다시 decode합니다. 같은 외부 callback과 backing Uint8Array를 A→B로 바꾸는 대조에서 기본 경로가 B를 다시 decode했고, provider token만 바꾸는 대조에서는 같은 bytes의 decoder 정책 변경도 재검증했습니다. 증명되지 않은 provider refresh에서는 Native geometry/flow도 보수적으로 clear합니다. reader/decoder setter와 source/document clear/reset 수명은 유지합니다.

vanilla/react/svelte 후보는 공유 `createDemoSurfaceEnvironment()`를 사용합니다. factory 호출마다 측정/provider token은 독립적이며, 해당 private demo host가 `editor.readResource` provider를 교체하지 않는 계약을 전제로 합니다. 외부 mutable provider의 미통지 변경까지 동일 Native lease가 보장한다는 뜻은 아닙니다. token을 제공하지 않는 host는 기존 refresh 경로를 유지합니다.

## 실증과 미완료 범위

| 세대 | 기록된 검사 | 해석 |
|---|---|---|
| r1 | 신규16 + 기존 input-surface17 = 33pass/0fail/0skip | 실제 d849 Native ACK/전체 DTO/controller/stamp와 Node source 모형 |
| r2 | 64pass/0fail/0skip | r1 범위 재검증 + provider/descriptor/demo/API·warm/stale race·기존 surface/측정 회귀 |
| Native gate | 각 세대 별도 성공 | 위 33/64에 중복 합산하지 않음 |
| 품질·타입 | r1 lint/fmt13·helper strict, r2 lint/fmt14·focused API noEmit | 전체 SDK 타입검사/빌드 성공으로 확대하지 않음 |

SDK67에 대한 별도 독립 full DTO 비교에서는 최초 deepStrictEqual이 core-owned null-prototype 객체와 plain 객체의 prototype 차이 때문에 실패했으며 원 실패를 보존했습니다. 이후 core-owned 결과를 structuredClone한 뒤 전체 값에 대해 deepStrictEqual을 수행하여 세 owner가 통과했습니다. 이는 전체 값 동치의 대조이며 원 prototype·freeze descriptor 동일성의 증거가 아닙니다. 이 독립 결과의 범위를 r1/r2 후보 자체의 검사 집계와 혼합하지 않습니다.

r2의 실제 Surface stale race에서는 Native bytes 답을 지연시킨 뒤 splice ACK로 operationRevision을 바꿨습니다. 원 stale guard가 old payload 접근 전 거부하여 old payload 접근0·old bitmap decode0이었고, 새 ACK에서 current 재읽기2·decode1로 회복했습니다. 이 guard는 integration-before와 바이트가 같았습니다. 별도 mutant의 같은 race 예상 실패도 보존했습니다.

r1의 초기 mock pictureReader가 Uint8Array 대신 `{bytes}`를 반환해 decoder까지 도달하지 않았던 한계는 원 기록 그대로 남겼습니다. 그림/decoder 재사용의 후속 근거는 이를 바로잡은 r2 대조와 구분합니다. 최초 warm/cold 미정착, r2 초기 interactionRevision 누락·Map key 오류도 최종 성공 기록에 덮어쓰지 않았습니다.

Oracle의 r2 읽기 전용 source 검토는 해당 provider/warm/stale 경계에서 확정 P1/P2 없음이었습니다. reviewer가 Native/controller/loader나 시험을 재실행한 것은 아니며, loader/TOCTOU·실브라우저·전체 async 상태공간은 검토 범위 밖입니다.

그림 reader/bitmap/Canvas 측정은 Node 모형입니다. 실제 Native ACK와 실제 controller/Surface/renderer source를 사용한 범위와 실제 browser/pixel·운영 UI lag는 구분합니다. Native/SDK 새 빌드, 실브라우저 및 최종 앱의 입력/undo 지연 개선은 이 실증으로 완료되지 않았습니다. renderer의 병렬 metrics/interaction 작업은 전체 파일 교체 없이 해당 before에 맞는 최소 hunk로 합성해야 합니다.

## history r3: controller 파생과 실제 Native origin

history r3 final03의 제품7 source는 불변이며 분리 실행한 source 검사48개가 통과했습니다. `history-text`는 새 Native receipt 종류가 아니라 controller가 검증된 private history edge에서 파생하는 증거입니다. undo/redo의 실제 Native origin은 계속 `full-baseline`입니다. 현재 Native가 history-text를 직접 발급하거나 원 snapshot 조회를 생략한다고 해석하지 않습니다.

private edge는 원문 undo snapshot을 복제하지 않고 revision/owner 등 metadata를 보관합니다. edge 상한은512이며, 보관 revision 수 R과 edge 수 E에 대한 metadata 처리 범위가 O(R+E)입니다. 이는 전체 DTO 비교·full snapshot 복사·전체 reflow나 typing의 선형 복잡도 증명이 아닙니다. 검증된 edge와 현재 full 관측의 대조에 실패하면 기존 full-baseline 및 새 lease 경로를 사용합니다. 일반 서식·구조 변경에 text edge 권위를 자동 확장하지 않습니다.

| final03 분리 검사 | 통과 수 |
|---|---:|
| frozen SDK67 전체 DTO | 4 |
| 최종 Native 음성 | 7 |
| layout oracle | 3 |
| overflow 회복 | 1 |
| r2 대비 실제 ABI 조회 사전 | 1 |
| root descriptor pure | 32 |
| 합계 | 48 |

root-descriptor-native에 중복된 Native4는 재합산하지 않았습니다. helper108 pure, 앞선 r2의64, source48은 서로 다른 검증 묶음이며 합쳐 독립 기능 수로 세지 않습니다. layout oracle은 Node 측정 모형의 전체 layout 동치를 확인한 범위입니다. 실제 Native 음성에는 문서교체에 따른 권위철회와 분기 후 redo known-no-op/후속 입력 회복이 포함되지만, Native eviction은 helper 회귀 범위와 구분합니다.

원 negative/negative-04/negative-05 로그는 보존했습니다. redo known-no-op 응답·기존 projection 보존·다음 입력 full-baseline 회복에 대한 하네스 기대를 바로잡은 시험06이 통과한 것이며 제품 수정 효과로 계상하지 않습니다. Oracle48 검토 완료는 인계된 별도 검토 결과이며 이 문서 작성자가 새 시험을 실행한 것은 아닙니다.

메인 실제 root의157 pure·27 품질·focused strict noEmit, 독립 SDK67 전체 DTO의 세 owner별 두 splice와 undo 값 일치는 별도 전달 근거입니다. 현재 root의 history-text 기대검사 통과도 이 범위에 속하며 final03의48에 더하지 않습니다. prototype 차이의 원 실패와 structuredClone 후 값 동치 경계는 앞 절과 같습니다.

**실브라우저 입력/undo 지연과 UI 성능 개선은 미증명입니다.** late ACK 후속05는 실제 d849 undo 반환 직후 delivery 이전 microtask에서 lifecycle을 바꾸는 계측 실행으로3사례가 통과했고 제품7은 불변입니다. dispose와 surface release→재획득 ABA에서는 pending 요청의 rejected 및 이전 권위 철회를 확인했습니다. 문서교체는 FIFO상 undo ACK가 committed-with-snapshot으로 먼저 완료된 뒤 새 문서가 설치됐으므로, 교체 후 도착한 지연 ACK 거부의 증거가 아닙니다. 이 사례는 교체 완료 후 이전 권위 철회와 새 scope 분리만 입증합니다. 임의 Promise 장기지연·Native epoch 값 ABA·전체 비동기 상태공간을 검증한 것은 아닙니다. 실제 export의 인자·반환값을 유지한 wrapping 관측이며 pristine 실행이나 성능 증거로 확대하지 않습니다. 후속05는 dispose/ABA의 rejected 명시 assert를 보완했고 Oracle이 연결3핀과 원로그3통과를 확인했습니다. 원04는 보존하며 04/05를 독립6사례로 중복 합산하지 않습니다. frozen SDK67 Reader의 명시 import 기준선은 고정했지만 전체 의존 closure SHA 재귀검증은 미완료입니다. 별도 canonical Native/SDK build는 strict declaration을 포함해 exit0으로 전달됐으며 closure/build packet은 봉인 중입니다. 이 빌드 전달을 위 SDK67 전체 의존 closure 재귀검증 완료나 브라우저·운영 배포 완료로 승계하지 않습니다.

## 등록 정책과 재현성 한계

r1의 `D849-REGISTRATION-EXPERIMENT.patch`와 원 HANDOFF의 등록/provenance 보류 필드는 당시 격리 실험의 기록으로 보존합니다. 현재 등록 기준은 exact d849 SHA와 위 한정 Native 계약의 실증이며, 재현 가능한 Native build manifest 미확보는 별도의 재현성 한계입니다. 과거 필드를 고쳐 쓴 것으로 해석하지 않습니다. loader 등록행·외부 fetchBuffer owned-copy 합성은 별도 통합 소유이며 provider patch만으로 완료되지 않습니다.

공식 wasm artifact의 sourceSha256/identicalRuntime 연결은 소비한 runtime 바이트를 식별하는 근거입니다. Native 원소스 commit·컴파일 옵션·전체 빌드 입력과 산출물의 재현성까지 완전히 인증한 근거는 아닙니다. 다른 Native 기능의 전면 인증·빌드 재현·현재 운영 승인까지 자동 확대하지 않습니다.

## 증거 보관

증거 묶음은 로컬 `zig-out/verification/d849-full-snapshot-exclusive-r1/`과 `d849-full-snapshot-exclusive-r2/`에 보존되어 있습니다. ignored 검증 산출물은 source-only clone에 자동 포함되지 않으므로, 이 문서만 있는 checkout에서 같은 실행이 준비됐다고 보지 않습니다. 정확 argv·provider·예산·결과는 각 묶음의 `FINAL-VALIDATION.json`, source before/after와 선택 patch는 각 manifest가 소유합니다. 이 문서 추가 과정에서 시험을 재실행하지 않았습니다.

| 보관 문서 | SHA256 |
|---|---|
| r1 HANDOFF.json | `e81dc16cee8585a19b4abf8fa63a22ddee404162ece7eafc7922220822230c0b` |
| r1 RESULT.ko.md | `fe1c3f249760d04d3b42d8b45cbcd8d74595e44cd93c7da4d86056c5e1d9cdb5` |
| r2 HANDOFF.json | `cc4c46de3a73c80fd5f0d61068149bfeee282f7afd6387a7cbc86452a87fce86` |
| r2 RESULT.ko.md | `af673909bdc4ea5b53c92dc3632b7fc63fee3e41332dcc7689a0cb3a4f45f04e` |
| r2 FINAL-VALIDATION.json | `04e47cb6b21a372e8823ba520f078520dd82aa7ed88e88f027f2fe446c95cae3` |
| r2 ORACLE-PROVIDER-REVIEW.json | `cf205ce0b2b54745334d9a27c3290be42137ff82b38d8a238f381f51f6f27d9d` |

| history r3 final03 FINAL-HANDOFF-03.json | `7eb98ef0b8b8edc447687a2e191bc6afd0365e29189126b3313de9f80da3873c` |

추가 history 증거는 로컬 `zig-out/verification/d849-history-edge-derived-r3/`의 final03 인계서가 연결합니다. helper108·메인 root157/품질27 및 독립 DTO 결과는 별도 집계이며, 이 문서 작성에서는 재실행하지 않았습니다.

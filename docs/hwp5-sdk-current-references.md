# HWP5 SDK 현재 참조와 표시 바인딩

이 문서는 현재 작업 트리의 source SDK 구현 계약입니다. [reader runtime](reader-runtime-foundation.md)과 [Worker transport](worker-runtime-transport.md)에 연결하며 npm/웹 SDK 릴리스, 전체 corpus 또는 전체 목표 완료를 뜻하지 않습니다.

## 책임과 선택적 ABI

`js/hwp5-current-references.mjs`가 native 참조 창의 해독·검증, JS scope, 텍스트 복사와 splice를 소유합니다. `web/preview/hwp5-current-reference-content.mjs`는 표시 바인딩만, `web/preview/hwp5-current-reference-command.mjs`는 runtime 메시지 분기만 소유합니다. 문서·이력·projection 갱신은 `web/preview/reader-runtime.mjs`에 남습니다.

`supportsCurrentReferences()`는 `hwp5_edit_current_references`, `hwp5_edit_copy_current_text`, `hwp5_edit_splice_current` 세 export를 모두 요구합니다. source-only 조회는 추가로 `hwp5_edit_current_source_references`를 요구합니다. 명시 API 호출의 부재 오류는 각각 `Hwp5CurrentReferenceAbiUnavailable`, `Hwp5CurrentSourceReferenceAbiUnavailable`입니다. 표시 연결은 기본 ABI가 없으면 기존 row의 stale `currentReference`를 지우고 native 조회 없이 반환합니다. 이 조기 반환은 새 `currentReferenceErrors` 배열을 만들지 않습니다.

창은 `{version:1,total,first,references}`이며 기본 `first=0,count=256`, 최대 count는 1024입니다. decoder는 정확한 필드 집합·정수 범위·창 범위·동일 epoch를 검사하고 facade는 요청 section/first/반환 길이를 대조합니다. `epoch`와 `id`는 u64 정밀도를 보존하는 십진 문자열입니다. kind는 `original`, `generated`, `cell`이며 원본/생성 문단의 row/column은 0입니다. 표시 ordinal에서 native ID를 계산하지 않습니다.

## source-only 창과 구역 원자성

편집 가능한 HWP5 표시를 만들 때 기존 참조를 먼저 제거합니다. 각 표시 구역의 `editor.paragraphCount(section)`와 preview의 문단 수가 같아야 합니다. source-only ABI가 있으면 `currentSourceReferences`를 사용해 생성 셀을 제외한 source 문단 순서에 연결합니다. 전체 `currentReferences` 스트림은 생성 셀도 포함할 수 있어 같은 ordinal 공간이라고 가정할 수 없습니다.

표시 row의 paragraph가 속한 1024개 단위 창만 조회합니다. window context row와 같은 문단의 반복 표시도 같은 참조에 연결합니다. 모든 창의 total/first/길이/section 및 cell 부재, 모든 표시 row의 바인딩 존재를 확인한 뒤 해당 구역에 한꺼번에 붙입니다. 뒤 창이나 한 row가 실패해도 그 구역에는 부분 바인딩을 남기지 않습니다. 오류는 `content.currentReferenceErrors`의 `{section,error}`로 남으며 다른 구역은 독립적으로 성공할 수 있습니다.

source-only ABI가 없을 때만 전체 참조 조회를 시도하며 동일한 개수·cell 부재 검사를 적용합니다. source-only 조회 자체의 실패를 전체 스트림 fallback으로 숨기지 않습니다. 참조가 있다는 사실만으로 모든 편집이나 서식이 지원되지는 않습니다.

## raw 텍스트와 수명

`copyCurrentText(reference)`는 native UTF-16LE bytes를 복사하고 `currentText(reference)`는 이를 엄격히 해독합니다. 반환값은 표시 문자열이 아닙니다. 예를 들어 raw `기울임진하게\r`에 대해 표시 row.text는 `기울임진하게`입니다. 문단 끝 CR과 제어 표식의 raw 위치를 화면 길이로 대체하지 않습니다. splice의 `startUnit/endUnit`은 raw UTF-16 코드 유닛이며 화면 선택 변환은 별도 책임입니다. 입력 문자열의 Unicode 유효성, 범위 순서와 4 Mi 유닛/UTF-8 bytes 한도를 검사한 뒤 native 편집 정책을 적용합니다.

JS 참조는 native의 `{epoch,kind,section,id,row,column}`에 opaque `scope`를 더한 frozen 객체입니다. scope는 API 인스턴스별로 생성하며 native로 보낼 때 제거합니다. 다른 세션 참조는 JS에서 `InvalidCurrentReferenceScope`, 편집·undo/redo 등으로 무효화된 epoch는 native에서 `StaleCurrentReference`로 거부합니다. 편집 이후 최신 projection/조회에서 참조를 다시 얻습니다. 닫힌 editor는 사용할 수 없습니다. ID·epoch·scope를 조립하거나 저장해 재열기 후 재사용하는 계약이 아닙니다.

`packages/core/src/worker-runtime.ts`는 transport 생성마다 `worker:N` prefix를 만들고 `initialize-runtime.referenceScope`로 전달합니다. `packages/core/src/worker.ts`는 이를 reader runtime에 주입하며 JS API는 로컬 sequence를 덧붙입니다. 서로 다른 Worker realm의 로컬 sequence가 모두 1이어도 `worker:1:1`, `worker:2:1`로 구분됩니다. 이 prefix는 동일 host module의 transport 간 참조 혼용을 막는 수명/소유권 장치입니다. 인증·서명·비밀 토큰이나 악의적 호출자에 대한 보안 경계를 제공하지 않으며 독립 host realm 사이의 전역 유일성을 보장하지 않습니다.

## 실험 메시지와 typed 서식의 경계

다음 네 메시지는 runtime의 실험 query/splice 경로입니다. typed 서식 지원 범위를 이 명령들의 native 참조 범위로 확대하지 않습니다.

| kind | 입력 | 결과 |
| --- | --- | --- |
| `query-current-references` | section, 선택 first/count | 전체 현재 참조 window |
| `query-current-source-references` | section, 선택 first/count | cell을 제외한 source 참조 window |
| `query-current-text` | reference | raw text |
| `splice-current` | reference, startUnit, endUnit, text | 편집 후 새 content |

열린 editor와 history 활성화가 필요하며 HWP5만 허용합니다. available-sections read-only 경계도 유지합니다. 별도 `query-created-tables` 분기가 있지만 위 네 참조 메시지와는 구분합니다. 요청 ID는 응답에 반영하고 splice 성공 후 preview를 갱신합니다.

`packages/core/src/commands/formatting.ts`의 typed 문자 속성과 문단 정렬은 capability, 현재 선택, 본문 owner와 원본 바인딩을 검사합니다. HWP5는 같은 section의 `kind:original` 및 u32 범위의 십진 id가 있어야 하며, 참조 부재/생성 문단은 `UnsupportedFormattingReference`로 거부합니다. 표 셀은 `UnsupportedFormattingOwner`, 생성 셀은 `CreatedCellRequiresSurfacePort` 경계입니다. 문자 서식은 빈 선택을 거부합니다. 실제 명령은 canonical source paragraph ordinal ABI를 사용하고 reference를 보내지 않습니다. id는 node ID이므로 paragraph ordinal로 변환하지 않습니다. 생성 문단/셀의 query·splice 가능성이 typed 문자 서식·정렬 지원을 뜻하지 않습니다.

## 확인한 후보와 근거

아래는 기존 산출물을 확인한 기록이며 이 문서 작업에서 E2E를 재실행한 결과가 아닙니다. 경로는 저장소 루트 기준입니다.

- `zig-out/verification/hwp5-reference-publication-wgpi00n_/all-tests.log`: 118 tests/pass, fail/skipped 0. 같은 후보의 `scoped-reference-tests.log`: 23 tests/pass, fail/skipped 0. 두 집계를 더해 독립 141건으로 세지 않습니다. 바인딩 창·구역 실패·선택적 ABI·참조 수명과 실제 CFB 편집을 포함한 제한된 회귀입니다.
- `zig-out/verification/hwpjs-publication-parity-590yfu/summary.json`: 기준 HEAD `7ce28e5c65339424c22c2b3091f89b8f845d13c8`, `declaredProjection: current-references`, 5시나리오 45응답 통과. 허용한 추가는 HWP5 row의 `currentReference`와 빈 `currentReferenceErrors`뿐이며 이를 검증하고 제거한 나머지 wire를 비교합니다. scope 정규화가 없는 비교이며, 추가 필드까지 포함한 무조건 byte-identical 주장과 구분합니다. Node wire 검사로 브라우저·렌더링·배포를 증명하지 않습니다.
- `zig-out/verification/hwp5-worker-reference-scope/2026-10-24T16-12-13-481Z/result.json`: 실제 Chrome module Worker 두 개에서 서로 다른 scope, 자기 참조 편집의 독립 oracle, stale epoch 거부를 확인했습니다. 외부 참조 query/splice는 `InvalidCurrentReferenceScope`로 거부되고 두 저장 hash는 baseline과 같았습니다. 후보는 `zig-out/verification/hwp5-reference-publication-wgpi00n_`입니다.
- 인과 대조군 `zig-out/verification/hwp5-worker-reference-scope/2026-10-24T16-08-40-453Z/result.json`: prefix를 제거한 후보 `zig-out/verification/hwp5-reference-no-host-scope-da0rppln`에서 두 scope가 `1`로 충돌했고 외부 splice가 적용되어 대상 저장 hash가 달라졌습니다. `expectVulnerable:true,pass:true`는 취약 동작 재현 성공이며 안전성 통과가 아닙니다.

두 브라우저 기록에는 같은 WASM SHA256 `03d1efd8b0a15c87621c9563b3bff4285534442bf5085813d94fdbc1f9c0315b`, bundle 지문, `transcript.json`, `observer.json`, baseline/after HWP 파일과 `audit.png`가 남습니다. 최소 업로드/버튼 시험 host이며 제품 Canvas·물리 IME·전체 corpus 검증이 아닙니다. 각 result의 cleanup은 browserInactive/serverUnreachable입니다. 별도 제품 Canvas 검증은 아래 기록과 구분합니다.


## 제품 데모 후속 검증

현재 작업 트리 웹 패키지의 168건, typecheck, 웹 패키지·데모 빌드가 통과했습니다. `demo-formatting/2026-10-24T16-30-24-373Z`는 Vanilla/React/Svelte × HWP5/HWPX 6건에서 실제 서식 입력·독립 저장 oracle·이력·재열기를 통과했습니다. `monorepo-demo-access/2026-10-24T16-30-25-535Z`는 헤드리스와 암호 열기 4건을 통과했습니다. 이 데모에는 아직 게시하지 않은 후속 UI 코드가 포함되므로 격리한 source SDK 후보 118건과 같은 소스 집합으로 취급하지 않습니다.

같은 데모를 테일스케일 서버에 반영한 뒤 `monorepo-demo-deployment-check/2026-10-24T16-31-42-463Z`에서 11개 아티팩트의 로컬/HTTPS 바이트 일치와 누락 URL 404, `monorepo-demo-smoke/2026-10-24T16-31-42-730Z`에서 두 형식 × 세 프레임워크 열기 6건을 확인했습니다. 테스트 브라우저와 임시49002 서버는 종료하고 데모8082 서버는 유지했습니다. 전체 fixture 조판이나 모든 객체 편집 지원을 의미하지 않습니다.

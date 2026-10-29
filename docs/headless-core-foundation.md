# 헤드리스 코어 기반의 게시 범위

## 관측값 복제와 변경 격리

`packages/core/src/state/owned.ts`는 외부 입력의 복제와 게시할 관측값의 소유권을 구분합니다. 소유한 일반 관측값의 identity는 유지하되 Map·Set·바이트 버퍼를 통한 변경은 다음 관측값에 전파되지 않아야 합니다. 모듈을 가져오기 전에 설치되어 기존 할당자에 위임하는 관측 wrapper가 포획한 중간 복제본도 임의로 동결하거나 게시하지 않습니다. 이 경계는 `packages/core/tests/state/owned.test.ts`의 별도 프로세스 회귀로 검사합니다.

2026-10-30 내부 복제본을 그대로 동결하는 후보는 미채택했습니다. d849 엔진의 HWP5·HWPX 열기와 HWP5의 41개 splice·40개 undo 응답에서 빠른 경로가 0회였고, 방문·생성 계수는 줄지 않았습니다. 별도 import 전 allocator 반례에서는 기존 구현이 외부 포획 복제본을 동결하지 않는 반면 후보는 이를 동결·게시했습니다. JSON 값 동치는 이 회귀를 상쇄하지 않습니다. 원 제품 코드는 유지하며, 후속 최적화는 실제 문서에서의 효과와 외부 별칭 격리를 함께 검증합니다. 집중 실행 방법은 [개발·검증 명령](development-commands.md)을 따릅니다.

설정 가능한 키 조합과 번역은 [JSON 단축키 계약](editor-keymap.md)을 따릅니다.

검색·통계·clipboard 관측과 비동기 선택 fence는 [텍스트 도구 계약](headless-text-tools.md)을 따릅니다.

`packages/core/src/index.ts`는 backend를 주입하는 편집기 진입점입니다. native 문서·저장·이력이 원본이고 `EditorState`는 소유된 불변 관측값입니다. 상태·명령 registry·FIFO·취소·선택 검증·표시 서식 selector는 각각 별도 모듈이 소유합니다. 기존 UTF-16/source 좌표 변환과 서식 인코더를 복제하지 않습니다.

```ts
import {createEditor, SPLICE_TEXT_COMMAND} from './packages/core/src/index.ts';
const editor = createEditor({runtimeFactory: () => myRuntime});
const unsubscribe = editor.registerUpdateListener(state => {
  // state는 저장할 문서 모델이 아니라 읽기 관측값입니다.
});
await editor.load(bytes, {format: 'hwp5'});
// 확정된 현재 SelectionTarget을 전달합니다. 오래된 revision/owner는 거부합니다.
const result = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {target, text: '수정'});
if (result.status === 'committed-refresh-required') await editor.refresh();
const saved = await editor.save();
unsubscribe();
await editor.dispose();
```

`myRuntime`, `bytes`, `target`은 host가 제공하는 값입니다. runtime은 문서마다 독립되어야 하며 `contracts.ts`의 요청/응답·적용 메타데이터와 수명 계약을 따릅니다. 이 기반 게시 단계의 package는 private/source entry입니다. Worker·구체 reader backend·DOM/React/Svelte·RN adapter와 배포 번들을 전부 게시했다는 뜻은 아닙니다. 이 단계만으로 브라우저에서 직접 파싱할 수 있다고 주장하지 않습니다.

`read`와 `update`/command handler는 동기 callback입니다. update는 명령 수집 경계이며 여러 native 명령의 원자적 rollback을 약속하지 않습니다. 성공한 앞 명령 뒤에 stale/실패가 나면 중단 위치와 각 결과를 반환합니다. 적용 후 스냅샷 실패는 재시도하지 않고 refresh-required로 표시합니다. 후보 load 실패는 이전 문서를 보존합니다. dispose는 신규 작업을 차단한 뒤 진행 작업과 소유 세션을 정리합니다.

서식 변경의 선택 연장은 새 스냅샷에서 텍스트·소유자·참조 identity·offset mapping·scalar 경계가 유지된 경우에만 적용합니다. HWP5 native epoch는 변경 시 증가하므로 identity 비교에서 제외하되 다음 요청에는 새 스냅샷의 참조를 사용합니다. 문서/선택 토큰은 계속 검증합니다.

## 암호 오류와 재시도

`unlock()`의 decoder 응답이 InvalidPassword/InvalidPasswordUnicode/WrongPasswordOrCorruptPayload이고 미적용이 확인된 경우만 후보를 유지합니다. 이때 public `PasswordAttemptError`가 반환되어 host가 재입력 또는 cancelLoad를 제공할 수 있습니다. 적용/changed 여부가 모호하거나, 통신 실패·취소·dispose·다른 오류이면 후보를 해제합니다. 이전 활성 문서는 성공한 새 스냅샷까지 유지합니다. 암호는 EditorState·저장 이력의 입력이 아닙니다.

## 게시 전 검증

실제 원격 HEAD의 기존 JS 모듈만 가져온 별도 사본에 게시 대상 소스/테스트만 적용합니다. 원래 작업 트리의 미게시 reader/runtime/renderer 확장 없이도 실행되는지 검사합니다. Node 소스 테스트, strict TypeScript 선언 생성, browser-target ESM bundling을 각각 확인합니다. 주입 runtime 테스트는 native 파서·전체 fixture·브라우저 완료 증거와 구분합니다.

Node24 이상에서 `node --test packages/core/tests/{editor,commands,state,scheduler}/*.test.ts`로 기반 검사를 실행할 수 있습니다. 패키지 source entry의 TypeScript를 지원하는 환경이 필요합니다. 전체 native/포맷 oracle·실제 브라우저·전체 corpus 검증은 후속 adapter 연결과 별도입니다.

게시 후보의 최종 별도 사본에서 Node77건·strict 선언 생성·23모듈 browser ESM bundle이 통과했습니다. 추가 적대적 리뷰에서 발견한 잘못된 암호 후 후보 폐기 문제를 수정하고, 미적용·적용 여부 불명·모순 메타데이터·취소 경합·이중 해제를 반례로 추가했습니다. 실제 암호 HWP5/HWPX의 틀린 암호2회→정답 재시도도 현재 작업 트리의 구체 reader adapter에서 별도2건 확인했습니다. 후자는 이 기반 게시 단계만으로 실행되는 테스트가 아니므로 source-only77건과 구분합니다.

후속 게시된 [Worker 전송 경계](worker-runtime-transport.md)는 `./runtime` source 진입점을 추가합니다. 구체 reader backend와 parser Worker·WASM 배포 파일의 게시 완료와는 구분합니다.

[구체 reader runtime](reader-runtime-foundation.md)은 Node/DOM-free 파서 backend와 같은 구현의 module Worker를 연결합니다. Canvas·프레임워크·배포 자동화와 구분합니다.

## 편집기 인스턴스와 문서 식별자

사용자가 지정하는 editorId는 이름이며, 같은 값을 쓰는 편집기나 폐기 후 재사용을 허용합니다. documentId는 같은 core 모듈 안에서 인스턴스별 단조 증가 식별자와 문서 세대를 함께 포함하는 opaque 값입니다. 호출자가 그 문자열 형식을 조립하거나 파싱하지 않습니다. 새 인스턴스의 문서 토큰으로 이전 인스턴스의 선택·명령을 승인하지 않습니다. 자동 ID와 사용자 ID의 이름 충돌도 문서 identity 충돌로 이어지지 않습니다. 식별자 한도에 이르면 재사용 대신 명시 거부하며 전역 이름 Set이나 시간/랜덤/플랫폼 API를 사용하지 않습니다. 별도 JS 실행 영역·별도 core 모듈 복사본 사이의 전역 인증 토큰이라는 뜻은 아닙니다.

적대적 재현에서 같은 사용자 ID 두 개, 폐기 후 ID 재사용, 사용자 이름/자동 이름 충돌이 모두 다른 문서의 splice를 승인했습니다. 인스턴스별 documentId 분리 후 `identity.test.ts`4건에서 잘못된 target을 StaleTarget으로 거부하고 native 요청·이전 상태가 유지됨을 확인했습니다. 같은 편집기의 문서 교체 대조군도 포함합니다.

공개 밑줄 명령·관측 selector와 실제 툴바 연결의 후속 계약/검증은 [밑줄 서식](headless-underline-formatting.md)이 소유합니다.


## 공개 이력 가용 상태

`EditorState.nativeHistoryRevisions`는 Native 응답의 도달 가능한 revision 목록을 소유한 불변 관측값입니다. `getHistoryAvailability(state)`는 ready 상태와 유효한 현재 revision·중복 없는 목록을 요구하고 `available/canUndo/canRedo`를 반환합니다. 메타데이터가 없거나 모순이면 두 명령을 활성화하지 않습니다. 선택 변경은 이 관측값을 보존하며 문서 교체는 새 응답으로 교체합니다.

공통 Native `model/history_stack.zig`는 새 변경에 단조 증가하는 ID를 부여하고 분기 시 redo를 제거합니다. 현재 ID보다 작은 도달 ID는 undo, 큰 ID는 redo입니다. 목록은 현재/undo/redo 저장 순서이므로 배열 위치를 시간 순서로 해석하지 않습니다. revision이 양수라는 이유만으로 undo 가능하다고 판단하지 않습니다. 사용자 Runtime도 이 ID 계약과 메타데이터를 충족해야 가용 상태를 제공할 수 있습니다. 데모 toolbar와 우클릭 메뉴는 같은 selector를 사용합니다.

명시 WASM `fc7fb2ab7eeff2bb07ae1463f7e5b12dcc7ebbd49f4c6de9487a85da6900dda4`의 HWP5/HWPX에서 최초 열기, 편집, undo/redo, 새 분기, 16개 이력 상한을 초과한 편집과 끝까지 undo, 끝에서 no-op, 재열기를 확인했습니다. 양수 revision에서도 undo가 불가능한 경계를 포함합니다. `packages/core/tests/integration/history-availability.test.ts`가 실제 엔진 검사를, `state/history-state.test.ts`가 불변 소유권·불완전/잘못된 메타데이터 검사를 소유합니다.

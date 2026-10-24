# 헤드리스 코어 기반의 게시 범위

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

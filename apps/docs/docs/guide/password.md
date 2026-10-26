# 암호 후보·재시도·취소

`load`와 `unlock`은 기존 활성 문서를 새 문서 후보와 구분합니다. 암호가 필요한 후보를 열지 못했을 때 기존 문서 A를 버리고 새 editor를 만들 필요는 없습니다. 암호 입력 dialog/CLI와 재시도 횟수는 호스트 콜백으로 주입합니다.

## 적용 버전과 공개 상태

이 예제의 readonly 동작은 `b8d2ec4d` 이후의 개발 소스와 함께 배포하는 새 정적 앱 묶음에서 검증했습니다. 공개 실행 도구의 readonly 수정은 해당 배포의 manifest와 JS 묶음을 기준으로 확인하세요. WASM이 같은 b7이라는 사실만으로 JS의 readonly 수정까지 반영됐다고 판단하지 마세요. 새 Zig/WASM API는 npm 미게시이며 현재 npm의 기존 Rust 패키지는 이 예제의 설치 대상이 아닙니다. [게시 상태](./package-names.md)와 [Runtime 설정](./runtime.md)을 함께 확인하세요.

## 호스트가 입력을 결정하기

<!-- example:password.ts -->
```ts
import { PasswordAttemptError, type HeadlessEditor, type LoadOptions } from '@ohah/hwpjs';

export type RequestPassword = (notice: {
  attempt: number;
  retry: boolean;
}) => Promise<string | null>;

// 같은 editor의 열기/암호 요청은 호스트가 직렬화합니다.
export async function openWithPassword(
  editor: HeadlessEditor,
  bytes: Uint8Array,
  options: Pick<LoadOptions, 'format' | 'editable'>,
  requestPassword: RequestPassword,
): Promise<{ status: 'opened' | 'cancelled' }> {
  try {
    await editor.load(bytes, options);
    return { status: 'opened' };
  } catch (error) {
    // 관찰한 지원 fixture/runtime의 신호만 다룹니다. 문자열만으로 후보 존재를 증명하지 않습니다.
    if (
      !(error instanceof Error) ||
      !['EncryptedDocument', 'UnsupportedEncryption'].includes(error.message)
    )
      throw error;
  }
  let opened = false;
  let primaryError: unknown;
  let failed = false;
  try {
    for (let attempt = 1; ; attempt++) {
      // 암호를 저장하거나 로그에 출력하지 않습니다. UI/재시도 횟수는 호스트 책임입니다.
      const password = await requestPassword({ attempt, retry: attempt > 1 });
      if (password === null) return { status: 'cancelled' };
      try {
        await editor.unlock(password);
        opened = true;
        return { status: 'opened' };
      } catch (error) {
        // 이 오류만 같은 후보에 재시도할 수 있습니다. 메시지 문자열만 보고 재시도하지 않습니다.
        if (!(error instanceof PasswordAttemptError)) throw error;
      }
    }
  } catch (error) {
    failed = true;
    primaryError = error;
    throw error;
  } finally {
    // 후보 정리가 원래 실패를 가리지 않도록 두 오류를 보존합니다.
    if (!opened) {
      try {
        await editor.cancelLoad();
      } catch (cleanupError) {
        if (failed)
          // oxlint-disable-next-line no-unsafe-finally -- 암호 후보 정리 실패 때 원래 오류와 cleanup 오류의 AggregateError 우선순위를 보존한다.
          throw new AggregateError([primaryError, cleanupError], 'PasswordCandidateCleanupFailed', {
            cause: primaryError,
          });
        // oxlint-disable-next-line no-unsafe-finally -- 암호 후보 정리 실패 때 원래 오류와 cleanup 오류의 AggregateError 우선순위를 보존한다.
        throw cleanupError;
      }
    }
  }
}
```

초기 `EncryptedDocument`/`UnsupportedEncryption` 문자열은 여기서 관찰한 지원 fixture/runtime 흐름의 신호입니다. 현재 public load 오류는 `passwordRequired` 후보 metadata를 제공하지 않으므로 이 문자열만으로 후보 존재를 보장하거나 범용 암호 필요 판정기로 사용하지 마세요. unlock의 `NoLockedCandidate` 등 `PasswordAttemptError`가 아닌 오류는 prompt를 반복하지 않고 호출자에게 전달합니다.

`requestPassword`는 사용자가 취소하면 `null`을 반환합니다. 콜백은 `attempt`/`retry`로 안내를 바꾸거나 재시도 한도를 정할 수 있습니다. 예제에는 암호값·저장소·로그·브라우저 전역 dialog 호출이 없습니다. 문자열은 사용 후 완전한 메모리 삭제를 보장할 수 없으므로 호스트도 암호를 별도 캐시나 분석 로그에 남기지 마세요.

## 성공·거부·취소를 구분하기

| 상황 | 예제 동작 | 활성 문서 |
| --- | --- | --- |
| 평문 또는 즉시 열기 성공 | `opened`, 암호 콜백 호출 없음 | 새 문서로 교체 |
| 암호 후보 초기 거부 | 이번 표본의 HWP5 `UnsupportedEncryption`, HWPX `EncryptedDocument`에서 입력 요청 | 기존 A 유지 |
| 오답 후 `PasswordAttemptError` | 같은 후보에 다시 입력 요청 | 정답이 확인될 때까지 A 유지 |
| 사용자 취소 또는 입력 콜백 실패 | 후보 `cancelLoad`; 취소는 `cancelled`, 콜백 오류는 호출자에게 전달(정리도 실패하면 두 오류 보존) | A 유지, editor를 dispose하지 않음 |
| 손상 입력·다른 unlock 오류 | 일반 오류를 무한 재시도하지 않음 | 실패한 후보를 해제하며 A 유지 |
| `editable: false`로 열기 성공 | 관측·선택 가능, 쓰기는 `ReadOnlyDocument`로 거부 | 새 문서를 readonly로 활성화 |

readonly 요청은 최초 `load` 옵션으로 정합니다. `unlock`에서 `editable` 같은 임의 옵션을 넣어 권한을 승격하거나 강등하는 사용법으로 안내하지 않습니다. `getSelectionFormatting`의 target reason이나 UI disabled만으로 권한을 대신하지 않고 실제 명령 결과도 처리해야 합니다.

## 후보 소유권과 editor 수명

이 도우미는 같은 editor에서 하나의 파일 열기·암호 입력 흐름을 호스트가 직렬화한다는 전제입니다. 별도 열기나 다른 `cancelLoad`를 동시에 실행해 서로의 후보를 취소하지 않도록 하나의 입구에서 관리하세요. 대화상자를 닫는 것과 editor 전체를 종료하는 것은 다릅니다. 이 예제는 Native parse를 선점 중단한다고 약속하지 않습니다.

취소 뒤 A를 계속 편집하거나 B를 다시 열 수 있습니다. 호스트가 작업 전체를 끝낼 때는 [편집 예제](./editing.md)의 `withEditor`처럼 `finally`에서 dispose합니다. 입력 콜백 오류가 나면 후보 정리를 시도하며, 호스트가 editor를 종료하지 않았다면 A를 유지합니다. 정리도 실패하면 `AggregateError.errors`에 원래 오류와 정리 오류를 담고 `cause`에 원래 오류를 보존합니다. 취소 정리만 실패한 경우에는 해당 정리 오류를 전달하므로 성공한 취소로 표시하지 마세요. 호스트가 도중에 editor를 dispose한 경우에는 A 유지나 재사용을 약속하지 않습니다. 종료한 editor는 재사용하지 않습니다.

## 실측 범위와 남은 제한

검증은 기존 추적 암호 fixture 두 형식과 실제 b7 WASM·수정된 core의 load/unlock/cancel/read/typed 명령으로 수행했습니다. 공개 예제 암호를 본문이나 코드에 복제하지 않습니다. 전체 암호 알고리즘·모든 문서·원본 보호 출력 정책까지 지원한다는 뜻은 아닙니다. 암호 해제와 암호가 해제된 사본의 저장 동의, 오래된 조판 저장 동의는 별개이며 저장 허용 옵션을 자동으로 켜지 않습니다.

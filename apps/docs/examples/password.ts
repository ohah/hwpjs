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
    if (!(error instanceof Error) ||
      !['EncryptedDocument', 'UnsupportedEncryption'].includes(error.message)) throw error;
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
      try { await editor.cancelLoad(); }
      catch (cleanupError) {
        if (failed) throw new AggregateError(
          [primaryError, cleanupError], 'PasswordCandidateCleanupFailed', { cause: primaryError },
        );
        throw cleanupError;
      }
    }
  }
}

import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { OcrProcessOutput } from './types.ts';
import { OcrError, ocrLimits, ownedBytes, isRecord, errorCode, ocrSignal } from './common.ts';

// shell을 쓰지 않으며 종료·취소·한도 초과 모두 소유 child의 close까지 기다립니다.
export function runOcrProcess(options: unknown = {}): Promise<OcrProcessOutput> {
  if (!isRecord(options)) throw new TypeError('InvalidOcrExecutable');
  const { executable, args = [], input = new Uint8Array(), limits } = options;
  const signal = ocrSignal(options.signal);
  const budget = ocrLimits(limits);
  const length = Array.isArray(args) ? args.length : -1;
  if (
    typeof executable !== 'string' ||
    !executable ||
    !executable.isWellFormed() ||
    executable.includes('\0') ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > 32
  )
    throw new TypeError('InvalidOcrExecutable');
  const argv: string[] = [];
  for (let index = 0; index < length; index++) {
    const value: unknown = Array.isArray(args) ? args[index] : undefined;
    if (typeof value !== 'string' || !value.isWellFormed() || value.includes('\0'))
      throw new TypeError('InvalidOcrExecutable');
    argv.push(value);
  }
  const owned = ownedBytes(input, budget.maxInputBytes, 'Ocr', true);
  if (signal?.aborted) return Promise.reject(new OcrError('OcrAborted'));
  return new Promise<OcrProcessOutput>((resolve, reject) => {
    const grouped = process.platform !== 'win32';
    let child: ChildProcessWithoutNullStreams | undefined;
    let failure: OcrError | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let killer: ReturnType<typeof setTimeout> | undefined;
    const stdout: Buffer[] = [],
      stderr: Buffer[] = [];
    let outputBytes = 0,
      errorBytes = 0;
    const stop = (reason: OcrError) => {
      failure ??= reason;
      if (!child) return;
      const ownedChild = child;
      const kill = (sig: NodeJS.Signals) => {
        try {
          if (grouped && ownedChild.pid) process.kill(-ownedChild.pid, sig);
          else ownedChild.kill(sig);
        } catch (error) {
          if (errorCode(error) !== 'ESRCH')
            failure ??= new OcrError('OcrCleanupFailed', { cause: error });
        }
      };
      child.stdin?.destroy();
      kill('SIGTERM');
      killer ??= setTimeout(() => kill('SIGKILL'), 200);
    };
    const abort = () => stop(new OcrError('OcrAborted'));
    try {
      child = spawn(executable, argv, {
        shell: false,
        detached: grouped,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, OMP_THREAD_LIMIT: '1' },
      });
    } catch (cause) {
      reject(new OcrError('ProviderUnavailable', { cause }));
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', (cause) =>
      stop(
        new OcrError(
          ['ENOENT', 'EACCES'].includes(errorCode(cause) ?? '')
            ? 'ProviderUnavailable'
            : 'OcrProcessFailed',
          { cause },
        ),
      ),
    );
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > budget.maxStdoutBytes) stop(new OcrError('OcrOutputLimitExceeded'));
      else stdout.push(Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      errorBytes += chunk.length;
      if (errorBytes > budget.maxStderrBytes) stop(new OcrError('OcrStderrLimitExceeded'));
      else stderr.push(Buffer.from(chunk));
    });
    child.stdin.on('error', (cause) => {
      if (errorCode(cause) !== 'EPIPE') stop(new OcrError('OcrInputWriteFailed', { cause }));
    });
    const ownedChild = child;
    child.once('close', (code, terminationSignal) => {
      clearTimeout(timer);
      clearTimeout(killer);
      signal?.removeEventListener('abort', abort);
      // 일반 종료라도 같은 소유 프로세스 그룹의 후손을 남기지 않습니다.
      if (grouped && ownedChild.pid) {
        try {
          process.kill(-ownedChild.pid, 'SIGKILL');
        } catch (error) {
          if (errorCode(error) !== 'ESRCH')
            failure ??= new OcrError('OcrCleanupFailed', { cause: error });
        }
      }
      if (failure) {
        reject(failure);
        return;
      }
      if (code !== 0 || terminationSignal) {
        const error = new OcrError('ProviderFailed', { reason: 'NonzeroExit' });
        error.exitCode = code;
        error.stderr = Buffer.concat(stderr).toString('utf8');
        reject(error);
        return;
      }
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        resolve({
          stdout: decoder.decode(Buffer.concat(stdout)),
          stderr: decoder.decode(Buffer.concat(stderr)),
          exitCode: code,
        });
      } catch (cause) {
        reject(new OcrError('ProviderInvalidResponse', { cause }));
      }
    });
    timer = setTimeout(() => stop(new OcrError('OcrTimeout')), budget.timeoutMs);
    if (signal?.aborted) abort();
    else child.stdin.end(owned);
  });
}

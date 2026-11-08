import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOcrProcess } from '../src/ocr/process.ts';

test('실제 소유 child에 bytes stdin을 전달하고 UTF8 stdout만 받는다', async () => {
  const result = await runOcrProcess({
    executable: process.execPath,
    args: ['-e', 'process.stdin.pipe(process.stdout)'],
    input: new TextEncoder().encode('한글 English'),
  });
  assert.equal(result.stdout, '한글 English');
  assert.equal(result.stderr, '');
});

test('실행 인수는 고정 길이로 한 번 포착하며 외부 iterator를 실행하지 않는다', async () => {
  const args = ['-e', 'process.stdout.write("ok")'];
  args[Symbol.iterator] = () => {
    throw new Error('인수 iterator 금지');
  };
  assert.equal((await runOcrProcess({ executable: process.execPath, args })).stdout, 'ok');
});

test('실행기 부재·비정상 종료·잘못된 UTF8을 빈 텍스트 성공으로 만들지 않는다', async () => {
  await assert.rejects(runOcrProcess({ executable: '/missing/hwpjs-ocr-provider' }), {
    code: 'ProviderUnavailable',
  });
  await assert.rejects(
    runOcrProcess({ executable: process.execPath, args: ['-e', 'process.exit(2)'] }),
    { code: 'ProviderFailed' },
  );
  await assert.rejects(
    runOcrProcess({
      executable: process.execPath,
      args: ['-e', 'process.stdout.write(Buffer.from([0xc3,0x28]))'],
    }),
    { code: 'ProviderInvalidResponse' },
  );
});

test('stdout·stderr 예산 초과는 절단 성공 대신 child 종료 뒤 실패한다', async () => {
  await assert.rejects(
    runOcrProcess({
      executable: process.execPath,
      args: ['-e', 'process.stdout.write("x".repeat(128))'],
      limits: { maxStdoutBytes: 8 },
    }),
    { code: 'OcrOutputLimitExceeded' },
  );
  await assert.rejects(
    runOcrProcess({
      executable: process.execPath,
      args: ['-e', 'process.stderr.write("x".repeat(128))'],
      limits: { maxStderrBytes: 8 },
    }),
    { code: 'OcrStderrLimitExceeded' },
  );
});

test('timeout은 소유 child가 실제로 종료된 후 거부한다', async (t) => {
  const dir = await fs.mkdtemp(join(tmpdir(), 'hwpjs-ocr-process-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const pidFile = join(dir, 'pid');
  const script =
    'require("node:fs").writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)';
  await assert.rejects(
    runOcrProcess({
      executable: process.execPath,
      args: ['-e', script, pidFile],
      limits: { timeoutMs: 1000 },
    }),
    { code: 'OcrTimeout' },
  );
  const pid = Number(await fs.readFile(pidFile, 'utf8'));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('명시 취소도 소유 child 종료를 기다리고 abort listener를 남기지 않는다', async (t) => {
  const dir = await fs.mkdtemp(join(tmpdir(), 'hwpjs-ocr-abort-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const pidFile = join(dir, 'pid');
  const controller = new AbortController();
  const pending = runOcrProcess({
    executable: process.execPath,
    signal: controller.signal,
    args: [
      '-e',
      'require("node:fs").writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)',
      pidFile,
    ],
  });
  pending.catch(() => {});
  t.after(async () => {
    controller.abort();
    await pending.catch(() => {});
  });
  for (let i = 0; i < 100; i++) {
    try {
      await fs.access(pidFile);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  const pid = Number(await fs.readFile(pidFile, 'utf8'));
  controller.abort();
  await assert.rejects(pending, { code: 'OcrAborted' });
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

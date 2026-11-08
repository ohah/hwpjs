import test from 'node:test';
import assert from 'node:assert/strict';
import { runStructuralCommand } from '../../packages/cli/src/structural-host.ts';
import { extendedDocumentTools } from '../../packages/cli/src/mcp/extended-tools.ts';

function htmlHost(warnings) {
  const calls = { published: 0, bytes: null };
  const sourceSha256 = 'a'.repeat(64);
  const context = {
    files: {
      async readInputSnapshot() {
        return {
          path: '/원본.hwp',
          sha256: sourceSha256,
          bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
        };
      },
      async assertNewOutput() {
        return { path: '/새.html' };
      },
      assertHTMLFormat() {},
      async publishNewOutput({ bytes }) {
        calls.published++;
        calls.bytes = bytes;
        return { path: '/새.html', sha256: 'b'.repeat(64), warnings: [] };
      },
    },
    io: { stdout: { write() {} }, stderr: { write() {} } },
    async loadWasm() {
      return new Uint8Array([1]);
    },
    dependencies: {
      async exportDocumentHTML() {
        return {
          format: 'hwp5',
          html: '<!doctype html><p>본문</p>',
          sourceSha256,
          semanticOnly: true,
          warnings,
        };
      },
    },
    onPublished() {},
  };
  return {
    calls,
    context,
    options: {
      command: 'export-html',
      input: '/원본.hwp',
      output: '/새.html',
      embedImages: 'none',
    },
  };
}

test('HTML 경고 배열의 변하는 length가 4096개 한도를 우회하지 못한다', async () => {
  let reads = 0;
  const warnings = new Proxy([], {
    get(target, key, receiver) {
      if (key === 'length') return ++reads === 1 ? 4096 : 4097;
      if (typeof key === 'string' && /^\d+$/u.test(key)) return '관측 경고';
      return Reflect.get(target, key, receiver);
    },
  });
  const f = htmlHost(warnings);
  // 안전하게 거부하거나, 최초 승인한 고정 길이 4096개까지만 처리해야 합니다.
  try {
    await runStructuralCommand(f.options, f.context);
  } catch {
    assert.equal(f.calls.published, 0);
    return;
  }
  assert.equal(reads, 1);
});

test('세 신규 MCP 입력은 알 수 없는 필드를 거부하고 경로를 옵션과 분리한다', async () => {
  const invocations = [];
  const tools = extendedDocumentTools({
    invoke: async (argv) => {
      invocations.push(argv);
      return { content: [] };
    },
    wasm: [],
  });
  const cases = [
    [
      'delete_document_table',
      {
        inputPath: '--help',
        outputPath: '-출력.hwp',
        reference: `hwpjs-object:${'a'.repeat(64)}/hwp5/s0/table/20`,
        allowStaleLayout: true,
      },
    ],
    [
      'insert_document_image',
      {
        inputPath: '--help',
        outputPath: '-출력.hwp',
        expectedSha256: 'a'.repeat(64),
        target: 's0:p0',
        unit: 0,
        expectedText: '',
        imagePath: '--image.png',
        width: 1,
        height: 1,
        allowStaleLayout: true,
      },
    ],
    [
      'export_document_html',
      { inputPath: '--help', outputPath: '-출력.html', embedImages: 'none' },
    ],
  ];
  for (const [name, value] of cases) {
    const tool = tools.find((item) => item.name === name);
    assert(tool);
    assert.equal(tool.config.inputSchema.safeParse({ ...value, unexpected: true }).success, false);
    const parsed = tool.config.inputSchema.parse(value);
    await tool.invoke(parsed, {});
    assert.deepEqual(invocations.at(-1).slice(-2), ['--', '--help']);
  }
});

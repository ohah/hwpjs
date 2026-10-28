import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditor,
  createParagraphSelection,
  APPLY_FORMATTING_PATCH_COMMAND,
} from '../../src/index.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';

import type { EditorRuntime, RuntimeMessage, RuntimeReply } from '../../src/contracts.ts';
const known = (value: unknown, unit?: string) => ({
  state: 'known',
  value,
  writable: true,
  ...(unit ? { unit } : {}),
});
const unknown = () => ({
  state: 'unknown',
  reason: 'MissingSourceField',
  writable: false,
  writeUnavailableReason: 'MissingSourceField',
});
const fields = {
  'paragraph.alignment': known('LEFT'),
  'paragraph.margins.left': known(17, 'HWPUNIT'),
  'paragraph.grid': unknown(),
  'character.bold': known(false),
  'character.ratio': known({ hangul: 100 }),
};
function backend(
  options: {
    trusted?: boolean;
    nativeCode?: number;
    postError?: string;
    delay?: () => Promise<void>;
    delayKind?: RuntimeMessage['kind'];
  } = {},
) {
  const calls: RuntimeMessage[] = [];
  const issuedBindings: { session: string; revision: number }[] = [];
  let revision = 0,
    bindingRevision = 0,
    closed = false;
  const content = () => ({
    format: 'hwpx',
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: 'AB😀CD',
        editable: true,
        selectionOwner: 'section:0:body',
      },
    ],
  });
  const runtime: EditorRuntime = {
    async request(message, context) {
      calls.push(message);
      const base = {
        kind: message.kind,
        historyRevision: revision,
        meta: { context, application: 'unapplied' as const, changed: false },
      };
      if (message.kind === 'formatting-capabilities')
        return {
          ...base,
          formattingCapabilities: {
            schemaVersion: 1,
            atomic: true,
            format: 'hwpx',
            coordinateSpace: 'native-source-utf16',
            requiresHistoryProtocol: 2,
            binding: { session: 'native-unit-session', revision: bindingRevision },
            fields: Object.fromEntries(
              Object.keys(fields).map((k) => [k, { readable: true, writable: true }]),
            ),
            limits: {
              requestBytes: 65536,
              replyBytes: 2097152,
              targets: 4096,
              ranges: 4096,
              commands: 4096,
              fontNameBytes: 4096,
              projectionBytes: 33554432,
            },
          },
        };
      if (message.kind === 'query-formatting') {
        issuedBindings.push({ session: 'native-unit-session', revision: bindingRevision });
        const wanted = message.fields as readonly string[] | undefined;
        const rows = Object.fromEntries(
          Object.entries(fields).filter(([key]) => wanted === undefined || wanted.includes(key)),
        );
        return {
          ...base,
          formatting: {
            schemaVersion: 1,
            binding: { session: 'native-unit-session', revision: bindingRevision },
            targets: [
              {
                ref: 'native-opaque-original-owner',
                ...((message.selector as any)?.ranges
                  ? { ranges: (message.selector as any).ranges }
                  : {}),
              },
            ],
            observations: {
              perTarget: [{ ref: 'native-opaque-original-owner', fields: rows }],
              aggregate: rows,
            },
          },
        };
      }
      if (message.kind === 'formatting-patch') {
        const request = message.request as { binding: { revision: number } };
        if (request.binding.revision !== bindingRevision)
          return {
            ...base,
            formattingNativeCode: 0,
            error: 'StaleFormattingBinding',
          } as RuntimeReply;

        const code = options.nativeCode ?? 1;
        if (code === 1) {
          revision++;
          bindingRevision++;
        }
        return {
          ...base,
          formattingNativeCode: code,
          historyRevision: revision,
          ...(code === 3 ? { historyPoisoned: true } : {}),
          ...(options.postError
            ? { error: options.postError }
            : code === 0
              ? { error: 'NativeRefused' }
              : {}),
          ...(code === 1 && !options.postError ? { content: content() } : {}),
          meta: {
            context,
            application: code === 1 ? 'applied' : code === 3 ? 'unknown' : 'unapplied',
            changed: code === 3 ? null : code === 1,
          },
        } as RuntimeReply;
      }
      if (message.kind === 'splice') {
        revision++;
        bindingRevision++;
        return {
          ...base,
          historyRevision: revision,
          content: content(),
          meta: { context, application: 'applied', changed: true },
        } as RuntimeReply;
      }
      return { ...base, content: content() };
    },
    dispose() {
      closed = true;
    },
  };
  if (options.trusted)
    bindRuntimeAdmission(
      runtime,
      async (m, c, a) => {
        if (options.delayKind === undefined || m.kind === options.delayKind)
          await options.delay?.();
        a();
        return runtime.request(m, c);
      },
      () => !closed,
    );
  const editor = createEditor({ runtimeFactory: () => runtime });
  return {
    runtime,
    editor,
    calls,
    issuedBindings,
    advanceNativeBinding: () => {
      bindingRevision++;
    },
  };
}
async function loaded(options: Parameters<typeof backend>[0] = {}, editable = true) {
  const h = backend(options);
  await h.editor.load(new Uint8Array([1]), { format: 'hwpx', editable });
  return h;
}
const target = (h: Awaited<ReturnType<typeof loaded>>, startUnit = 0, endUnit = startUnit) =>
  createParagraphSelection(h.editor.getEditorState(), {
    section: 0,
    paragraph: 0,
    startUnit,
    endUnit,
  });
const patch = {
  paragraph: {
    alignment: 'RIGHT' as const,
    margins: { left: 31 },
    spacing: { kind: 'percent' as const, value: 120 },
  },
};

const whole = {
  character: {
    bold: true,
    textColor: 0x123456,
    fonts: { hangul: { name: '맑은 고딕' } },
    ratio: { hangul: 120 },
    charSpacing: { latin: -5 },
    relativeSize: { hangul: 90 },
    offset: { hangul: 4 },
    underline: { kind: 'bottom', style: 'DOT' },
    strike: { enabled: true, style: 'SOLID' },
    shadow: { kind: 'none' },
  },
} as const;
test('전체 글자 patch는 기존 admission/Native binding으로 한 번만 전송한다', async () => {
  const h = await loaded({ trusted: true });
  try {
    const r = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
      target: target(h, 0, 2),
      selectionVersion: h.editor.getEditorState().stateVersion,
      patch: whole,
    });
    assert.equal(r.status, 'committed-with-snapshot');
    const calls = h.calls.filter((m) => m.kind === 'formatting-patch');
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify((calls[0].request as any).patch)), whole);
    assert.deepEqual(JSON.parse(JSON.stringify((calls[0].request as any).targets[0].ranges)), [
      { startUnit: 0, endUnit: 2 },
    ]);
    assert.equal(h.editor.getEditorState().nativeHistoryRevision, 1);
  } finally {
    await h.editor.dispose();
  }
});
test('읽기 전용 전체 글자 patch는 Native 조회나 쓰기 없이 거부한다', async () => {
  const h = await loaded({ trusted: true }, false);
  try {
    const n = h.calls.length;
    const r = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
      target: target(h, 0, 2),
      patch: whole,
    });
    assert.equal(r.error, 'ReadOnlyDocument');
    assert.equal(h.calls.length, n);
  } finally {
    await h.editor.dispose();
  }
});
test('지원하지 않는 런타임에 글자 capability를 합성하지 않는다', async () => {
  const h = await loaded();
  try {
    const r = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
      target: target(h, 0, 2),
      patch: whole,
    });
    assert.equal(r.error, 'UnsupportedAtomicRuntime');
    assert.equal(h.calls.filter((m) => m.kind === 'formatting-patch').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('Native 거부는 글자와 문단을 별도 setter로 재시도하지 않는다', async () => {
  const h = await loaded({ trusted: true, nativeCode: 0 });
  try {
    const r = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
      target: target(h, 0, 2),
      patch: { ...whole, ...patch },
    });
    assert.equal(r.status, 'rejected-unapplied');
    assert.equal(h.calls.filter((m) => m.kind === 'formatting-patch').length, 1);
    assert.equal(h.editor.getEditorState().nativeHistoryRevision, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('명시 문자 reset도 같은 단일 명령과 범위를 쓴다', async () => {
  const h = await loaded({ trusted: true });
  try {
    const r = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
      target: target(h, 0, 2),
      patch: { reset: { basis: 'paragraph-style', scope: 'character' } },
    });
    assert.equal(r.status, 'committed-with-snapshot');
    assert.equal(h.calls.filter((m) => m.kind === 'formatting-patch').length, 1);
  } finally {
    await h.editor.dispose();
  }
});

test('글자 변경의 빈 범위는 Native 준비 전에 거부하지만 문단 빈 patch는 유지한다', async () => {
  const h = await loaded({ trusted: true });
  try {
    const n = h.calls.length;
    const r = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
      target: target(h),
      patch: whole,
    });
    assert.equal(r.error, 'EmptyCharacterSelection');
    assert.equal(h.calls.length, n);
    const noop = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
      target: target(h),
      patch: { character: {} },
    });
    assert.equal(noop.status, 'committed-with-snapshot');
    assert.equal(
      (h.calls.find((m) => m.kind === 'formatting-patch')!.request as any).targets[0].ranges,
      undefined,
    );
  } finally {
    await h.editor.dispose();
  }
});
test('오래된 선택 fence는 글자 Native 쓰기를 시작하지 않는다', async () => {
  const h = await loaded({ trusted: true });
  try {
    const r = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
      target: target(h, 0, 2),
      selectionVersion: 0,
      patch: whole,
    });
    assert.equal(r.error, 'StaleFormattingSelection');
    assert.equal(h.calls.filter((m) => m.kind === 'formatting-patch').length, 0);
  } finally {
    await h.editor.dispose();
  }
});

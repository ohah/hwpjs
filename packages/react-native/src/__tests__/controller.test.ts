import { test, expect } from 'bun:test';
import { createEditor, SPLICE_TEXT_COMMAND } from '@hwpjs/core';
import { createNativeController, createNativeEditorController, createNativeProvider } from '../index.ts';
import type { NativeInputHooks, NativeRuntimeTransport } from '../index.ts';

function providerFixture() {
  const sessions: { disposed: number; invalidated: number; messages: string[] }[] = [];
  const provider = createNativeProvider({ createTransport() {
    const session = { disposed: 0, invalidated: 0, messages: [] as string[] };
    sessions.push(session);
    let text = 'initial', revision = 0;
    const snapshot = () => ({ format: 'hwp5', paragraphs: [{ section: 0, paragraph: 0, text, editable: true, selectionOwner: 'body' }] });
    const transport: NativeRuntimeTransport = {
      descriptor: { protocol: 'hwpjs.editor-runtime/1', abiVersion: 1, projection: 'shared-provider', implementation: 'fake transport, real core controller' },
      async request(message) {
        session.messages.push(message.kind);
        if (message.kind === 'save') return { kind: 'save', bytes: new TextEncoder().encode(text) };
        if (message.kind === 'splice') { text += message.text; revision++; }
        if (['load', 'enable', 'splice', 'snapshot'].includes(message.kind)) return {
          kind: message.kind, content: snapshot(), historyRevision: revision,
          meta: { application: message.kind === 'splice' ? 'applied' : 'unapplied', changed: message.kind === 'splice' },
        };
        return { kind: message.kind, error: 'UnsupportedFakeOperation', applied: false };
      },
      invalidate() { session.invalidated++; }, dispose() { session.disposed++; },
    };
    return transport;
  } });
  return { provider, sessions };
}
const hooks = (overrides: Partial<NativeInputHooks> = {}): NativeInputHooks => ({ commitComposition: () => 'unchanged', cancelComposition() {}, ...overrides });

test('native provider delegates load/edit/save and snapshots to the actual HeadlessEditor with fake transport', async () => {
  const f = providerFixture(), controller = createNativeEditorController(f.provider);
  const editor = controller.editor;
  await editor.load(new Uint8Array([1]), { format: 'hwp5' });
  const state = editor.getEditorState();
  const result = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
    target: { ...state.token, format: 'hwp5', coordinateSpace: 'display', owner: 'body', section: 0, paragraph: 0, startUnit: 0, endUnit: 0, affinity: 'forward' }, text: 'X',
  });
  expect(result.status).toBe('committed-with-snapshot');
  expect(new TextDecoder().decode((await editor.save()).bytes)).toBe('initialX');
  expect(f.sessions[0].messages).toEqual(['load', 'enable', 'splice', 'save']);
  await controller.dispose();
  expect(f.sessions[0].disposed).toBe(1);
});

test('external core editor is never disposed by native controller; stale lease cannot detach a successor', async () => {
  const f = providerFixture(), editor = createEditor({ runtimeFactory: f.provider.runtimeFactory });
  await editor.load(new Uint8Array([1]), { format: 'hwp5' });
  const controller = createNativeController(editor), reasons: string[] = [];
  const first = controller.attachInputSurface(hooks({ cancelComposition: reason => { reasons.push(reason); } }));
  expect(() => controller.attachInputSurface(hooks())).toThrow('NativeInputSurfaceAlreadyAttached');
  controller.detachInputSurface();
  const next = controller.attachInputSurface(hooks());
  expect(next.generation).toBeGreaterThan(first.generation);
  first.release(); expect(next.isActive()).toBe(true);
  await controller.dispose();
  expect(controller.editor === editor).toBe(true);
  expect(next.isActive()).toBe(false); expect(first.isActive()).toBe(false);
  expect(reasons).toEqual(['detach']); expect(f.sessions[0].disposed).toBe(0);
  expect(editor.getEditorState().status).toBe('ready');
  expect(() => controller.attachInputSurface(hooks())).toThrow('NativeControllerDisposed');
  await editor.save(); await editor.dispose();
  expect(f.sessions[0].disposed).toBe(1);
});

test('owned controller disposal synchronously fences the real core editor and is idempotent', async () => {
  const f = providerFixture(), controller = createNativeEditorController(f.provider);
  await controller.editor.load(new Uint8Array([1]), { format: 'hwp5' });
  const reasons: string[] = [];
  const lease = controller.attachInputSurface(hooks({ cancelComposition: reason => { reasons.push(reason); } }));
  const disposal = controller.dispose();
  expect(controller.dispose() === disposal).toBe(true);
  expect(controller.editor.getEditorState().status).toBe('disposed');
  expect(lease.isActive()).toBe(false);
  await expect(controller.editor.save()).rejects.toThrow('EditorDisposed');
  await disposal;
  expect(reasons).toEqual(['dispose']);
  expect(f.sessions[0].invalidated).toBe(1); expect(f.sessions[0].disposed).toBe(1);
});

test('native input composition settlement uses the core lease gate instead of another input queue', async () => {
  const f = providerFixture(), controller = createNativeEditorController(f.provider);
  await controller.editor.load(new Uint8Array([1]), { format: 'hwp5' });
  controller.attachInputSurface(hooks({ commitComposition: () => 'blocked' }));
  await expect(controller.editor.save()).rejects.toThrow('CompositionBlocked');
  expect(f.sessions[0].messages).toEqual(['load', 'enable']);
  controller.detachInputSurface();
  await controller.editor.save();
  expect(f.sessions[0].messages).toEqual(['load', 'enable', 'save']);
  await controller.dispose();
});

test('multiple native editor candidates get separate transports and provider configuration is captured', async () => {
  const f = providerFixture();
  const one = createNativeEditorController(f.provider), two = createNativeEditorController(f.provider);
  await Promise.all([one.editor.load(new Uint8Array([1]), { format: 'hwp5' }), two.editor.load(new Uint8Array([2]), { format: 'hwp5' })]);
  expect(f.sessions).toHaveLength(2);
  await one.dispose(); expect(f.sessions[1].disposed).toBe(0);
  await two.editor.save(); await two.dispose();
  expect(f.sessions.map(s => s.disposed)).toEqual([1, 1]);
});

import type { NativeCanvasSurface, NativeCanvasSession } from './contracts.ts';
import { createNativeProvider } from '../provider.ts';
import type { CreateEditorOptions, HeadlessEditor, StateToken } from '@hwpjs/core';
import { SPLICE_TEXT_COMMAND } from '@hwpjs/core';
import { createNativeContextTransport } from './context-transport.ts';
import type { NativeJsiContextBinding } from './context-port.ts';
// @ts-ignore Shared pure Canvas implementation, with an explicit platform port.
import { createCanvasSession } from './create-canvas-session.mjs';
export interface NativeCanvasProvider {
  createEditor(options?: Omit<CreateEditorOptions, 'runtimeFactory'>): HeadlessEditor;
  attachCanvas(editor: HeadlessEditor, surface: NativeCanvasSurface): NativeCanvasSession;
}
export function createNativeCanvasProvider(
  binding: NativeJsiContextBinding,
  options: { observe?: (event: Readonly<Record<string, unknown>>) => void } = {},
): NativeCanvasProvider {
  let serial = 0;
  const trace = (e: Record<string, unknown>) => {
    try {
      options.observe?.(e);
    } catch {}
  };
  const registered = new WeakMap<HeadlessEditor, ReturnType<typeof sourcesFor>>();
  function sourcesFor() {
    type Transport = Awaited<ReturnType<typeof createNativeContextTransport>>;
    const runtimes = new Map<string, Transport>();
    const ids = new WeakMap<Transport, number>();
    const key = (t: { editorId: string; documentId: string | null; generation: number }) =>
      JSON.stringify([t.editorId, t.documentId, t.generation]);
    const provider = createNativeProvider({
      createTransport: async () => {
        const runtime = ++serial;
        trace({ event: 'runtime-created', runtime });
        const transport = await createNativeContextTransport(binding, (e) =>
          trace({ ...e, runtime }),
        );
        ids.set(transport, runtime);
        let identity: string | undefined;
        return {
          descriptor: transport.descriptor,
          async request(message: any, context: any) {
            if (!context) throw Error('CanvasRequestIdentityMissing');
            const observed = key(context);
            if (identity !== undefined && identity !== observed)
              throw Error('CanvasRuntimeIdentityChanged');
            identity = observed;
            runtimes.set(observed, transport);
            trace({
              event: 'public-runtime-request',
              runtime,
              kind: message.kind,
              context: { ...context },
            });
            return transport.request(message);
          },
          invalidate() {
            transport.invalidate();
            if (identity && runtimes.get(identity) === transport) runtimes.delete(identity);
          },
          async dispose() {
            try {
              await transport.dispose();
            } finally {
              if (identity && runtimes.get(identity) === transport) runtimes.delete(identity);
            }
          },
        };
      },
    });
    let editor: HeadlessEditor;
    const active = (token: StateToken) => {
      const current = editor.getEditorState().token;
      if (key(token) !== key(current) || token.operationRevision !== current.operationRevision)
        throw Error('StaleCanvasObservation');
      const t = runtimes.get(key(token));
      if (!t) throw Error('NativeDocumentNotLoaded');
      return t;
    };
    return {
      create(options?: Omit<CreateEditorOptions, 'runtimeFactory'>) {
        editor = provider.createEditor(options);
        editor.registerUpdateListener((state) =>
          trace({
            event: 'public-state-callback',
            token: { ...state.token },
            status: state.status,
            nativeRevision: (state.content as any)?.nativeRevision,
          }),
        );
        return editor;
      },
      transport: {
        renderSources: async (token: StateToken, revision: number) => {
          const t = active(token),
            runtime = ids.get(t);
          trace({
            event: 'render-query',
            runtime,
            publicToken: { ...token },
            nativeRevision: revision,
          });
          const bytes = await t.renderSources(revision);
          trace({
            event: 'render-query-complete',
            runtime,
            publicToken: { ...token },
            nativeRevision: revision,
          });
          return bytes;
        },
        pictureBytes: (token: StateToken, revision: number, section: number, node: number) => {
          const t = active(token);
          trace({
            event: 'picture-query',
            runtime: ids.get(t),
            publicToken: { ...token },
            nativeRevision: revision,
            section,
            node,
          });
          return t.pictureBytes(revision, section, node);
        },
      },
    };
  }
  const attached = new WeakSet<HeadlessEditor>();
  return Object.freeze({
    createEditor(options?: Omit<CreateEditorOptions, 'runtimeFactory'>) {
      const source = sourcesFor();
      const editor = source.create(options);
      registered.set(editor, source);
      return editor;
    },
    attachCanvas(editor: HeadlessEditor, surface: NativeCanvasSurface): NativeCanvasSession {
      const source = registered.get(editor);
      if (!source) throw Error('CanvasEditorProviderMismatch');
      if (attached.has(editor)) throw Error('CanvasAlreadyAttached');
      attached.add(editor);
      try {
        return createCanvasSession({
          editor,
          transport: source.transport,
          surface,
          spliceCommand: SPLICE_TEXT_COMMAND,
        });
      } catch (error) {
        attached.delete(editor);
        throw error;
      }
    },
  });
}

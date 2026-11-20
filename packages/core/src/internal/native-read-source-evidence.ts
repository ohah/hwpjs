import type { RuntimeRequestContext } from '../contracts.ts';
import type { EditorState } from '../state/editor-state.ts';
import type { NativeReadSourceOrigin, NativeReadBinding } from './native-read-source-origin.ts';
const records = new WeakMap<
  EditorState,
  { origin: NativeReadSourceOrigin; content: unknown; context: object }
>();
/** Issued only from the built-in Runtime's private source origin. Separate from
 * NativeRuntimeOrigin and all writable/history geometry certificates. */
export function observeNativeReadSource(
  state: EditorState,
  origin: NativeReadSourceOrigin | undefined,
  candidate?: RuntimeRequestContext,
): void {
  if (!origin || !origin.authority() || state.status !== 'ready' || state.content === undefined)
    return;
  const c = origin.context;
  if (c.operationRevision !== state.operationRevision) {
    if (
      !candidate ||
      !['load', 'unlock', 'enable'].includes(origin.kind) ||
      !(['editorId', 'documentId', 'generation', 'requestId', 'operationRevision'] as const).every(
        (k) => candidate[k] === c[k],
      )
    )
      return;
  }

  if (
    c.editorId !== state.editorId ||
    c.documentId !== state.documentId ||
    c.generation !== state.generation ||
    origin.binding.format !== (state.content as any)?.format
  )
    return;
  records.set(state, { origin, content: state.content, context: origin.sourceContext });
}
export function readNativeReadSourceEvidence(state: EditorState): NativeReadBinding | undefined {
  const r = records.get(state);
  if (
    !r ||
    state.status !== 'ready' ||
    state.content !== r.content ||
    r.origin.sourceContext !== r.context ||
    !r.origin.authority()
  )
    return;
  return r.origin.binding;
}
/** Core selection publication can retain the same source, never a view/doc transition. */
export function inheritNativeReadSource(before: EditorState, next: EditorState): void {
  const r = records.get(before);
  if (
    !r ||
    !readNativeReadSourceEvidence(before) ||
    before.content !== next.content ||
    before.editorId !== next.editorId ||
    before.documentId !== next.documentId ||
    before.generation !== next.generation ||
    before.operationRevision !== next.operationRevision ||
    before.viewRevision !== next.viewRevision
  )
    return;
  records.set(next, { ...r });
}

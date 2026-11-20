import type { EditorState } from '@hwpjs/core';
/** Rebuild a Native view before granting a source identity after revocation.
 * A fresh getter alone never re-certifies an older painted frame or ref. */
export async function prepareDocumentTextReadView(port: {
  state(): EditorState;
  current(): boolean;
  hasEvidence(state: EditorState): boolean;
  bindingAvailable(): Promise<boolean>;
  refresh(): Promise<void>;
  wait(current: () => boolean): Promise<boolean>;
}): Promise<'current' | 'refreshed' | 'unavailable'> {
  const captured = port.state();
  const current = () => {
    const state = port.state();
    return (
      port.current() &&
      state.status === 'ready' &&
      captured.documentId === state.documentId &&
      captured.generation === state.generation &&
      captured.operationRevision === state.operationRevision &&
      captured.nativeHistoryRevision === state.nativeHistoryRevision
    );
  };
  if (captured.status !== 'ready' || !current()) return 'unavailable';
  if (port.hasEvidence(captured))
    return (await port.wait(current)) && current() ? 'current' : 'unavailable';
  const available = await port.bindingAvailable();
  if (!current()) return 'unavailable';
  if (!available)
    return (captured.capabilities as any)?.readOnly !== true &&
      (await port.wait(current)) &&
      current()
      ? 'current'
      : 'unavailable';
  await port.refresh();
  if (
    !current() ||
    !port.hasEvidence(port.state()) ||
    (captured.selection && !port.state().selection)
  )
    return 'unavailable';
  return (await port.wait(current)) && current() ? 'refreshed' : 'unavailable';
}

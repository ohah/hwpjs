import {
  strictLayoutTransport,
  hasStrictLayoutTransport,
} from '../../js/hwp5-strict-layout-transport.mjs';
export const strictLayoutKinds = new Set([
  'strict-layout-prepare',
  'strict-layout-commit',
  'strict-layout-cancel',
]);

// Runtime-local, serialized by the existing request queue. Tokens bind a Native
// snapshot, not the truth of arbitrary host metrics. Native validates at commit.
export function createStrictLayoutWorker({ current, consent }) {
  let serial = 0,
    pending;
  function reset() {
    const previous = pending;
    pending = undefined;
    if (previous) previous.transport.cancel();
  }
  function available() {
    try {
      const state = current();
      if (
        state.format !== 'hwp5' ||
        !state.historyEnabled ||
        state.poisoned ||
        !hasStrictLayoutTransport(state.editor)
      )
        return false;
      const stats = state.editor.historyStats?.();
      return stats?.protocolVersion === 2 && stats.poisoned !== true;
    } catch {
      return false;
    }
  }
  function handle(message) {
    const base = { kind: message.kind, requestId: message.requestId };
    if (message.kind === 'strict-layout-cancel') {
      if (
        pending &&
        (message.ticket === pending.ticket ||
          (typeof message.prepareRequestId === 'string' &&
            message.prepareRequestId === pending.requestId))
      )
        reset();
      return base;
    }
    if (!available()) throw Error('StrictMeasuredSaveUnavailable');
    consent(message.allowUnprotectedOutput);
    if (message.kind === 'strict-layout-prepare') {
      if (pending) throw Error('StrictLayoutMeasurementInProgress');
      if (serial >= Number.MAX_SAFE_INTEGER) throw Error('StrictLayoutSequenceExhausted');
      const editor = current().editor,
        transport = strictLayoutTransport(editor);
      const snapshot = transport.prepare();
      const ticket = `strict-layout-${++serial}`;
      pending = { editor, transport, ticket, requestId: message.requestId };
      return { ...base, snapshot, ticket };
    }
    const owned = pending;
    // A late commit/cancel can never consume a different newer snapshot.
    if (!owned || message.ticket !== owned.ticket || current().editor !== owned.editor)
      throw Error('StrictLayoutMeasurementExpired');
    pending = undefined;
    try {
      if (!Array.isArray(message.lines) || !message.lines.length || message.lines.length > 262144)
        throw Error('InvalidStrictLayoutLines');
      const saved = owned.transport.commit(message.lines);
      if (
        !(saved?.bytes instanceof Uint8Array) ||
        !saved.bytes.length ||
        saved.layoutRequiresReflow !== false
      )
        throw Error('InvalidStrictMeasuredSave');
      return { ...base, ...saved, format: 'hwp5' };
    } finally {
      owned.transport.cancel();
    }
  }
  return { available, reset, handle };
}

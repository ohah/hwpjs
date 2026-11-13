import { createChartDataPort } from '../src/chart-data-port.ts';

export function fixture() {
  let state, read, write;
  const calls = [],
    listeners = new Set();
  const content = {
    format: 'hwpx',
    chartEditAvailable: true,
    chartStringEditAvailable: true,
    chartPointBatchEditAvailable: true,
    chartPointBatchLimits: { maxEdits: 3, maxBytes: 100, maxValueBytes: 16 },
    chartTargets: [{ section: 0, wrapper: 7 }],
  };
  function replace(delta = {}) {
    const token = {
      editorId: 'e',
      documentId: 'd',
      generation: 1,
      operationRevision: 0,
      viewRevision: 0,
      ...delta.token,
    };
    state = Object.freeze({
      ...token,
      token,
      status: 'ready',
      nativeHistoryRevision: 4,
      content,
      ...delta,
    });
    for (const listener of listeners) listener(state);
    return state;
  }
  replace();
  const reply = {
    kind: 'chart-points',
    section: 0,
    wrapper: 7,
    historyRevision: 4,
    chart: {
      pair: {
        chart_path: 'Chart/c.xml',
        ole_path: 'BinData/c.ole',
        section_ordinal: 0,
        wrapper_node: 7,
        declared_external: false,
        section_sha256: Array(32).fill(1),
      },
      values: {
        points: [
          { kind: 'numeric_cache', value: '1' },
          { kind: 'string_cache', value: '범주' },
          { kind: 'unknown', value: '?' },
        ],
      },
    },
  };
  const editor = {
    getEditorState: () => state,
    registerStateListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async readResource(...args) {
      calls.push(['read', ...args]);
      return read ? read(...args) : structuredClone(reply);
    },
    async requestExperimental(...args) {
      calls.push(['write', ...args]);
      return write ? write(...args) : { status: 'committed-with-snapshot' };
    },
  };
  return {
    port: createChartDataPort(editor),
    editor,
    replace,
    content,
    reply,
    calls,
    onRead(fn) {
      read = fn;
    },
    onWrite(fn) {
      write = fn;
    },
  };
}

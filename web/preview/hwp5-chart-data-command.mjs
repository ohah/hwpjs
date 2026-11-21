import { inlineInsertRecord } from '../../js/hwpx-inline-object-record.mjs';
import { checkedHwp5LiteralEdits } from '../../js/hwp5-chart-literal-edit.mjs';
const record = (input, required, optional) => {
  const value = inlineInsertRecord(input, Object.keys(input));
  if (
    required.some((k) => !Object.hasOwn(value, k)) ||
    Object.keys(value).some((k) => ![...required, ...optional].includes(k))
  )
    throw Error('InvalidChartDataCommand');
  return value;
};
/** Owned per runtime. A key never contains or substitutes for a Native witness. */
export function createHwp5ChartDataCommands(getEditor, writable) {
  const leases = new Map();
  let sequence = 0,
    lastEditor,
    retainedBytes = 0;
  const drop = (key) => {
    retainedBytes -= leases.get(key).bytes;
    leases.delete(key);
  };
  const requireEditor = () => {
    const editor = getEditor();
    if (editor !== lastEditor) {
      leases.clear();
      retainedBytes = 0;
      lastEditor = editor;
    }
    if (!writable() || editor?.supportsHwp5ChartLiteralEditAbi?.() !== true)
      throw Error('Hwp5ChartLiteralEditUnavailable');
    return editor;
  };
  return {
    reset() {
      leases.clear();
      retainedBytes = 0;
      lastEditor = undefined;
    },
    capture(message) {
      const m = record(message, ['kind', 'section', 'controlNode'], ['origin', 'requestId']);
      const editor = requireEditor();
      const capture = editor.captureHwp5ChartData(m.section, m.controlNode);
      const bytes = new TextEncoder().encode(JSON.stringify(capture.literals)).length;
      if (bytes > 16 * 1024 * 1024) throw Error('ChartLiteralLeaseLimit');
      while (leases.size && (leases.size >= 128 || retainedBytes + bytes > 16 * 1024 * 1024))
        drop(leases.keys().next().value);
      const leaseKey = String(++sequence);
      leases.set(leaseKey, { editor, capture, bytes });
      retainedBytes += bytes;
      return {
        kind: m.kind,
        requestId: m.requestId,
        section: m.section,
        controlNode: m.controlNode,
        leaseKey,
        literals: capture.literals,
        profile: capture.profile,
        historyRevision: capture.historyRevision,
      };
    },
    async apply(message) {
      const m = record(message, ['kind', 'leaseKey', 'edits'], ['origin', 'requestId']);
      const editor = requireEditor(),
        own = leases.get(m.leaseKey);
      if (!own || own.editor !== editor || !editor.isHwp5ChartDataCurrent(own.capture))
        throw Error('StaleChartLiteralCapture');
      const edits = checkedHwp5LiteralEdits(m.edits);
      drop(m.leaseKey);
      return editor.editHwp5ChartData(own.capture, edits);
    },
  };
}

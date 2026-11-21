import { HWP5_CHART_LITERAL_EDIT_ABI } from './abi-schema.mjs';
import { inlineInsertRecord } from './hwpx-inline-object-record.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
import { renderHwp5ChartLiteralEditPreview } from '../web/preview/hwp5-chart-create-preview.mjs';
const encoder = new TextEncoder();
const maxWire = 16 * 1024 * 1024;
const jsonBytes = (value) => {
  const bytes = encoder.encode(JSON.stringify(value));
  if (!bytes.length || bytes.length > maxWire) throw Error('ChartLiteralEditWireLimit');
  return bytes;
};
const parse = (bytes) => {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > maxWire)
    throw Error('InvalidChartLiteralReply');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
};
const freeze = (v) => {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
};
export function checkedHwp5LiteralEdits(input) {
  if (!Array.isArray(input) || input.length > 20480) throw Error('InvalidChartLiteralEdits');
  const keys = new Set();
  let budget = 4 * 1024 * 1024;
  return Array.from(input, (edit) => {
    const e = inlineInsertRecord(edit, Object.keys(edit));
    if (Object.keys(e).some((k) => !['category', 'value'].includes(k)))
      throw Error('InvalidChartLiteralEdits');
    const kind = Object.hasOwn(e, 'category') ? 'category' : 'value';
    if (Object.keys(e).length !== 1) throw Error('InvalidChartLiteralEdits');
    const raw = inlineInsertRecord(
      e[kind],
      kind === 'category'
        ? ['category', 'expected', 'value']
        : ['series', 'category', 'expected', 'value'],
    );
    for (const key of kind === 'category' ? ['category'] : ['series', 'category'])
      if (!Number.isSafeInteger(raw[key]) || raw[key] < 0 || Object.is(raw[key], -0))
        throw Error('InvalidChartLiteralEdits');
    for (const key of ['expected', 'value']) {
      if (typeof raw[key] !== 'string' || /[\uD800-\uDFFF]/u.test(raw[key]))
        throw Error('InvalidChartLiteralEdits');
      const bytes = encoder.encode(raw[key]).length;
      if (bytes > (kind === 'category' ? 4096 : 128) || bytes > budget)
        throw Error('ChartLiteralEditValueLimit');
      budget -= bytes;
    }
    const id = JSON.stringify([kind, raw.series, raw.category]);
    if (keys.has(id)) throw Error('DuplicateChartLiteralEdit');
    keys.add(id);
    return { [kind]: raw };
  });
}
/** Private captures only. No caller PNG, rendered metadata, painter callback or trusted flag. */
export function createHwp5ChartLiteralEditApi({ wasm, memory, check, output, u32 }) {
  const captures = new WeakMap();
  const supported = () => {
    check();
    return (
      Object.entries(HWP5_CHART_LITERAL_EDIT_ABI).every(
        ([name, sig]) =>
          typeof wasm[name] === 'function' && wasm[name].length === sig.params.length,
      ) && wasm.hwp5_edit_chart_literal_edit_profile_version() === 1
    );
  };
  const query = (section, controlNode) => {
    if (!supported()) throw Error('Hwp5ChartLiteralEditUnavailable');
    const lease = parse(
      output(() =>
        wasm.hwp5_edit_chart_literal_edit_lease(
          u32(section, 'section'),
          u32(controlNode, 'controlNode'),
        ),
      ).bytes,
    );
    if (
      lease.schemaVersion !== 1 ||
      lease.scope !== 'hwp5-chart-literal-edit-lease' ||
      lease.executionAuthority !== false ||
      lease.witness?.profile !== 'spec24_clustered_column_literals_v1' ||
      !lease.literals ||
      !lease.limits
    )
      throw Error('InvalidChartLiteralLease');
    return lease;
  };
  const current = (capture) => {
    const own = captures.get(capture);
    if (!own) return false;
    try {
      return JSON.stringify(query(capture.section, capture.controlNode).witness) === own.stamp;
    } catch {
      return false;
    }
  };
  return {
    supportsHwp5ChartLiteralEditAbi: supported,
    captureHwp5ChartData(section, controlNode) {
      const lease = query(section, controlNode);
      const capture = freeze({
        section,
        controlNode,
        literals: structuredClone(lease.literals),
        historyRevision: lease.witness.historyRevision,
      });
      captures.set(capture, {
        witness: structuredClone(lease.witness),
        stamp: JSON.stringify(lease.witness),
      });
      return capture;
    },
    isHwp5ChartDataCurrent: current,
    async editHwp5ChartData(capture, edits) {
      if (arguments.length !== 2) throw Error('InvalidChartLiteralEditArguments');
      const own = captures.get(capture);
      if (!own || !current(capture)) throw Error('StaleChartLiteralCapture');
      const changes = checkedHwp5LiteralEdits(edits);
      if (!changes.length) return { application: 'unapplied', nativeCode: 2, changed: false };
      const request = { schemaVersion: 1, witness: own.witness, edits: changes };
      const wire = memory.withBytes(jsonBytes(request), (ptr, len) =>
        output(() => wasm.hwp5_edit_chart_literal_edit_preview(ptr, len)).bytes.slice(),
      );
      if (!current(capture)) throw Error('StaleChartLiteralCapture');
      const preview = parse(wire);
      if (
        preview.schemaVersion !== 1 ||
        preview.scope !== 'hwp5-chart-literal-edit-preview' ||
        preview.executionAuthority !== false ||
        typeof preview.changed !== 'boolean'
      )
        throw Error('InvalidChartLiteralPreview');
      let painted = null;
      if (preview.changed) {
        if (typeof globalThis.OffscreenCanvas !== 'function')
          throw Error('ChartLiteralRendererUnavailable');
        painted = await renderHwp5ChartLiteralEditPreview(wire, {
          current: () => current(capture),
          createCanvas: (width, height) => new globalThis.OffscreenCanvas(width, height),
        });
      }
      if (!current(capture)) throw Error('StaleChartLiteralCapture');
      const rendered = painted
        ? {
            source_xml_sha256: painted.source_xml_sha256,
            pixel_width: painted.pixel_width,
            pixel_height: painted.pixel_height,
          }
        : null;
      const body = jsonBytes({ ...request, rendered });
      // Consume before the one final call. Ambiguous completion cannot be retried.
      captures.delete(capture);
      let outcome;
      const commit = (imagePtr, imageSize) =>
        (outcome = applyNativeEdit(
          memory,
          body,
          (ptr, len) => wasm.hwp5_edit_chart_literal_edit_commit(ptr, len, imagePtr, imageSize),
          'InvalidChartLiteralEditResult',
        ));
      try {
        return painted ? memory.withBytes(painted.bytes, commit) : commit(0, 0);
      } catch (error) {
        if (!outcome) throw error;
        return { ...outcome, cleanupError: error?.message || String(error), refreshRequired: true };
      }
    },
  };
}

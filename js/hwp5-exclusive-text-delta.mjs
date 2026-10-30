import { decodeCharacterRanges } from './character-shapes-wire.mjs';
const uint = (x) => Number.isSafeInteger(x) && x >= 0 && x < 0xffffffff;
const epoch = (x) =>
  typeof x === 'string' && /^[1-9][0-9]{0,19}$/.test(x) && BigInt(x) <= 0xffffffffffffffffn;
const bad = () => {
  throw Error('InvalidExclusiveTextDelta');
};
export function decodeHwp5TextWindow(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 48) bad();
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = (i) => v.getUint32(4 + i * 4, true);
  const e = ((BigInt(n(2)) << 32n) | BigInt(n(1))).toString();
  if (
    String.fromCharCode(...bytes.slice(0, 4)) !== 'H5W1' ||
    n(0) !== 1 ||
    !epoch(e) ||
    !uint(n(3)) ||
    !uint(n(4)) ||
    n(7) > n(8) ||
    n(8) > n(6) ||
    n(8) - n(7) > 4096 ||
    n(9) !== 1 ||
    n(10) !== (n(8) - n(7)) * 2 ||
    bytes.length !== 48 + n(10)
  )
    bad();
  const text = new TextDecoder('utf-16le', { fatal: true, ignoreBOM: true }).decode(
    bytes.slice(48),
  );
  return {
    epoch: e,
    section: n(3),
    sourceNode: n(4),
    parentNode: n(5) === 0xffffffff ? null : n(5),
    totalUnits: n(6),
    startUnit: n(7),
    endUnit: n(8),
    text,
  };
}
export function decodeHwp5TextDelta(bytes) {
  const r = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (
    !r ||
    Object.keys(r).sort().join() !==
      [
        'version',
        'exclusive',
        'beforeEpoch',
        'epoch',
        'beforeRevision',
        'revision',
        'section',
        'paragraph',
        'sourceNode',
        'parentNode',
        'startUnit',
        'removed',
        'inserted',
        'totalUnits',
        'runs',
      ]
        .sort()
        .join() ||
    r.version !== 1 ||
    r.exclusive !== true ||
    !epoch(r.beforeEpoch) ||
    !epoch(r.epoch) ||
    BigInt(r.epoch) <= BigInt(r.beforeEpoch)
  )
    bad();
  for (const k of [
    'beforeRevision',
    'revision',
    'section',
    'paragraph',
    'sourceNode',
    'startUnit',
    'totalUnits',
  ])
    if (!uint(r[k])) bad();
  if (r.parentNode !== null && !uint(r.parentNode)) bad();
  for (const k of ['removed', 'inserted'])
    if (
      !Array.isArray(r[k]) ||
      r[k].length > 4096 ||
      r[k].some((x) => !Number.isInteger(x) || x < 0 || x > 65535)
    )
      bad();
  if (!Array.isArray(r.runs) || !r.runs.length || r.runs.length > 4096) bad();
  let prev = -1;
  for (const run of r.runs) {
    if (
      Object.keys(run).sort().join() !== 'char_shape_id,start_unit' ||
      !uint(run.start_unit) ||
      !uint(run.char_shape_id) ||
      run.start_unit <= prev ||
      run.start_unit > r.totalUnits
    )
      bad();
    prev = run.start_unit;
  }
  if (r.runs[0].start_unit !== 0 || r.totalUnits < 1 || r.totalUnits > 4096) bad();
  return r;
}
export function createHwp5ExclusiveTextApi({
  wasm,
  output,
  check,
  encode,
  currentSourceReferences,
}) {
  const window = (reference, start, end) =>
    output(
      (ptr, size) => wasm.hwp5_edit_copy_current_text_window(ptr, size, start, end),
      encode(reference),
    );
  return {
    captureExclusiveTextOwner(section, paragraph) {
      check();
      if (
        typeof wasm.hwp5_edit_last_text_delta_receipt !== 'function' ||
        typeof wasm.hwp5_edit_copy_current_text_window !== 'function'
      )
        return null;
      const references = currentSourceReferences(section, { first: paragraph, count: 1 });
      const reference = references.references[0];
      if (reference?.kind !== 'original') return null;
      const w = decodeHwp5TextWindow(window(reference, 0, 0));
      return { section, paragraph, reference, window: w };
    },
    readCurrentOwnerWindow(section, paragraph) {
      check();
      if (
        typeof wasm.hwp5_edit_copy_current_text_window !== 'function' ||
        typeof wasm.hwp5_edit_character_ranges !== 'function'
      )
        return null;
      const captured = this.captureExclusiveTextOwner(section, paragraph);
      if (!captured || captured.window.totalUnits < 2 || captured.window.totalUnits > 4096)
        return null;
      const reference = captured.reference;
      const w = decodeHwp5TextWindow(window(reference, 0, captured.window.totalUnits));
      if (
        w.epoch !== captured.window.epoch ||
        w.sourceNode !== captured.window.sourceNode ||
        w.parentNode !== captured.window.parentNode ||
        w.section !== section ||
        w.totalUnits !== captured.window.totalUnits ||
        w.startUnit !== 0 ||
        w.endUnit !== w.totalUnits ||
        w.text.length !== w.totalUnits ||
        w.text.at(-1) !== '\r' ||
        !w.text.isWellFormed() ||
        Array.from(w.text.slice(0, -1)).some((c) => c.charCodeAt(0) < 32 || c === '\ufffc')
      )
        bad();
      const raw = decodeCharacterRanges(
        output(() => wasm.hwp5_edit_character_ranges(section, paragraph)),
      );
      if (!raw.length || raw.length > 4096) bad();
      const characterRanges = [];
      const length = w.text.length - 1;
      let cursor = 0;
      for (const range of raw) {
        if (
          range.start !== cursor ||
          range.end < range.start ||
          range.end > w.totalUnits ||
          !uint(range.charShapeId)
        )
          bad();
        cursor = range.end;
        const start = Math.min(length, range.start),
          end = Math.min(length, range.end),
          charShapeId = range.charShapeId;
        if (start === end) {
          if (start === length) characterRanges.push({ start, end, charShapeId });
          continue;
        }
        const last = characterRanges.at(-1);
        if (last?.charShapeId === charShapeId) last.end = end;
        else characterRanges.push({ start, end, charShapeId });
      }
      if (cursor !== w.totalUnits) bad();
      const final = currentSourceReferences(section, { first: paragraph, count: 1 }).references[0];
      if (
        !final ||
        Object.keys(reference).some((k) => final[k] !== reference[k]) ||
        Object.keys(final).length !== Object.keys(reference).length
      )
        bad();
      return { reference, window: w, characterRanges };
    },
    readExclusiveTextDelta(before) {
      check();
      if (!before) return null;
      const r = decodeHwp5TextDelta(output(() => wasm.hwp5_edit_last_text_delta_receipt()));
      const q = currentSourceReferences(r.section, { first: r.paragraph, count: 1 });
      const reference = q.references[0];
      if (
        r.section !== before.section ||
        r.paragraph !== before.paragraph ||
        r.beforeEpoch !== before.window.epoch ||
        r.sourceNode !== before.window.sourceNode ||
        r.parentNode !== before.window.parentNode ||
        reference?.kind !== 'original' ||
        reference.epoch !== r.epoch ||
        reference.id !== String(r.sourceNode) ||
        r.startUnit + r.removed.length > before.window.totalUnits - 1 ||
        r.totalUnits !== before.window.totalUnits - r.removed.length + r.inserted.length
      )
        bad();
      const after = decodeHwp5TextWindow(window(reference, 0, r.totalUnits));
      if (
        after.epoch !== r.epoch ||
        after.sourceNode !== r.sourceNode ||
        after.parentNode !== r.parentNode ||
        after.section !== r.section ||
        after.totalUnits !== r.totalUnits ||
        after.text.at(-1) !== '\r' ||
        Array.from(after.text.slice(0, -1)).some((c) => c.charCodeAt(0) < 32)
      )
        bad();
      return { receipt: r, before: before.window, window: after, reference };
    },
  };
}

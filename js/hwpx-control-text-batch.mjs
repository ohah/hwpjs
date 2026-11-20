import { validDocumentTextReadStamp } from './document-text-read-stamp.mjs';
// Strict Native read wire decoder. No XML parsing or edit-mode fallback.
const invalid = () => {
  throw Error('InvalidHwpxControlTextSnapshot');
};
const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff && !Object.is(v, -0);
const spellings = new Map([
  ['tab', '\t'],
  ['anchor', '\ufffc'],
  ['nb_space', '\u00a0'],
  ['fw_space', '\u2007'],
  ['line_break', '\n'],
  ['hypen', '\u00ad'],
]);
const issues = new Set([
  'UnknownControl',
  'UnresolvedField',
  'MissingCurrentSite',
  'InconsistentControlOwner',
]);
function own(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid();
  const ds = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(ds).length !== keys.length || keys.some((k) => !Object.hasOwn(ds, k)))
    invalid();
  const out = Object.create(null);
  for (const k of keys) {
    if (!Object.hasOwn(ds[k], 'value')) invalid();
    out[k] = ds[k].value;
  }
  return out;
}
// Snapshot array elements without invoking getters, custom iterators or map.
function items(value, max) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const ds = Object.getOwnPropertyDescriptors(value),
    length = ds.length?.value;
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > max ||
    Reflect.ownKeys(ds).length !== length + 1
  )
    invalid();
  const out = [];
  for (let i = 0; i < length; i++) {
    const d = ds[i];
    if (!d || !Object.hasOwn(d, 'value')) invalid();
    out.push(d.value);
  }
  return out;
}
function boundary(text, at) {
  return (
    at === 0 ||
    at === text.length ||
    !(
      text.charCodeAt(at - 1) >= 0xd800 &&
      text.charCodeAt(at - 1) <= 0xdbff &&
      text.charCodeAt(at) >= 0xdc00 &&
      text.charCodeAt(at) <= 0xdfff
    )
  );
}
export function decodeControlTextSnapshot(value, expectedSection, expectedIdentity) {
  if (!uint(expectedSection)) invalid();
  const root = own(value, ['schemaVersion', 'axis', 'section', 'readStamp', 'coverage', 'rows']);
  const stamp = own(root.readStamp, ['session', 'serial']);
  if (
    ![1, 2].includes(root.schemaVersion) ||
    root.axis !== 'native-control-utf16' ||
    root.section !== expectedSection ||
    !['complete', 'partial'].includes(root.coverage) ||
    !Array.isArray(root.rows) ||
    root.rows.length > 100000
  )
    invalid();
  if (
    typeof stamp.session !== 'string' ||
    !stamp.session ||
    stamp.session.length > 256 ||
    typeof stamp.serial !== 'string' ||
    !/^(0|[1-9][0-9]{0,19})$/.test(stamp.serial) ||
    BigInt(stamp.serial) > 0xffffffffffffffffn
  )
    invalid();
  let previous = 0,
    complete = true,
    units = 0;
  const rows = items(root.rows, 100000).map((value) => {
    const row = own(value, [
      'paragraph',
      'sourceNode',
      'plain',
      'text',
      'units',
      'controls',
      'coverage',
      'issue',
    ]);
    if (
      !uint(row.paragraph) ||
      row.paragraph === 0 ||
      (!previous ? false : row.paragraph !== previous + 1) ||
      !uint(row.sourceNode) ||
      !uint(row.units) ||
      typeof row.plain !== 'string' ||
      !row.plain.isWellFormed() ||
      !Array.isArray(row.controls) ||
      row.controls.length > 2000000
    )
      invalid();
    previous = row.paragraph;
    units += row.plain.length;
    if (row.coverage === 'complete') {
      if (
        typeof row.text !== 'string' ||
        !row.text.isWellFormed() ||
        row.text.length !== row.units ||
        row.issue !== null
      )
        invalid();
      units += row.text.length;
    } else if (row.coverage === 'partial') {
      complete = false;
      if (row.text !== null || row.controls.length !== 0 || !issues.has(row.issue)) invalid();
    } else invalid();
    let last = -1;
    const seen = new Set();
    let plainAt = 0;
    const literalParts = [];
    const controls = items(row.controls, 2000000).map((value) => {
      const c = own(value, ['kind', 'node', 'startUnit', 'endUnit']);
      if (
        !spellings.has(c.kind) ||
        !uint(c.node) ||
        !uint(c.startUnit) ||
        !uint(c.endUnit) ||
        c.startUnit < last ||
        c.endUnit !== c.startUnit + 1 ||
        c.endUnit > row.text.length ||
        !boundary(row.text, c.startUnit) ||
        !boundary(row.text, c.endUnit) ||
        row.text.slice(c.startUnit, c.endUnit) !== spellings.get(c.kind) ||
        seen.has(c.node)
      )
        invalid();
      literalParts.push(row.text.slice(plainAt, c.startUnit));
      plainAt = c.endUnit;
      last = c.endUnit;
      seen.add(c.node);
      return Object.freeze({ ...c });
    });
    if (row.coverage === 'complete') {
      literalParts.push(row.text.slice(plainAt));
      if (literalParts.join('') !== row.plain) invalid();
    }
    if (units > 128 * 1024 * 1024) invalid();
    return Object.freeze({ ...row, controls: Object.freeze(controls) });
  });
  if ((root.coverage === 'complete') !== complete) invalid();
  if (expectedIdentity) {
    const expected = decodeControlTextIdentity(expectedIdentity, expectedSection);
    if (
      root.schemaVersion !== 2 ||
      stamp.session !== expected.readBinding.session ||
      stamp.serial !== expected.readBinding.serial ||
      rows.length !== expected.paragraphCount ||
      (rows.length && rows[0].paragraph !== expected.firstParagraph)
    )
      invalid();
  }

  return Object.freeze({
    ...root,
    readStamp: Object.freeze({ ...stamp }),
    rows: Object.freeze(rows),
  });
}
export function decodeControlTextIdentity(value, section) {
  const root = own(value, [
    'schemaVersion',
    'scope',
    'executionAuthority',
    'section',
    'firstParagraph',
    'paragraphCount',
    'readBinding',
  ]);
  const b = own(root.readBinding, ['session', 'epoch', 'serial']);
  if (
    root.schemaVersion !== 1 ||
    root.scope !== 'native-control-text-identity' ||
    root.executionAuthority !== false ||
    root.section !== section ||
    !uint(section) ||
    !uint(root.firstParagraph) ||
    root.firstParagraph === 0 ||
    !uint(root.paragraphCount) ||
    root.paragraphCount > 100000 ||
    root.firstParagraph + root.paragraphCount > 0x100000000 ||
    !validDocumentTextReadStamp({ epoch: b.epoch, serial: b.serial }) ||
    b.session !== `s${b.epoch}`
  )
    invalid();
  return Object.freeze({ ...root, readBinding: Object.freeze({ ...b }) });
}
const sameIdentity = (a, b) =>
  a.section === b.section &&
  a.firstParagraph === b.firstParagraph &&
  a.paragraphCount === b.paragraphCount &&
  a.readBinding.session === b.readBinding.session &&
  a.readBinding.epoch === b.readBinding.epoch &&
  a.readBinding.serial === b.readBinding.serial;
export function createHwpxControlTextBatchApi({ wasm, memory, check }) {
  const supported = () =>
    [
      'hwpx_edit_paragraph_control_text_snapshot_current',
      'hwpx_edit_control_text_read_identity',
      'hwpx_edit_output_ptr',
      'hwpx_edit_output_len',
      'hwpx_edit_output_free',
    ].every((name) => typeof wasm[name] === 'function');
  const query = (name, section, limit) => {
    try {
      if (wasm[name](section) !== 1) throw memory.error();
      const size = wasm.hwpx_edit_output_len();
      if (!uint(size) || size > limit) invalid();
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          memory.copy(wasm.hwpx_edit_output_ptr(), size),
        ),
      );
    } finally {
      wasm.hwpx_edit_output_free();
    }
  };
  return {
    supportsParagraphControlTextSnapshotAbi() {
      check();
      return supported();
    },
    paragraphControlTextSnapshot(section) {
      check();
      if (!uint(section)) invalid();
      if (!supported()) throw Error('HwpxControlTextFreshnessAbiUnavailable');
      const before = decodeControlTextIdentity(
        query('hwpx_edit_control_text_read_identity', section, 2048),
        section,
      );
      check();
      const value = decodeControlTextSnapshot(
        query('hwpx_edit_paragraph_control_text_snapshot_current', section, 128 * 1024 * 1024),
        section,
        before,
      );
      check();
      const after = decodeControlTextIdentity(
        query('hwpx_edit_control_text_read_identity', section, 2048),
        section,
      );
      check();
      if (!sameIdentity(before, after)) throw Error('StaleHwpxControlTextSnapshot');
      return value;
    },
  };
}

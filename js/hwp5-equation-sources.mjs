const utf8 = new TextDecoder('utf-8', { fatal: true });
// 기존 HWP5 text wire와 같은 표준 디코더 정책이다. 잘못된 원문을 복구하지 않는다.
const utf16 = new TextDecoder('utf-16le', { fatal: true, ignoreBOM: true });
const MAX_DETAIL = 2 * 1024 * 1024;
const uint = (value, max = 0xffffffff) =>
  Number.isInteger(value) && !Object.is(value, -0) && value >= 0 && value <= max;
const invalid = () => {
  throw Error('InvalidHwp5EquationSources');
};
function keys(value, required) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== required.length ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    invalid();
}
function parse(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 16 * 1024 * 1024) invalid();
  return JSON.parse(utf8.decode(bytes));
}
function site(value) {
  const fields = [
    'control_node',
    'equation_node',
    'paragraph_node',
    'paragraph',
    'source_unit',
    'current_unit',
  ];
  keys(value, fields);
  if (
    fields.some((key) => !uint(value[key])) ||
    value.control_node <= value.paragraph_node ||
    value.equation_node <= value.control_node
  )
    invalid();
  return Object.freeze({
    controlNode: value.control_node,
    equationNode: value.equation_node,
    paragraphNode: value.paragraph_node,
    paragraph: value.paragraph,
    sourceUnit: value.source_unit,
    currentUnit: value.current_unit,
  });
}
export function decodeHwp5EquationSites(bytes) {
  const value = parse(bytes);
  keys(value, ['schemaVersion', 'sites']);
  if (value.schemaVersion !== 1 || !Array.isArray(value.sites) || value.sites.length > 10000)
    invalid();
  const controls = new Set(),
    equations = new Set();
  return Object.freeze(
    value.sites.map((row) => {
      const result = site(row);
      if (controls.has(result.controlNode) || equations.has(result.equationNode)) invalid();
      controls.add(result.controlNode);
      equations.add(result.equationNode);
      return result;
    }),
  );
}
function rawArray(value, max, budget, byteWidth) {
  const maxLength = byteWidth === 2 ? 0xffff : MAX_DETAIL;
  if (!Array.isArray(value) || value.length > maxLength) invalid();
  budget.bytes += value.length * byteWidth;
  if (budget.bytes > MAX_DETAIL) invalid();
  if (value.some((item) => !uint(item, max))) invalid();
  return Object.freeze(value);
}
function text(words) {
  const bytes = new Uint8Array(words.length * 2),
    view = new DataView(bytes.buffer);
  for (let index = 0; index < words.length; index++) view.setUint16(index * 2, words[index], true);
  try {
    return { value: utf16.decode(bytes), state: 'exact' };
  } catch {
    return { value: null, state: 'invalid-utf16' };
  }
}
function decodeSource(value) {
  keys(value, [
    'schemaVersion',
    'layout',
    'site',
    'attributes',
    'fontSize',
    'color',
    'baseline',
    'unknown',
    'scriptUtf16LE',
    'versionUtf16LE',
    'fontUtf16LE',
    'extraBytes',
  ]);
  if (
    value.schemaVersion !== 1 ||
    !['version-only', 'with-font'].includes(value.layout) ||
    !uint(value.attributes) ||
    !uint(value.fontSize) ||
    !uint(value.color) ||
    !uint(value.unknown, 0xffff) ||
    !Number.isInteger(value.baseline) ||
    Object.is(value.baseline, -0) ||
    value.baseline < -32768 ||
    value.baseline > 32767 ||
    (value.layout === 'version-only' ? value.fontUtf16LE !== null : value.fontUtf16LE === null)
  )
    invalid();
  const metadata = site(value.site),
    budget = { bytes: 0 };
  const scriptRaw = rawArray(value.scriptUtf16LE, 0xffff, budget, 2),
    versionRaw = rawArray(value.versionUtf16LE, 0xffff, budget, 2),
    fontRaw = value.fontUtf16LE === null ? null : rawArray(value.fontUtf16LE, 0xffff, budget, 2),
    extraRaw = rawArray(value.extraBytes, 255, budget, 1);
  const script = text(scriptRaw),
    version = text(versionRaw),
    font = fontRaw === null ? { value: null, state: 'not-observed' } : text(fontRaw);
  return Object.freeze({
    schemaVersion: 1,
    layout: value.layout,
    site: metadata,
    attributes: value.attributes,
    fontSize: value.fontSize,
    color: value.color,
    baseline: value.baseline,
    unknown: value.unknown,
    scriptUtf16LE: scriptRaw,
    versionUtf16LE: versionRaw,
    fontUtf16LE: fontRaw,
    extraBytes: extraRaw,
    script: script.value,
    version: version.value,
    font: font.value,
    decoding: Object.freeze({ script: script.state, version: version.state, font: font.state }),
  });
}

export function decodeHwp5EquationSource(bytes) {
  return decodeSource(parse(bytes));
}
/** A section snapshot owns every raw string and anchor in its JS result. */
export function decodeHwp5EquationSnapshot(bytes) {
  const value = parse(bytes);
  keys(value, ['schemaVersion', 'sources']);
  if (value.schemaVersion !== 1 || !Array.isArray(value.sources) || value.sources.length > 10000)
    invalid();
  const controls = new Set(),
    equations = new Set();
  return Object.freeze(
    value.sources.map((source) => {
      const row = decodeSource(source);
      if (controls.has(row.site.controlNode) || equations.has(row.site.equationNode)) invalid();
      controls.add(row.site.controlNode);
      equations.add(row.site.equationNode);
      return row;
    }),
  );
}

export function createHwp5EquationApi({ wasm, check, output, u32 }) {
  function readSnapshot(section, layout = 'version-only') {
    check();
    const index = u32(section, 'section');
    if (!['version-only', 'with-font'].includes(layout)) throw Error('InvalidEquationLayout');
    if (typeof wasm.hwp5_edit_equation_snapshot !== 'function')
      throw Error('Hwp5EquationSourcesAbiUnavailable');
    const rows = decodeHwp5EquationSnapshot(
      output(() => wasm.hwp5_edit_equation_snapshot(index, layout === 'with-font' ? 1 : 0)).bytes,
    );
    if (rows.some((row) => row.layout !== layout)) throw Error('EquationSourceBindingMismatch');
    return rows;
  }
  return {
    supportsEquationSources() {
      check();
      return (
        typeof wasm.hwp5_edit_equation_snapshot === 'function' &&
        typeof wasm.hwp5_edit_equation_sites === 'function'
      );
    },
    equationSnapshot: readSnapshot,
    equationSites(section) {
      check();
      const index = u32(section, 'section');
      if (typeof wasm.hwp5_edit_equation_sites !== 'function')
        throw Error('Hwp5EquationSourcesAbiUnavailable');
      return decodeHwp5EquationSites(output(() => wasm.hwp5_edit_equation_sites(index)).bytes);
    },
    equationSource(section, equationNode, layout = 'version-only') {
      check();
      const index = u32(section, 'section'),
        node = u32(equationNode, 'equationNode');
      if (!['version-only', 'with-font'].includes(layout)) throw Error('InvalidEquationLayout');
      if (typeof wasm.hwp5_edit_equation_source !== 'function') {
        const found = readSnapshot(index, layout).find((row) => row.site.equationNode === node);
        if (!found) throw Error('InvalidEquationNode');
        return found;
      }
      const result = decodeHwp5EquationSource(
        output(() => wasm.hwp5_edit_equation_source(index, node, layout === 'with-font' ? 1 : 0))
          .bytes,
      );
      if (result.site.equationNode !== node || result.layout !== layout)
        throw Error('EquationSourceBindingMismatch');
      return result;
    },
  };
}

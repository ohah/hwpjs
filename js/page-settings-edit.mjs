import { validateHwp5PageSettings } from './hwp5-page-settings.mjs';
import { decodePageSettings } from './hwpx-page-settings.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
let scopes = 0n;
const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff && !Object.is(n, -0);
const decimal = (s) =>
  typeof s === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(s) && BigInt(s) <= 0xffffffffffffffffn;
export function ownPageRecord(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error('InvalidPageSettingsRequest');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length)
    throw Error('InvalidPageSettingsRequest');
  const out = {};
  for (const key of keys) {
    if (!Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value'))
      throw Error('InvalidPageSettingsRequest');
    out[key] = descriptors[key].value;
  }
  return out;
}
export function checkedPageSettingsValues(input) {
  const v = ownPageRecord(input, ['orientation', 'width', 'height', 'gutter_type', 'margin']);
  const m = ownPageRecord(v.margin, [
    'header',
    'footer',
    'gutter',
    'left',
    'right',
    'top',
    'bottom',
  ]);
  if (
    !['widely', 'narrowly'].includes(v.orientation) ||
    !['left_only', 'left_right', 'top_bottom'].includes(v.gutter_type) ||
    ![v.width, v.height, ...Object.values(m)].every(uint)
  )
    throw Error('InvalidPageSettingsGeometry');
  const [w, h] = v.orientation === 'narrowly' ? [v.height, v.width] : [v.width, v.height];
  if (
    w <= m.left + m.right + (v.gutter_type === 'top_bottom' ? 0 : m.gutter) ||
    h <= m.top + m.bottom + m.header + m.footer + (v.gutter_type === 'top_bottom' ? m.gutter : 0)
  )
    throw Error('InvalidPageSettingsGeometry');
  return Object.freeze({ ...v, margin: Object.freeze(m) });
}
export function checkedPageSettingsCapabilities(cap) {
  if (
    !cap ||
    cap.schemaVersion !== 1 ||
    !['hwpx', 'hwp5'].includes(cap.format) ||
    !Array.isArray(cap.sections) ||
    cap.sections.length > 512 ||
    !cap.binding ||
    !uint(cap.binding.revision) ||
    typeof cap.binding.session !== 'string' ||
    !decimal(cap.binding.serial)
  )
    throw Error('InvalidPageSettingsCapabilities');
  const seen = new Set();
  for (const row of cap.sections) {
    if (!row || !uint(row.section) || seen.has(row.section) || row.section >= cap.sections.length)
      throw Error('InvalidPageSettingsCapabilities');
    seen.add(row.section);
    if (row.target === null) {
      if (
        !(
          cap.format === 'hwpx'
            ? [
                'MissingPageSettings',
                'AmbiguousPageSettings',
                'DuplicatePageMargin',
                'UnsupportedPageSettingsOwner',
              ]
            : [
                'MissingPageDefinition',
                'DuplicatePageDefinition',
                'MissingSectionDefinition',
                'DuplicateSectionDefinition',
                'OrphanSectionRecord',
                'MisplacedSectionDefinition',
                'OrphanSectionDefinition',
                'UnsupportedPageBinding',
                'UnsupportedPageSettingsOwner',
              ]
        ).includes(row.reason)
      )
        throw Error('InvalidPageSettingsCapabilities');
      continue;
    }
    const t = row.target;
    if (cap.format === 'hwp5') {
      if (row.reason !== null || !t || t.section !== row.section)
        throw Error('InvalidPageSettingsCapabilities');
      validateHwp5PageSettings(t.expected);
      continue;
    }
    if (
      row.reason !== null ||
      !t ||
      t.section !== row.section ||
      ![t.owner_node, t.page_node].every(uint) ||
      (t.margin_node !== null && !uint(t.margin_node)) ||
      !t.expected ||
      t.expected.section_ordinal !== row.section ||
      t.expected.element_index !== t.page_node ||
      t.expected.duplicate_margins !== 0
    )
      throw Error('InvalidPageSettingsCapabilities');
  }
  return cap;
}
function copyPageTarget(input, format) {
  if (format === 'hwp5') {
    const t = ownPageRecord(input, ['section', 'expected']);
    const expected = ownPageRecord(t.expected, [
      'source_node',
      'width',
      'height',
      'left',
      'right',
      'top',
      'bottom',
      'header',
      'footer',
      'gutter',
      'flags',
      'orientation',
      'binding',
      'extra_bytes',
    ]);
    if (!uint(t.section)) throw Error('InvalidPageSettingsTargets');
    validateHwp5PageSettings(expected);
    return { section: t.section, expected };
  }

  const t = ownPageRecord(input, ['section', 'owner_node', 'page_node', 'margin_node', 'expected']);
  const e = ownPageRecord(t.expected, [
    'section_ordinal',
    'element_index',
    'orientation',
    'width',
    'height',
    'gutter_type',
    'margin',
    'duplicate_margins',
    'hide_first_empty_line',
    'visibility_count',
  ]);
  if (e.margin !== null)
    e.margin = ownPageRecord(e.margin, [
      'header',
      'footer',
      'gutter',
      'left',
      'right',
      'top',
      'bottom',
    ]);
  decodePageSettings(new TextEncoder().encode(JSON.stringify([e])));
  if (
    ![t.section, t.owner_node, t.page_node].every(uint) ||
    (t.margin_node !== null && !uint(t.margin_node))
  )
    throw Error('InvalidPageSettingsTargets');
  return { ...t, expected: e };
}
export function createPageSettingsEditApi({ wasm, memory, check, format = 'hwpx' }) {
  if (!['hwpx', 'hwp5'].includes(format)) throw Error('InvalidPageSettingsFormat');
  const prefix = format + '_edit_';
  const scope = 'pg-' + (globalThis.crypto?.randomUUID?.() ?? String(++scopes)) + ':';
  const supported = [prefix + 'page_settings_capabilities', prefix + 'write_page_settings'].every(
    (k) => typeof wasm[k] === 'function',
  );
  function capabilities() {
    check();
    if (!supported) throw Error('PageSettingsWriteUnavailable');
    try {
      if (wasm[prefix + 'page_settings_capabilities']() !== 1) throw memory.error();
      const len = wasm[prefix + 'output_len']();
      if (len <= 0 || len > 512 * 1024) throw Error('InvalidPageSettingsCapabilities');
      const cap = checkedPageSettingsCapabilities(
        JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            memory.copy(wasm[prefix + 'output_ptr'](), len),
          ),
        ),
      );
      if (cap.format !== format) throw Error('InvalidPageSettingsCapabilities');
      if (!/^s[1-9][0-9]{0,19}$/.test(cap.binding.session))
        throw Error('InvalidPageSettingsCapabilities');
      return { ...cap, binding: { ...cap.binding, session: scope + cap.binding.session } };
    } finally {
      wasm[prefix + 'output_free']();
    }
  }
  return {
    supportsPageSettingsWrite() {
      check();
      return supported;
    },
    pageSettingsCapabilities: capabilities,
    writePageSettings(input) {
      check();
      if (!supported) throw Error('PageSettingsWriteUnavailable');
      const r = ownPageRecord(input, ['binding', 'scope', 'targets', 'values']);
      const b = ownPageRecord(r.binding, ['session', 'revision', 'serial']);
      const values = checkedPageSettingsValues(r.values);
      const current = capabilities();
      if (
        b.session !== current.binding.session ||
        b.serial !== current.binding.serial ||
        b.revision !== current.binding.revision
      )
        return {
          nativeCode: 0,
          application: 'unapplied',
          changed: false,
          error: 'StalePageSettingsBinding',
        };
      if (
        !['section', 'document'].includes(r.scope) ||
        !Array.isArray(r.targets) ||
        r.targets.length === 0 ||
        r.targets.length > 512
      )
        throw Error('InvalidPageSettingsTargets');
      // Own JSON data before crossing the synchronous native boundary. SDK scope is checked first.
      const targets = [];
      for (let i = 0; i < r.targets.length; i++) {
        const d = Object.getOwnPropertyDescriptor(r.targets, String(i));
        if (!d || !Object.hasOwn(d, 'value')) throw Error('InvalidPageSettingsTargets');
        targets.push(copyPageTarget(d.value, format));
      }
      const request = {
        ...r,
        targets,
        values,
        binding: { ...b, session: b.session.slice(scope.length) },
      };
      const bytes = new TextEncoder().encode(JSON.stringify(request));
      if (bytes.length > 512 * 1024) throw Error('LimitExceeded');
      return applyNativeEdit(
        memory,
        bytes,
        (ptr, size) => wasm[prefix + 'write_page_settings'](ptr, size),
        'InvalidPageSettingsCompletion',
      );
    },
  };
}

/** Common presentation only. Never turns source values into write authority. */
export function pageSettingsSource(cap, row) {
  if (!row.target) return null;
  if (cap.format === 'hwpx') return row.target.expected;
  const v = row.target.expected;
  return {
    orientation: v.orientation === 'widely' ? 'narrowly' : 'widely',
    width: v.width,
    height: v.height,
    gutter_type: { one_side: 'left_only', facing: 'left_right', top: 'top_bottom' }[v.binding],
    margin: Object.fromEntries(
      ['header', 'footer', 'gutter', 'left', 'right', 'top', 'bottom'].map((k) => [k, v[k]]),
    ),
  };
}

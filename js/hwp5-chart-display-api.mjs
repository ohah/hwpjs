import { HWP5_CHART_READ_FUNCTIONS, HWP5_CHART_READ_PROFILE_VERSION } from './abi-schema.mjs';
import { validateHwp5DrawingSources } from './hwp5-drawing-sources.mjs';
import { validateChartDisplayData } from './chart-display-data.mjs';

const invalid = () => {
  throw Error('InvalidHwp5ChartReply');
};
const uint = (value, maximum = 0xffffffff) =>
  Number.isInteger(value) && value >= 0 && value <= maximum;
const digest = (value) =>
  Array.isArray(value) && value.length === 32 && value.every((byte) => uint(byte, 255));
function envelope(bytes, kind) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 16 * 1024 * 1024) invalid();
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (
    !value ||
    value.format !== 'hwp5' ||
    value.version !== HWP5_CHART_READ_PROFILE_VERSION ||
    value.kind !== kind ||
    typeof value.source_epoch !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(value.source_epoch) ||
    BigInt(value.source_epoch) > 0xffffffffffffffffn ||
    (value.history_revision !== null && !uint(value.history_revision))
  )
    invalid();
  return value;
}
function owner(value, allowUnresolved = false) {
  if (
    !value ||
    ![
      'control_node',
      'component_node',
      'ole_node',
      'paragraph_node',
      'paragraph',
      'source_unit',
      'current_unit',
      'attributes',
      'opaque_tail_bytes',
    ].every((key) => uint(value[key])) ||
    !uint(value.ordinal, 65535) ||
    (!allowUnresolved && value.ordinal === 0) ||
    !['spec24', 'observed26'].includes(value.ole_layout) ||
    ![value.extent_x, value.extent_y].every(
      (number) => Number.isInteger(number) && number >= -2147483648 && number <= 2147483647,
    ) ||
    !(
      value.paragraph_node < value.control_node &&
      value.control_node < value.component_node &&
      value.component_node < value.ole_node
    )
  )
    invalid();
  if (!digest(value.section_source_sha256)) invalid();
  validateHwp5DrawingSources([value.geometry]);
  if (
    value.geometry.kind_id !== 0x246f6c65 ||
    ['control_node', 'component_node', 'paragraph_node'].some(
      (key) => value[key] !== value.geometry[key],
    )
  )
    invalid();
  return value;
}
export function decodeHwp5ChartCandidates(bytes) {
  const value = envelope(bytes, 'hwp5_chart_candidates');
  if (!Array.isArray(value.candidates) || value.candidates.length > 4096) invalid();
  const seen = new Map();
  for (const row of value.candidates) {
    if (!row || !uint(row.section)) invalid();
    owner(row.owner, true);
    const key = row.section + ':' + row.owner.control_node;
    if (seen.has(key)) invalid();
    seen.set(key, row);
    const r = row.resource;
    if (!r || !['modern_chart', 'unresolved_ole', 'unavailable'].includes(r.state)) invalid();
    if (r.state === 'modern_chart') {
      if (
        row.owner.ordinal === 0 ||
        !uint(r.physical_id, 65535) ||
        !digest(r.resource_sha256) ||
        !uint(r.stream_entry) ||
        typeof r.legacy_backup_present !== 'boolean' ||
        !uint(r.presentation_streams) ||
        r.error_name !== null
      )
        invalid();
    } else if (
      typeof r.error_name !== 'string' ||
      !r.error_name.length ||
      r.physical_id !== null ||
      r.resource_sha256 !== null ||
      r.stream_entry !== null ||
      r.legacy_backup_present !== null ||
      r.presentation_streams !== null
    )
      invalid();
  }
  return value;
}
export function decodeHwp5ChartDisplay(bytes) {
  const value = envelope(bytes, 'hwp5_chart_display');
  owner(value.owner);
  if (
    !uint(value.section) ||
    !uint(value.physical_id, 65535) ||
    !digest(value.resource_sha256) ||
    !uint(value.stream_entry) ||
    typeof value.legacy_backup_present !== 'boolean' ||
    !uint(value.presentation_streams) ||
    Object.hasOwn(value, 'pair') ||
    Object.hasOwn(value, 'host')
  )
    invalid();
  validateChartDisplayData(value.data);
  return value;
}
export function createHwp5ChartDisplayApi({ wasm, check, output, u32 }) {
  const supported = () => {
    check();
    try {
      return (
        HWP5_CHART_READ_FUNCTIONS.every((name) => typeof wasm[name] === 'function') &&
        wasm.hwp5_edit_chart_display_profile_version() === HWP5_CHART_READ_PROFILE_VERSION
      );
    } catch {
      return false;
    }
  };
  const ready = () => {
    if (!supported()) throw Error('Hwp5ChartDisplayAbiUnavailable');
  };
  return {
    supportsHwp5ChartDisplayAbi: supported,
    hwp5ChartCandidates() {
      ready();
      return decodeHwp5ChartCandidates(output(() => wasm.hwp5_edit_chart_candidates()).bytes);
    },
    hwp5ChartDisplay(section, control) {
      ready();
      const s = u32(section, 'section'),
        c = u32(control, 'control');
      const value = decodeHwp5ChartDisplay(output(() => wasm.hwp5_edit_chart_display(s, c)).bytes);
      if (value.section !== s || value.owner.control_node !== c) invalid();
      return value;
    },
  };
}

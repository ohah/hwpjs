import {
  decodeHwp5ChartCandidates,
  decodeHwp5ChartDisplay,
} from '../../../js/hwp5-chart-display-api.mjs';
import type { Hwp5ChartDisplay } from '../../../js/hwp5-chart-display-api.mjs';
import type { DocumentBlock, ObjectReference } from './types/document-view.ts';

type Result =
  | { state: 'available'; detail: Hwp5ChartDisplay }
  | { state: 'unavailable'; reason: string };
const unavailable = (reason: string): Result => ({ state: 'unavailable', reason });
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = (): never => {
  throw Error('InvalidObjectDetail');
};
// Decoded JSON witnesses have no cycles or retained SDK/Native buffer references.
function same(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((value, i) => same(value, right[i]));
  if (!record(left) || !record(right)) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && same(left[key], right[key]))
  );
}
function decoded<T>(decode: (bytes: Uint8Array) => T, value: unknown): T {
  try {
    // Reuse the public SDK's complete wire validation, not a second chart schema.
    // The SDK protocol itself caps the reply at 16 MiB; the host separately caps text.
    return decode(new TextEncoder().encode(JSON.stringify(value)));
  } catch (cause) {
    throw Error('InvalidObjectDetail', { cause });
  }
}
function message(error: unknown): string {
  return record(error) && typeof error.message === 'string' ? error.message : 'NativeReadFailed';
}
/** Read detail for an already inventory-verified drawing reference. No reclassification or edit authority. */
export function readHwp5ChartObjectDetail(
  sdk: object,
  target: ObjectReference,
  block: DocumentBlock,
): Result {
  if (
    target.format !== 'hwp5' ||
    target.kind !== 'drawing' ||
    block.type !== 'unknown' ||
    block.kind !== 'drawing' ||
    block.nativeKind !== 0x246f6c65 ||
    block.source?.section !== target.section ||
    block.source?.node !== target.node
  )
    return invalid();
  if (block.detailUnavailable || block.diagnostic?.code !== 'ObjectDetailsDeferred')
    return unavailable('Hwp5ChartInventoryOwnerUnverified');
  let capabilities: unknown, candidates: unknown, display: unknown;
  try {
    capabilities = Reflect.get(sdk, 'supportsHwp5ChartDisplayAbi');
    candidates = Reflect.get(sdk, 'hwp5ChartCandidates');
    display = Reflect.get(sdk, 'hwp5ChartDisplay');
    if (
      typeof capabilities !== 'function' ||
      typeof candidates !== 'function' ||
      typeof display !== 'function' ||
      Reflect.apply(capabilities, sdk, []) !== true
    )
      return unavailable('Hwp5ChartDisplayAbiUnavailable');
  } catch (error) {
    return unavailable(`Hwp5ChartDisplayAbi: ${message(error)}`);
  }
  let raw: unknown;
  try {
    raw = Reflect.apply(candidates, sdk, []);
  } catch (error) {
    return unavailable(`hwp5ChartCandidates: ${message(error)}`);
  }
  const packet = decoded(decodeHwp5ChartCandidates, raw);
  const selected = packet.candidates.filter(
    (row) => row.section === target.section && row.owner.component_node === target.node,
  );
  if (selected.length === 0) return unavailable('Hwp5ChartCandidateNotFound');
  if (selected.length !== 1) return invalid();
  const row = selected[0];
  if (row.resource.state !== 'modern_chart') return unavailable(row.resource.error_name);
  // drawing/N names a component. The public display API names its proven control.
  try {
    raw = Reflect.apply(display, sdk, [target.section, row.owner.control_node]);
  } catch (error) {
    return unavailable(`hwp5ChartDisplay: ${message(error)}`);
  }
  const detail = decoded(decodeHwp5ChartDisplay, raw);
  if (
    detail.section !== target.section ||
    detail.source_epoch !== packet.source_epoch ||
    detail.history_revision !== packet.history_revision ||
    !same(detail.owner, row.owner) ||
    !same(
      {
        physical_id: detail.physical_id,
        resource_sha256: detail.resource_sha256,
        stream_entry: detail.stream_entry,
        legacy_backup_present: detail.legacy_backup_present,
        presentation_streams: detail.presentation_streams,
      },
      {
        physical_id: row.resource.physical_id,
        resource_sha256: row.resource.resource_sha256,
        stream_entry: row.resource.stream_entry,
        legacy_backup_present: row.resource.legacy_backup_present,
        presentation_streams: row.resource.presentation_streams,
      },
    )
  )
    return invalid();
  return { state: 'available', detail };
}

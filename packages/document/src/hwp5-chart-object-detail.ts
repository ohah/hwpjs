import {
  decodeHwp5ChartCandidates,
  decodeHwp5ChartDisplay,
} from '../../../js/hwp5-chart-display-api.mjs';
import type { Hwp5ChartDisplay } from '../../../js/hwp5-chart-display-api.mjs';
import type { DocumentBlock, ObjectReference } from './types/document-view.ts';

type Result =
  | { state: 'available'; detail: Hwp5ChartDisplay }
  | { state: 'unavailable'; reason: string };
const unavailable = (reason: string): Extract<Result, { state: 'unavailable' }> => ({
  state: 'unavailable',
  reason,
});
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
type Packet = ReturnType<typeof decodeHwp5ChartCandidates>;
type Candidate = Packet['candidates'][number];
type Ready = {
  state: 'ready';
  packet: Packet;
  byComponent: Map<string, Candidate | null>;
  display: (...args: number[]) => unknown;
};
const key = (section: number, component: number): string => `${section}:${component}`;

function validateDisplayWitness(
  detail: Hwp5ChartDisplay,
  packet: Packet,
  row: Candidate,
  target: ObjectReference,
): void {
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
}

/** Internal per-read resolver. No public SDK methods or reference grammar added. */
export function createHwp5ChartDetailReader(sdk: object) {
  let initialized: Ready | Extract<Result, { state: 'unavailable' }> | undefined;
  let failed = false,
    failure: unknown;
  const initialize = (): NonNullable<typeof initialized> => {
    if (failed) throw failure;
    if (initialized) return initialized;
    try {
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
          return (initialized = unavailable('Hwp5ChartDisplayAbiUnavailable'));
      } catch (error) {
        return (initialized = unavailable(`Hwp5ChartDisplayAbi: ${message(error)}`));
      }
      let raw: unknown;
      try {
        raw = Reflect.apply(candidates, sdk, []);
      } catch (error) {
        return (initialized = unavailable(`hwp5ChartCandidates: ${message(error)}`));
      }
      const packet = decoded(decodeHwp5ChartCandidates, raw);
      const byComponent = new Map<string, Candidate | null>();
      for (const row of packet.candidates) {
        const id = key(row.section, row.owner.component_node);
        // Distinct controls can still collide on a component. Never choose first/last.
        byComponent.set(id, byComponent.has(id) ? null : row);
      }
      const invoke = display;
      return (initialized = {
        state: 'ready',
        packet,
        byComponent,
        display: (...args: number[]) => Reflect.apply(invoke, sdk, args),
      });
    } catch (error) {
      failed = true;
      failure = error;
      throw error;
    }
  };
  return (target: ObjectReference, block: DocumentBlock): Result => {
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
    const state = initialize();
    if (state.state !== 'ready') return state;
    const row = state.byComponent.get(key(target.section, target.node));
    if (row === undefined) return unavailable('Hwp5ChartCandidateNotFound');
    if (row === null) return invalid();
    if (row.resource.state !== 'modern_chart') return unavailable(row.resource.error_name);
    let raw: unknown;
    try {
      raw = state.display(target.section, row.owner.control_node);
    } catch (error) {
      return unavailable(`hwp5ChartDisplay: ${message(error)}`);
    }
    const detail = decoded(decodeHwp5ChartDisplay, raw);
    validateDisplayWitness(detail, state.packet, row, target);
    return { state: 'available', detail };
  };
}

/** Single-object inspector uses exactly the same witness checks as read projection. */
export function readHwp5ChartObjectDetail(
  sdk: object,
  target: ObjectReference,
  block: DocumentBlock,
): Result {
  return createHwp5ChartDetailReader(sdk)(target, block);
}

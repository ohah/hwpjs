import {
  PAGE_RESTART_MAX_ROWS,
  PAGE_RESTART_MAX_LEASE_KEY,
  PAGE_RESTART_MAX_REASON,
} from '../../../../js/page-restart-limits.mjs';
import { ownPageRecord } from '../../../../js/page-settings-edit.mjs';
declare const pageRestartTarget: unique symbol;
export interface PageRestartTarget {
  readonly [pageRestartTarget]: true;
}
export interface EditPageRestartPayload {
  readonly target: PageRestartTarget;
  readonly number: number;
}
export interface PageRestartEntry {
  readonly target: PageRestartTarget;
  readonly section: number;
  readonly controlNode: number;
  /** Current public display ordinal; never a Native paragraph or control ID. */
  readonly paragraph: number;
  readonly number: number;
}
export type PageRestartRead =
  | Readonly<{ state: 'unavailable'; reason: string }>
  | Readonly<{
      state: 'available';
      format: 'hwp5' | 'hwpx';
      entries: readonly PageRestartEntry[];
      unavailable: readonly Readonly<{
        section: number;
        controlNode: number | null;
        paragraph: number | null;
        reason: string;
      }>[];
    }>;
export interface PageRestartInventory {
  schemaVersion: 1;
  format: 'hwp5' | 'hwpx';
  revision: number;
  unavailable: {
    section: number;
    controlNode: number | null;
    paragraph: number | null;
    reason: string;
  }[];
  entries: {
    section: number;
    controlNode: number;
    paragraph: number;
    number: number;
    leaseKey: string;
  }[];
}
const uint = (v: unknown): v is number =>
  typeof v === 'number' &&
  Number.isSafeInteger(v) &&
  v >= 0 &&
  v <= 0xffffffff &&
  !Object.is(v, -0);
export function checkedPageRestartNumber(value: unknown): number {
  if (!uint(value) || value < 1 || value > 65535) throw Error('InvalidPageRestartNumber');
  return value;
}
export function capturePageRestartPayload(input: unknown): EditPageRestartPayload {
  const v = ownPageRecord(input, ['target', 'number']);
  if (!v.target || typeof v.target !== 'object') throw Error('InvalidPageRestartTarget');
  return Object.freeze({
    target: v.target as PageRestartTarget,
    number: checkedPageRestartNumber(v.number),
  });
}
/** Internal runtime DTO only. Native observations remain private in the backend. */
export function checkedPageRestartInventory(
  input: unknown,
  format: unknown,
  revision: unknown,
): PageRestartInventory {
  const v = ownPageRecord(input, ['schemaVersion', 'format', 'revision', 'entries', 'unavailable']);
  if (
    v.schemaVersion !== 1 ||
    (v.format !== 'hwp5' && v.format !== 'hwpx') ||
    v.format !== format ||
    !uint(v.revision) ||
    v.revision !== revision ||
    !Array.isArray(v.entries) ||
    !Array.isArray(v.unavailable) ||
    v.entries.length + v.unavailable.length > PAGE_RESTART_MAX_ROWS
  )
    throw Error('InvalidPageRestartInventory');
  const keys = new Set<string>(),
    leases = new Set<string>();
  const entries = v.entries.map((value: unknown) => {
    const row = ownPageRecord(value, ['section', 'controlNode', 'paragraph', 'number', 'leaseKey']);
    if (
      !uint(row.section) ||
      !uint(row.controlNode) ||
      !uint(row.paragraph) ||
      typeof row.leaseKey !== 'string' ||
      row.leaseKey.length === 0 ||
      row.leaseKey.length > PAGE_RESTART_MAX_LEASE_KEY
    )
      throw Error('InvalidPageRestartInventory');
    const key = `${row.section}:${row.controlNode}`;
    if (keys.has(key) || leases.has(row.leaseKey)) throw Error('AmbiguousPageRestart');
    keys.add(key);
    leases.add(row.leaseKey);
    return {
      section: row.section,
      controlNode: row.controlNode,
      paragraph: row.paragraph,
      number: checkedPageRestartNumber(row.number),
      leaseKey: row.leaseKey,
    };
  });
  const unavailable = v.unavailable.map((value: unknown) => {
    const row = ownPageRecord(value, ['section', 'controlNode', 'paragraph', 'reason']);
    if (
      !uint(row.section) ||
      (row.controlNode !== null && !uint(row.controlNode)) ||
      (row.paragraph !== null && !uint(row.paragraph)) ||
      typeof row.reason !== 'string' ||
      !row.reason.length ||
      row.reason.length > PAGE_RESTART_MAX_REASON
    )
      throw Error('InvalidPageRestartInventory');
    const key = `${row.section}:${row.controlNode}`;
    if (keys.has(key)) throw Error('AmbiguousPageRestart');
    keys.add(key);
    return {
      section: row.section,
      controlNode: row.controlNode,
      paragraph: row.paragraph,
      reason: row.reason,
    };
  });
  return { schemaVersion: 1, format: v.format, revision: v.revision, entries, unavailable };
}

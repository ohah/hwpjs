import type { OperationDocument } from '../types/native-document.ts';

// Public SDK runtime DTO; the format-specific capability remains SDK-owned.
// These are source HWPUNIT axes; the CLI never converts or transposes them.
import type { PageSettingsValues } from '../../../../js/page-settings-edit.mjs';
import { checkedPageSettingsCapabilities } from '../../../../js/page-settings-edit.mjs';
export interface PageSettingsOperation {
  readonly kind: 'page-settings';
  readonly scope: 'section' | 'document';
  readonly section?: number;
  readonly values: PageSettingsValues;
}
function method(document: OperationDocument, name: string): (...args: unknown[]) => unknown {
  const fn: unknown = Reflect.get(document.sdk, name);
  if (typeof fn !== 'function') throw new Error('PageSettingsWriteUnavailable');
  return (...args) => Reflect.apply(fn, document.sdk, args);
}
export function requirePageSettingsWrite(document: OperationDocument): void {
  if (!['hwpx', 'hwp5'].includes(document.format)) throw new Error('PageSettingsWriteUnavailable');
  for (const name of ['pageSettingsCapabilities', 'writePageSettings']) method(document, name);
  if (method(document, 'supportsPageSettingsWrite')() !== true)
    throw new Error('PageSettingsWriteUnavailable');
}
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

// Never accept serialized Native bindings from a caller. Query in this live session,
// both at full-batch admission and immediately before each current-transaction write.
function request(document: OperationDocument, operation: PageSettingsOperation) {
  const cap = checkedPageSettingsCapabilities(method(document, 'pageSettingsCapabilities')());
  if (cap.format !== document.format || cap.sections.length !== document.sectionCount)
    throw new Error('InvalidPageSettingsCapabilities');
  const seen = new Set<number>();
  for (const row of cap.sections) {
    if (
      !record(row) ||
      !Number.isInteger(row.section) ||
      typeof row.section !== 'number' ||
      row.section < 0 ||
      row.section >= document.sectionCount ||
      seen.has(row.section)
    )
      throw new Error('InvalidPageSettingsCapabilities');
    seen.add(row.section);
  }
  const rows =
    operation.scope === 'document'
      ? cap.sections
      : cap.sections.filter((row) => row.section === operation.section);
  if (rows.length === 0) throw new Error('InvalidPageSettingsTargets');
  for (const row of rows) {
    if (row.target === null) throw new Error(String(row.reason ?? 'InvalidPageSettingsTargets'));
    if (!record(row.target) || row.target.section !== row.section || row.reason !== null)
      throw new Error('InvalidPageSettingsCapabilities');
  }
  return {
    binding: cap.binding,
    scope: operation.scope,
    targets: rows.map((row) => row.target),
    values: operation.values,
  };
}
export function admitPageSettings(
  document: OperationDocument,
  operation: PageSettingsOperation,
): void {
  request(document, operation);
}
export function applyPageSettings(
  document: OperationDocument,
  operation: PageSettingsOperation,
): void {
  const result = method(document, 'writePageSettings')(request(document, operation));
  if (
    !record(result) ||
    result.refreshRequired !== undefined ||
    result.cleanupError !== undefined ||
    result.error !== undefined ||
    !(
      (result.nativeCode === 1 && result.application === 'applied' && result.changed === true) ||
      (result.nativeCode === 2 && result.application === 'unapplied' && result.changed === false)
    )
  )
    throw new Error(
      record(result) && typeof result.error === 'string'
        ? result.error
        : 'UnconfirmedPageSettingsCompletion',
    );
}

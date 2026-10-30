import { isPlainOwnerBaseline } from './owner-window-cow.ts';
import { exactDisplayValue } from './full-snapshot-text-delta.ts';
import { isOwnedImmutableObservation, ownObservation } from '../state/owned.ts';
import type { GeometryOwner } from './native-geometry-evidence.ts';
import type { NativeRuntimeOrigin } from './native-runtime-origin.ts';

/** Full current display assembly only. No history text, inverse edit or Native receipt is retained. */
export function mergeHistoryOwnerWindow(
  before: any,
  packet: any,
  origin: NativeRuntimeOrigin,
  expected: {
    owner: GeometryOwner;
    epoch: string;
    revision: number;
    nextRevision: number;
    referenceScope: string;
  },
) {
  try {
    const baseline = before.content;
    if (
      !isOwnedImmutableObservation(baseline as unknown) ||
      !isOwnedImmutableObservation(packet as unknown) ||
      !isPlainOwnerBaseline(baseline, expected.owner.section, expected.owner.paragraph) ||
      !origin.authority() ||
      origin.kind !== 'history-window' ||
      origin.historyWindowDelta !== packet ||
      packet.viewKind !== 'history-owner-window' ||
      packet.version !== 1 ||
      !['undo', 'redo'].includes(packet.operation) ||
      packet.beforeEpoch !== expected.epoch ||
      packet.beforeRevision !== expected.revision ||
      packet.revision !== expected.nextRevision ||
      packet.epoch !== origin.nativeEpoch ||
      !exactDisplayValue(packet.owner, expected.owner)
    )
      return null;
    const w = packet.window,
      ref = packet.reference,
      owner = expected.owner;
    if (
      w.epoch !== packet.epoch ||
      w.section !== owner.section ||
      w.sourceNode !== owner.sourceNode ||
      w.parentNode !== owner.parentNode ||
      !Number.isSafeInteger(w.totalUnits) ||
      w.totalUnits < 2 ||
      w.totalUnits > 4096 ||
      w.startUnit !== 0 ||
      w.endUnit !== w.totalUnits ||
      typeof w.text !== 'string' ||
      !w.text.isWellFormed() ||
      w.text.length !== w.totalUnits ||
      w.text.at(-1) !== '\r' ||
      Array.from(w.text.slice(0, -1)).some((c: any) => c.charCodeAt(0) < 32 || c === '\ufffc') ||
      ref.kind !== 'original' ||
      ref.scope !== expected.referenceScope ||
      ref.epoch !== w.epoch ||
      ref.id !== String(owner.sourceNode) ||
      ref.section !== owner.section ||
      ref.row !== 0 ||
      ref.column !== 0 ||
      !Array.isArray(packet.characterRanges) ||
      !packet.characterRanges.length ||
      packet.characterRanges.length > 4096
    )
      return null;
    const flow = baseline.currentParagraphFlows.find(
      (f: any) => f.section === owner.section && f.paragraph === owner.paragraph,
    );
    if (!flow || flow.source_node !== owner.sourceNode || flow.parent_node !== owner.parentNode)
      return null;
    const text = w.text.slice(0, -1),
      characterRanges: any[] = [];
    const shapeIds = new Set(baseline.characterShapes.map((s: any) => s.id));
    let cursor = 0;
    for (const run of packet.characterRanges) {
      if (
        !Number.isSafeInteger(run.start) ||
        !Number.isSafeInteger(run.end) ||
        run.start !== cursor ||
        run.end < run.start ||
        run.end > text.length ||
        !shapeIds.has(run.charShapeId)
      )
        return null;
      cursor = run.end;
      characterRanges.push({ start: run.start, end: run.end, charShapeId: run.charShapeId });
    }
    if (cursor !== text.length) return null;
    let owners = 0;
    const paragraphs = baseline.paragraphs.map((row: any) => {
      const r = row.currentReference;
      if (
        !isOwnedImmutableObservation(row as unknown) ||
        r?.kind !== 'original' ||
        r.scope !== expected.referenceScope ||
        r.epoch !== expected.epoch
      )
        throw Error('StaleHistoryBaseline');
      const currentReference = { ...r, epoch: w.epoch };
      if (row.section !== owner.section || row.paragraph !== owner.paragraph)
        return { ...row, currentReference };
      owners++;
      if (!exactDisplayValue(currentReference, ref)) throw Error('HistoryOwnerMismatch');
      return { ...row, currentReference, text, characterRanges };
    });
    if (owners !== 1 || !origin.authority()) return null;
    const next = ownObservation({ ...baseline, paragraphs })();
    return isPlainOwnerBaseline(next, owner.section, owner.paragraph) && origin.authority()
      ? next
      : null;
  } catch {
    return null;
  }
}

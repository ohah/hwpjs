import type { EditorState } from "./editor-state.ts";
export interface HistoryAvailability {
  readonly available: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}
const unavailable: HistoryAvailability = Object.freeze({
  available: false,
  canUndo: false,
  canRedo: false,
});
/** Native Stack allocates monotonically increasing IDs; list order is NOT chronological.
 * Each retained undo ID is smaller than current; each redo ID is larger. Branching
 * discards redo and allocates a fresh ID. Never infer availability from revision>0:
 * bounded history can evict every preceding checkpoint.
 */
export function getHistoryAvailability(state: EditorState): HistoryAvailability {
  if (
    state.status !== "ready" ||
    (state.capabilities as { readOnly?: boolean } | undefined)?.readOnly === true
  )
    return unavailable;
  const current = state.nativeHistoryRevision,
    reachable = state.nativeHistoryRevisions;
  const valid = (value: unknown): value is number =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 0xffffffff;
  if (
    !valid(current) ||
    !Array.isArray(reachable) ||
    reachable.length < 1 ||
    reachable.length > 65536 ||
    reachable[0] !== current ||
    !reachable.every(valid) ||
    new Set(reachable).size !== reachable.length
  )
    return unavailable;
  return Object.freeze({
    available: true,
    canUndo: reachable.some((revision) => revision < current),
    canRedo: reachable.some((revision) => revision > current),
  });
}

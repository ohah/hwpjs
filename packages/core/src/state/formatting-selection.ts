import { EditorState, type StateData } from "./editor-state.ts";
import type { SelectionTarget } from "../commands/commands.ts";
import { validateSelection } from "../commands/selection.ts";

// Epoch is a native session revision, not paragraph identity. The next command
// always obtains the current reference from its new snapshot; never reuse it.
const identity = (reference: unknown) =>
  reference && typeof reference === "object"
    ? Object.fromEntries(Object.entries(reference).filter(([key]) => key !== "epoch"))
    : reference;
/** Retain only an existing selection whose display/source identity survived formatting. */
export function formattingSelection(
  previous: EditorState,
  patch: Partial<StateData>,
  revision: number,
): SelectionTarget | undefined {
  const selected = previous.selection as SelectionTarget | null | undefined;
  if (!selected) return undefined;
  try {
    const old = validateSelection(selected, previous);
    const next = new EditorState({
      editorId: previous.editorId,
      documentId: previous.documentId,
      generation: previous.generation,
      operationRevision: revision,
      viewRevision: previous.viewRevision,
      stateVersion: previous.stateVersion,
      status: "ready",
      ...patch,
    });
    const target = { ...selected, ...next.token },
      row = validateSelection(target, next);
    // Native formatting must not silently change text, source identity or offset mapping.
    // Both original references and display owner are checked; IDs are never array ordinals.
    if (
      old.text !== row.text ||
      JSON.stringify(identity(old.currentReference)) !==
        JSON.stringify(identity(row.currentReference)) ||
      JSON.stringify(old.sourceOffsets) !== JSON.stringify(row.sourceOffsets) ||
      JSON.stringify(old.tableCell) !== JSON.stringify(row.tableCell) ||
      JSON.stringify(old.drawingText) !== JSON.stringify(row.drawingText) ||
      JSON.stringify(old.drawingCaption) !== JSON.stringify(row.drawingCaption) ||
      JSON.stringify(old.createdCell) !== JSON.stringify(row.createdCell)
    )
      return undefined;
    return target;
  } catch {
    return undefined;
  }
}

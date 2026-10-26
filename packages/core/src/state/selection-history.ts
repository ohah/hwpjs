import { EditorState } from './editor-state.ts';
import type { SelectionTarget } from '../commands/commands.ts';
import { validateSelection } from '../commands/selection.ts';
import { getHistoryAvailability } from './history-state.ts';

type Location = Pick<
  SelectionTarget,
  | 'coordinateSpace'
  | 'format'
  | 'owner'
  | 'section'
  | 'paragraph'
  | 'startUnit'
  | 'endUnit'
  | 'affinity'
>;
/** Auxiliary view locations only. Native revisions/content remain authoritative.
 * This helper is private to each editor; never serialize it as document history.
 */
export class SelectionHistory {
  #documentId: string | null = null;
  #generation = -1;
  #locations = new Map<number, Readonly<Location> | null>();
  clear(): void {
    this.#locations.clear();
    this.#documentId = null;
    this.#generation = -1;
  }
  #reachable(state: EditorState): Set<number> | undefined {
    // Share the native u32/current-first/unique/count contract with public history UI.
    if (!getHistoryAvailability(state).available) return;
    return new Set(state.nativeHistoryRevisions!);
  }
  observe(state: EditorState): void {
    if (state.documentId !== this.#documentId || state.generation !== this.#generation) {
      this.clear();
      this.#documentId = state.documentId;
      this.#generation = state.generation;
    }
    if (state.status === 'disposed') {
      this.clear();
      return;
    }
    if (state.status !== 'ready' || !state.documentId) return;
    const reachable = this.#reachable(state);
    if (!reachable) {
      this.#locations.clear();
      return;
    }
    for (const revision of this.#locations.keys())
      if (!reachable.has(revision)) this.#locations.delete(revision);
    const selected = state.selection;
    // A mutation clears the current projection, not this revision's known location.
    if (selected === undefined) return;
    const revision = state.nativeHistoryRevision!;
    if (selected === null) {
      this.#locations.set(revision, null);
      return;
    }
    try {
      const target = selected as SelectionTarget;
      validateSelection(target, state);
      this.#locations.set(
        revision,
        Object.freeze({
          coordinateSpace: target.coordinateSpace,
          format: target.format,
          owner: target.owner,
          section: target.section,
          paragraph: target.paragraph,
          startUnit: target.startUnit,
          endUnit: target.endUnit,
          affinity: target.affinity,
        }),
      );
    } catch {
      this.#locations.delete(revision);
    }
  }
  /** Call only for a successful Native undo/redo snapshot, with its new tokens. */
  restore(state: EditorState): SelectionTarget | null | undefined {
    if (
      state.status !== 'ready' ||
      !state.documentId ||
      state.documentId !== this.#documentId ||
      state.generation !== this.#generation
    )
      return;
    const reachable = this.#reachable(state),
      revision = state.nativeHistoryRevision!;
    if (!reachable || !reachable.has(revision)) return;
    const location = this.#locations.get(revision);
    if (location === undefined || location === null) return location;
    const target = Object.freeze({ ...location, ...state.token });
    try {
      validateSelection(target, state);
      return target;
    } catch {
      return;
    }
  }
}

import { isOwnedImmutableObservation } from '../state/owned.ts';

const duplicate = Symbol('DuplicateParagraphCoordinate');
const fallback = Symbol('ParagraphIndexFallback');
type CoordinateRow = { section: number; paragraph: number };
type Index = Map<number, Map<number, CoordinateRow | typeof duplicate>>;
type Visit = (phase: 'index' | 'fallback') => void;

/** Internal diagnostic tap observes work only; it cannot mint ownership or alter rows.
 * The shared production lookup has no tap. Each WeakMap lives with its lookup. */
export function createParagraphRowLookup(visit?: Visit) {
  const indexes = new WeakMap<object, Index | typeof fallback>();
  return function uniqueParagraphRow<T extends CoordinateRow>(
    paragraphs: T[] | undefined,
    section: number,
    paragraph: number,
  ): T | undefined {
    const scan = () => {
      // Preserve method lookup, sparse slots, exceptions, and external mutation semantics.
      const matches = paragraphs?.filter((row) => {
        visit?.('fallback');
        return row.section === section && row.paragraph === paragraph;
      });
      return matches?.length === 1 ? matches[0] : undefined;
    };
    if (!isOwnedImmutableObservation(paragraphs) || !Array.isArray(paragraphs)) return scan();
    let index = indexes.get(paragraphs);
    if (index === undefined) {
      const built: Index = new Map();
      let eligible = true;
      for (let i = 0; i < paragraphs.length; i++) {
        visit?.('index');
        // ownObservation preserves holes; inherited slots are not an immutable snapshot.
        const slot = Object.getOwnPropertyDescriptor(paragraphs, String(i));
        const row: unknown = slot && 'value' in slot ? slot.value : undefined;
        if (!isOwnedImmutableObservation(row)) {
          eligible = false;
          break;
        }
        const s = Object.getOwnPropertyDescriptor(row, 'section');
        const p = Object.getOwnPropertyDescriptor(row, 'paragraph');
        if (
          !s ||
          !p ||
          !('value' in s) ||
          !('value' in p) ||
          !Number.isSafeInteger(s.value) ||
          s.value < 0 ||
          !Number.isSafeInteger(p.value) ||
          p.value < 0
        ) {
          eligible = false;
          break;
        }
        let sectionRows = built.get(s.value);
        if (!sectionRows) built.set(s.value, (sectionRows = new Map()));
        sectionRows.set(p.value, sectionRows.has(p.value) ? duplicate : (row as CoordinateRow));
      }
      index = eligible ? built : fallback;
      indexes.set(paragraphs, index);
    }
    if (index === fallback) return scan();
    const row = index.get(section)?.get(paragraph);
    return row === duplicate ? undefined : (row as T | undefined);
  };
}

/** Coordinates are lookup keys only; canonical selection validation grants authority. */
export const uniqueParagraphRow = createParagraphRowLookup();

import { sameCreatedCell } from './created-cell-address.mjs';
import { createdCellCharacterRanges } from '../../js/created-cell-character-runs.mjs';
import { projectTypingDraftRanges } from './typing-format-draft.mjs';
import { createdCellTypingDraftRanges } from './created-cell-typing-observation.mjs';
function cellDraft(cell, draft, fallback, content) {
  if (!Object.hasOwn(cell, 'character_runs')) return { ...cell, text: draft.text };
  const ranges = Array.isArray(draft.characterRanges)
    ? projectTypingDraftRanges(
        { text: draft.text, characterRanges: draft.characterRanges },
        draft.text,
      )
    : ['hwp5', 'hwpx'].includes(content.format)
      ? createdCellTypingDraftRanges(
          content,
          {
            section: draft.section,
            createdCell: draft.createdCell,
            text: cell.text,
            editable: true,
          },
          draft,
          draft.text,
          null,
          cell.text,
        )
      : projectTypingDraftRanges(
          { text: cell.text, characterRanges: createdCellCharacterRanges(cell, fallback) },
          draft.text,
        );
  if (!ranges) return cell;
  // Renderer-only projection. Native character_runs remain unchanged and no
  // source/typing lease is minted from these speculative display ranges.
  return { ...cell, text: draft.text, draftCharacterRanges: ranges };
}
export function projectCreatedCellDraft(content, draft) {
  if (!draft?.createdCell) return content;
  return {
    ...content,
    createdTables: content.createdTables?.map((table) =>
      table.section === draft.section && table.identity === draft.createdCell.identity
        ? {
            ...table,
            cells: table.cells.map((cell) =>
              sameCreatedCell(
                {
                  section: table.section,
                  createdCell: { identity: table.identity, row: cell.row, column: cell.column },
                },
                draft,
              )
                ? cellDraft(cell, draft, table.resources?.character, content)
                : cell,
            ),
          }
        : table,
    ),
  };
}

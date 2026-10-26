import { notePlanningFrame } from "./note-planning-frame.mjs";
import { paginateBodyRows } from "./page-row-flow.mjs";
import { projectCreatedBodyFlow } from "./created-body-flow-measurement.mjs";
import { notePageScenes } from "./note-page-scenes.mjs";
import { sourceNoteOverflowBounds } from "./source-note-table-overflow.mjs";

// 셀·개체 예약 행은 그대로 두고 기존 페이지 배치기로 긴 미주를 나눕니다.
export function sourceNoteScenes(
  content,
  measured,
  width,
  maxRows,
  note,
  context,
  overflowTables = new Set(),
) {
  const fail = (error) => ({ state: "unavailable", error });
  if (note?.kind !== "endnote") return fail("UnsupportedSourceNoteContinuationKind");
  const frame = notePlanningFrame(content, note, width, context);
  if (frame.state !== "selected") return frame;
  const direct = content.paragraphs.filter(
    (p) => !p.tableCell && !p.tableCaption && !p.drawingText && !p.drawingCaption,
  );
  const flows = [];
  for (const paragraph of direct) {
    const matches = content.paragraphFlows.filter(
      (f) => f.section === paragraph.section && f.paragraph === paragraph.paragraph,
    );
    const flow = matches[0];
    if (
      matches.length !== 1 ||
      flow.host !== note.kind ||
      flow.top_level !== false ||
      flow.note_context?.note_node !== note.noteNode ||
      flow.note_context?.list_node !== note.listNode ||
      flow.note_context?.kind !== note.kind
    )
      return fail("InvalidSourceNoteContinuationOwner");
    flows.push({
      ...flow,
      host: "body",
      top_level: true,
      single_column: true,
      column_declaration: {
        count: 1,
        same_size: true,
        gap: 0,
        direction: "left",
        kind: "newspaper",
        ambiguous: false,
      },
    });
  }
  const inset = context?.firstPageTopInset ?? 0;
  if (!Number.isFinite(inset) || inset < 0) return fail("InvalidSourceNoteContinuationInset");
  const page = paginateBodyRows(measured.rows, frame.setting, flows, {
    maxRows,
    columnBottom: (_row, { column, pageOrdinal }) =>
      column.y + column.height - (pageOrdinal === 0 ? inset : 0),
  });
  if (page.state !== "paginated") return page;
  if (page.limited) return fail("SourceNoteSceneLimit");
  const projected = projectCreatedBodyFlow(measured, page.rows, maxRows);
  if (projected.state !== "projected") return projected;
  const overflow = sourceNoteOverflowBounds(
    projected,
    overflowTables,
    (ordinal) => page.pages.find((p) => p.ordinal === ordinal)?.page,
  );
  if (overflow.state !== "contained") return overflow;
  const scenes = notePageScenes(
    {
      ...page,
      ...projected,
      state: "paginated",
      limited: false,
      placedDrawings: [],
      placedContainers: [],
    },
    { front: [], behind: [] },
    { front: [], behind: [] },
    width,
    { nonPaintingBoxes: overflow.nonPaintingBoxes },
  );
  if (scenes.state !== "measured") return scenes;
  // 아직 연결하지 않은 자동 번호 접두어를 장면 사이에서 잃지 않습니다.
  if (projected.hostNumberPrefixes.length) return fail("UnsupportedSourceNoteSceneNumberPrefix");
  return { ...scenes, numberPrefixes: [], rowCount: projected.rows.length };
}

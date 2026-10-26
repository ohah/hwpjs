import { prepareEndnoteBodyFlow, projectEndnoteBodySlots } from "./endnote-body-flow.mjs";
import { paginateBodyRows } from "./page-row-flow.mjs";
import { pageSequenceReference } from "./page-sequence-reference.mjs";
import { curveLayoutDiagnostics } from "./curve-layout-diagnostics.mjs";
import { bodyPageOccupiedBottom } from "./body-footnote-projection.mjs";
import { endnoteColumnPrefix } from "./endnote-column-prefix.mjs";

/** Continue after proven body occupancy without reflowing or copying its paint rows. */
export function appendBodyEndnotes(
  body,
  notes,
  policy,
  separator,
  setting,
  sourceFlows,
  maxRows,
  columnBottom,
  endnoteContext,
) {
  const fail = (error) => ({ state: "unavailable", error });
  if (
    body?.state !== "paginated" ||
    body.limited ||
    !Array.isArray(body.pages) ||
    !body.pages.length ||
    !Array.isArray(body.rows) ||
    !Array.isArray(notes) ||
    !notes.length ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    !Array.isArray(sourceFlows) ||
    (columnBottom !== undefined && typeof columnBottom !== "function")
  )
    return fail("InvalidEndnoteBodyLayout");
  const multiple = endnoteContext?.state === "resolved" && endnoteContext.columns?.length > 1;
  const prepared = prepareEndnoteBodyFlow(notes, policy, separator, sourceFlows, {
    sceneColumns: multiple,
  });
  if (prepared.state !== "prepared") return prepared;
  const allIds = [
    ...sourceFlows.map((f) => f.paragraph),
    ...prepared.flows.map((f) => f.paragraph),
    ...body.rows.map((row) => row.paragraph),
  ].filter(Number.isSafeInteger);
  const prefixParagraph = allIds.reduce((maximum, id) => Math.max(maximum, id), 0) + 1;
  if (!Number.isSafeInteger(prefixParagraph) || prefixParagraph > 0xffffffff)
    return fail("EndnoteBodyIdentityLimit");
  const prefix = [];
  if (multiple) {
    if (
      notes.some(
        (note) =>
          !Number.isFinite(note.width) || Math.abs(note.width - endnoteContext.width) > 1e-8,
      )
    )
      return fail("MismatchedEndnoteColumnWidth");
    const planned = endnoteColumnPrefix(body, endnoteContext, setting, prefixParagraph, maxRows);
    if (planned.state !== "prepared") return planned;
    prefix.push(...planned.rows);
  } else
    for (const [index, page] of body.pages.entries()) {
      const expected = pageSequenceReference(setting, index);
      if (
        expected.state !== "placed" ||
        page.ordinal !== index ||
        page.columns?.length !== 1 ||
        ["x", "y", "width", "height"].some(
          (field) => page.columns[0]?.[field] !== page.page?.[field],
        ) ||
        ["paper", "page"].some((key) =>
          ["x", "y", "width", "height"].some(
            (field) =>
              Math.abs(page[key]?.[field] - expected.boxes[key][field]) > 1e-8 ||
              !Number.isFinite(page[key]?.[field]),
          ),
        )
      )
        return {
          ...fail("UnsupportedEndnoteBodyPages"),
          layoutStage: "append-endnotes",
          pageOrdinal: index,
          bodyColumnCount: page.columns?.length,
          policyReason:
            page.columns?.length > 1
              ? "endnote-column-flow-not-connected"
              : "unproven-body-page-reference",
        };
      const occupied = bodyPageOccupiedBottom(body, page);
      if (occupied.state !== "measured") return occupied;
      if (occupied.bottom > page.page.y + page.page.height + 1e-8)
        return fail("UnsupportedEndnoteBodyOverflow");
      const height =
        index + 1 === body.pages.length ? occupied.bottom - page.page.y : page.page.height;
      if (height > 0)
        prefix.push({
          kind: "gap",
          section: policy.section,
          paragraph: prefixParagraph,
          height,
          endnoteBodyPrefix: true,
        });
    }
  const flows = [
    {
      section: policy.section,
      paragraph: prefixParagraph,
      host: "body",
      top_level: true,
      page_break: false,
      column_break: false,
    },
    ...prepared.flows,
  ];
  const planned = paginateBodyRows(
    [...prefix, ...prepared.rows],
    setting,
    multiple
      ? flows.map((flow) => ({
          ...flow,
          single_column: false,
          column_declaration: endnoteContext.declaration,
          column_start_declaration: endnoteContext.declaration,
          column_changes: [],
        }))
      : flows,
    {
      maxRows: maxRows + prefix.length,
      ...(multiple ? { columnZones: true } : {}),
      ...(columnBottom
        ? {
            columnBottom: (candidate, context) =>
              candidate.endnoteBodyPrefix
                ? context.column.y + context.column.height
                : columnBottom(candidate, {
                    ...context,
                    placedRows: [...body.rows, ...context.placedRows],
                  }),
          }
        : {}),
    },
  );
  if (planned.state !== "paginated" || planned.limited) return planned;
  const projected = projectEndnoteBodySlots(
    { ...planned, rows: planned.rows.filter((row) => !row.endnoteBodyPrefix) },
    notes,
  );
  if (projected.state !== "projected") return projected;
  if (
    body.rows.length +
      projected.rows.length +
      (body.hostNumberPrefixes?.length ?? 0) +
      projected.numberPrefixes.length >
    maxRows
  )
    return fail("NotePageLayoutLimit");
  const pages = planned.pages.map(
    (page, index) => body.pages[index] ?? { ...page, section: policy.section },
  );
  return {
    ...body,
    rows: [...body.rows, ...projected.rows],
    pages,
    boxes: [...(body.boxes ?? []), ...projected.boxes],
    hostNumberPrefixes: [...(body.hostNumberPrefixes ?? []), ...projected.numberPrefixes],
    noteSeparators: [...(body.noteSeparators ?? []), ...projected.separators],
    flowPictures: [...(body.flowPictures ?? []), ...projected.flowPictures],
    placedDrawings: [...(body.placedDrawings ?? []), ...projected.placedDrawings],
    placedCurves: [...(body.placedCurves ?? []), ...projected.placedCurves],
    ...curveLayoutDiagnostics(body, projected.warnings),
    placedContainers: [...(body.placedContainers ?? []), ...projected.placedContainers],
    noteAreas: [...(body.noteAreas ?? []), ...projected.noteAreas],
    height: Math.max(body.height, pages.at(-1).paper.y + pages.at(-1).paper.height),
    spatialRows: true,
  };
}

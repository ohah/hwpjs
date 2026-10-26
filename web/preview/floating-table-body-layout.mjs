import { pageSequenceReference } from "./page-sequence-reference.mjs";
import { columnReferenceBoxes } from "./column-reference-boxes.mjs";
import { measureTableCells } from "./table-cell-measurement.mjs";
import { tableFlowLine } from "./table-paragraph-flow.mjs";
import { paragraphLineGeometry, paragraphSpacePixels } from "./paragraph-geometry.mjs";
import { inlineTableHostAnchors } from "./inline-table-host-anchors.mjs";
import { alignTextRow } from "./line-alignment.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { measureNestedTable } from "./nested-table-measurement.mjs";
import { validateNestedTableOwnership } from "./nested-table-ownership.mjs";
import { nestedTablePaperBounds } from "./nested-table-paper-bounds.mjs";
import { layoutInlineTablePageContent } from "./inline-table-page-content.mjs";
import { textMeasurement } from "./text-measurement.mjs";
import { tableSourceHorizontalLayout } from "./table-source-horizontal-layout.mjs";
import { mixedInlineTablePolicy } from "./mixed-inline-table-policy.mjs";
import {
  floatingTableBodyExclusions,
  floatingTableAnchorCursor,
} from "./floating-table-body-reservations.mjs";
import { floatingTableInlinePictures } from "./floating-table-inline-pictures.mjs";
import { floatingTableHostIndex } from "./floating-table-host-index.mjs";
import { inlineObjectAnchorIndex } from "./inline-object-anchor-index.mjs";
import { floatingInlineTableLine } from "./floating-inline-table-line.mjs";
import { singleCellPictureColumn } from "./single-cell-picture-column.mjs";
import { inspectFloatingTablePlacement } from "./floating-table-placement-conflicts.mjs";
import { planFloatingTablePlacement } from "./floating-table-placement-plan.mjs";
import { tableHostProfile } from "./table-host-profile.mjs";
import {
  floatingTablePictureGroups,
  placeFloatingTablePictureGroup,
} from "./floating-table-picture-groups.mjs";

/** Whole rectangular floating table and single-column body, with real page spill. */
export function layoutFloatingTableBody(
  content,
  measure,
  maxRows = 20000,
  { measureCellFlow, completeLayout, pictureReferences } = {},
) {
  if (pictureReferences === undefined) pictureReferences = singleCellPictureColumn;
  const unavailable = (error) => ({ state: "unavailable", error });
  if (measureCellFlow !== undefined && typeof measureCellFlow !== "function")
    return unavailable("InvalidTableCellMeasurement");
  if (completeLayout !== undefined && typeof completeLayout !== "function")
    return unavailable("InvalidTableLayoutCompletion");
  const inlineAnchors = inlineObjectAnchorIndex(content);
  if (inlineAnchors.state !== "indexed") return inlineAnchors;
  if (inlineAnchors.index.size && !completeLayout)
    return unavailable("InvalidTableLayoutCompletion");
  if (
    content.structuralAnchorErrors?.length ||
    content.tableAnchorErrors?.length ||
    content.tableGeometryErrors?.length ||
    content.cellLayoutSourceErrors?.length
  )
    return unavailable("IncompleteFloatingTableSources");
  if (
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    !content.tables?.length ||
    content.tables.length > 10000 ||
    content.pageSettings?.length !== 1 ||
    content.limited ||
    content.paragraphs.some((p) => p.clipped) ||
    content.lines?.length ||
    content.drawings?.length
  )
    return unavailable("UnsupportedFloatingTableBody");
  const pictureGroups = floatingTablePictureGroups(content);
  if (pictureGroups.state !== "prepared") return pictureGroups;
  const pictures = floatingTableInlinePictures(
    { ...content, pictures: pictureGroups.pictures },
    measure,
    { pictureReferences },
  );
  if (pictures.state !== "prepared") return pictures;
  measure = pictures.measure;
  const setting = content.pageSettings[0];
  const nested = content.tables.some((table) => table?.parentTableNode != null);
  if (nested) {
    try {
      validateNestedTableOwnership(content);
    } catch {
      return unavailable("InvalidNestedTableFlow");
    }
  }
  const indexed = floatingTableHostIndex(content.tables, setting.section_ordinal);
  if (indexed.state !== "indexed") return indexed;
  const { owners, hosts } = indexed;
  for (const { table } of owners.values()) {
    const policyReason =
      table.parentTableNode !== null
        ? "nested-table"
        : table.sourceCaption
          ? "caption"
          : table.pagination?.cell_spacing !== 0
            ? "cell-spacing"
            : table.cells.some((cell) => typeof cell.sourceMargin?.header !== "boolean")
              ? "cell-header"
              : content.paragraphs.some((p) => p.tableCaption)
                ? "caption-paragraph"
                : null;
    if (policyReason)
      return {
        ...unavailable("UnsupportedFloatingTablePolicy"),
        section: table.section,
        tableNode: table.tableNode,
        policyReason,
      };
    if (table.sourceGeometry?.geometry?.treat_as_character === true) {
      const policy = mixedInlineTablePolicy(table, {
        whole: true,
        diagnostics: content.tableGeometryErrors ?? [],
      });
      if (policy.state !== "supported") return policy;
    }
  }
  const body = content.paragraphs.filter((p) => !p.tableCell),
    flows = new Map();
  for (const flow of content.paragraphFlows ?? []) {
    if (!flow.top_level) continue;
    if (
      flow.host !== "body" ||
      flow.section !== setting.section_ordinal ||
      flow.column_break === true ||
      flows.has(flow.paragraph)
    )
      return unavailable("UnsupportedFloatingTableFlow");
    flows.set(flow.paragraph, flow);
  }
  if (
    flows.size !== body.length ||
    body.some((p) => p.section !== setting.section_ordinal || !flows.has(p.paragraph))
  )
    return unavailable("UnsupportedFloatingTableFlow");
  const first = pageSequenceReference(setting, 0);
  if (first.state !== "placed") return unavailable(first.state);
  for (const flow of flows.values()) {
    const declarations = [
      flow.column_start_declaration,
      flow.column_declaration,
      ...(flow.column_changes ?? []).map((change) => change.declaration),
    ].filter((value) => value != null);
    if (!declarations.length && flow.single_column !== true)
      return unavailable("UnsupportedFloatingTableColumns");
    for (const declaration of declarations) {
      const columns = columnReferenceBoxes(first.boxes.page, declaration);
      if (columns.state !== "placed" || columns.boxes.length !== 1)
        return unavailable("UnsupportedFloatingTableColumns");
    }
  }
  for (const owner of owners.values()) {
    owner.host = body.find((p) => p.paragraph === owner.table.hostParagraph);
    if (
      !owner.host ||
      !Number.isSafeInteger(owner.table.anchorUnit) ||
      owner.host.text[owner.table.anchorUnit] !== "\ufffc"
    )
      return unavailable("InvalidFloatingTableAnchor");
  }
  const zeroWidthAnchors = new Map();
  for (const paragraph of body) {
    const tableAnchors = (hosts.get(paragraph.paragraph) ?? []).map(({ table }) => ({
      section: table.section,
      paragraph: table.hostParagraph,
      anchorUnit: table.anchorUnit,
      node: table.tableNode,
    }));
    const pictureAnchors = [...pictures.index.values()]
      .filter(
        ({ picture }) =>
          picture.section === paragraph.section && picture.paragraph === paragraph.paragraph,
      )
      .map(({ picture }) => ({
        section: picture.section,
        paragraph: picture.paragraph,
        anchorUnit: picture.anchorUnit,
        node: picture.pictureNode,
      }));
    const delegated = [...inlineAnchors.index.values()].filter(
      (anchor) => anchor.section === paragraph.section && anchor.paragraph === paragraph.paragraph,
    );
    const root = pictureGroups.hosts.get(paragraph.paragraph);
    const overlays = root
      ? [
          {
            section: paragraph.section,
            paragraph: paragraph.paragraph,
            anchorUnit: 0,
            node: root.root.containerNode,
          },
        ]
      : [];
    const anchors = inlineTableHostAnchors(paragraph, tableAnchors, overlays, [
      ...pictureAnchors,
      ...delegated,
    ]);
    if (anchors.state !== "resolved")
      return {
        ...unavailable(
          anchors.anchorUnit === undefined ? anchors.error : "UnsupportedFloatingTableBodyControl",
        ),
        section: paragraph.section,
        paragraph: paragraph.paragraph,
        ...(anchors.anchorUnit === undefined ? {} : { anchorUnit: anchors.anchorUnit }),
      };
    zeroWidthAnchors.set(paragraph.paragraph, new Set(anchors.zeroWidthUnits));
  }
  let measurementRows = 0;
  for (const owner of owners.values()) {
    if (measurementRows >= maxRows) return unavailable("TableCellMeasurementLimit");
    const hasChildren = content.tables.some(
      (table) =>
        table.section === owner.table.section && table.parentTableNode === owner.table.tableNode,
    );
    const sourceColumns = hasChildren ? null : tableSourceHorizontalLayout(owner.table);
    if (sourceColumns && sourceColumns.state !== "resolved")
      return { ...sourceColumns, section: owner.table.section, tableNode: owner.table.tableNode };
    owner.measured = hasChildren
      ? measureNestedTable(content, owner.table, measure, {
          maxRows: maxRows - measurementRows,
          overflow: "visible",
          measureCellFlow,
          pictureReferences,
        })
      : measureTableCells(owner.table, content.paragraphs, measure, {
          origin: { x: 0, y: 0 },
          padding: "source",
          maxRows: maxRows - measurementRows,
          paragraphFlows: content.paragraphFlows,
          pictures: content.pictures ?? [],
          measureCellFlow,
          pictureReferences,
          ...sourceColumns.gridOptions,
        });
    if (owner.measured.state !== "measured") return owner.measured;
    owner.inline = owner.table.sourceGeometry?.geometry?.treat_as_character === true;
    const raw = owner.table.sourceGeometry?.out_margin;
    if (
      !Array.isArray(raw) ||
      raw.length !== 4 ||
      !raw.every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 0x7fffffff)
    )
      return unavailable("InvalidTableOuterInsets");
    const [left, right, top, bottom] = raw.map(hwpUnitPixels);
    owner.insets = { left, right, top, bottom };
    owner.width = owner.measured.grid.width + left + right;
    owner.height = owner.measured.grid.height + top + bottom;
    measurementRows += owner.measured.rowCount;
  }
  const pages = [],
    rows = [],
    boxes = [],
    repeatedTableHeaderRows = [],
    repeatedTableHeaderBoxes = [],
    flowPictures = [],
    groupReservations = [];
  let current, cursor;
  const placements = [],
    flowAnchors = [];
  const registerPlacement = (owner, placement) => {
    const table = owner.table;
    const contained = nestedTablePaperBounds([
      ...placement.boxes,
      ...(placement.repeatedTableHeaderBoxes ?? []),
    ]);
    if (contained.state !== "contained") return contained;
    const collected = inspectFloatingTablePlacement(
      table,
      placement,
      owner.insets,
      content,
      placements,
      groupReservations,
    );
    if (collected.state !== "collected") return collected;
    for (const [fragmentOrdinal, entry] of collected.footprints.entries()) {
      const footprint = entry.rectangle,
        ordinal = entry.pageOrdinal;
      const own = [...placement.boxes, ...(placement.repeatedTableHeaderBoxes ?? [])].filter(
        (box) => box.tableNode === table.tableNode && box.pageOrdinal === ordinal,
      );
      const x = Math.min(...own.map((box) => box.x)),
        y = Math.min(...own.map((box) => box.y));
      const rectangle = {
        x,
        y,
        width: Math.max(...own.map((box) => box.x + box.width)) - x,
        height: Math.max(...own.map((box) => box.y + box.height)) - y,
      };
      placements.push({
        table,
        rectangle,
        footprint,
        pageOrdinal: ordinal,
        inline: owner.inline,
        fragmentOrdinal,
        fragmentCount: collected.footprints.length,
      });
    }
    rows.push(...placement.rows);
    boxes.push(...placement.boxes);
    flowPictures.push(...(placement.flowPictures ?? []));
    repeatedTableHeaderRows.push(...(placement.repeatedTableHeaderRows ?? []));
    repeatedTableHeaderBoxes.push(...(placement.repeatedTableHeaderBoxes ?? []));
    return { state: "registered" };
  };
  const ensurePage = (ordinal) => {
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= 2000) return false;
    while (pages.length <= ordinal) {
      const ref = pageSequenceReference(setting, pages.length);
      if (ref.state !== "placed") return false;
      pages.push({
        ordinal: pages.length,
        section: setting.section_ordinal,
        ...ref.boxes,
        columns: [ref.boxes.page],
      });
    }
    return true;
  };
  const nextPage = () => {
    const ordinal = current ? current.ordinal + 1 : 0;
    if (!ensurePage(ordinal)) return false;
    current = pages[ordinal];
    cursor = current.page.y;
    return true;
  };
  if (!nextPage()) return unavailable("PageFlowLimit");
  const space = (amount) => {
    if (amount > current.page.height) return false;
    if (cursor + amount > current.page.y + current.page.height && !nextPage()) return false;
    cursor += amount;
    return Number.isFinite(cursor);
  };
  const advanceTableAnchor = () => {
    for (let attempt = 0; attempt <= placements.length + 2000; attempt++) {
      const next = floatingTableAnchorCursor(placements, current, cursor);
      if (!Number.isFinite(next) || next < cursor) return false;
      if (next === cursor) return true;
      if (next >= current.page.y + current.page.height) {
        if (!nextPage()) return false;
      } else cursor = next;
    }
    return false;
  };
  for (const paragraph of body) {
    const group = hosts.get(paragraph.paragraph) ?? [],
      owner = group.find((owner) => !owner.inline),
      table = owner?.table;
    if (flows.get(paragraph.paragraph).page_break === true && rows.length && !nextPage())
      return unavailable("PageFlowLimit");
    if (!space(paragraphSpacePixels(paragraph.paragraphShape?.before)))
      return unavailable("UnsupportedPageSpacing");
    const pictureGroup = pictureGroups.hosts.get(paragraph.paragraph);
    if (pictureGroup) {
      if (!advanceTableAnchor()) return unavailable("FloatingTableCursorLimit");
      if (rows.length + flowAnchors.length + repeatedTableHeaderRows.length >= maxRows)
        return unavailable("TablePageProjectionLimit");
      let placed;
      for (;;) {
        placed = placeFloatingTablePictureGroup(
          pictureGroup,
          current,
          cursor,
          measure,
          placements,
          groupReservations,
        );
        if (placed.state !== "next-page") break;
        if (!nextPage()) return unavailable("PageFlowLimit");
      }
      if (placed.state !== "placed")
        return { ...placed, section: paragraph.section, rootNode: pictureGroup.root.containerNode };
      rows.push(placed.row);
      groupReservations.push(placed.reservation);
      cursor = placed.bottom;
      if (!space(paragraphSpacePixels(paragraph.paragraphShape?.after)))
        return unavailable("UnsupportedPageSpacing");
      continue;
    }
    if (owner && !owner.inline) {
      if (!advanceTableAnchor()) return unavailable("FloatingTableCursorLimit");
      const planned = planFloatingTablePlacement(
        table,
        owner.measured,
        setting,
        paragraph,
        owner.insets,
        content,
        placements,
        groupReservations,
        { pageOrdinal: current.ordinal, anchorY: cursor, maxRows: maxRows - rows.length },
      );
      if (planned.state !== "planned") return planned;
      const placement = planned.placement;
      if (!ensurePage(placement.pages?.at(-1).ordinal ?? planned.pageOrdinal))
        return unavailable("PageFlowLimit");
      current = pages[planned.pageOrdinal];
      cursor = planned.anchorY;
      const registered = registerPlacement(owner, placement);
      if (registered.state !== "registered") return registered;
      if (tableHostProfile(paragraph, table)?.tableOnly === true) {
        if (rows.length + flowAnchors.length >= maxRows)
          return unavailable("TablePageProjectionLimit");
        flowAnchors.push({
          kind: "anchor",
          height: 0,
          section: table.section,
          tableNode: table.tableNode,
          paragraph: paragraph.paragraph,
          anchorUnit: table.anchorUnit,
          pageOrdinal: current.ordinal,
          columnOrdinal: 0,
          x: current.page.x,
          y: cursor,
        });
        if (!space(paragraphSpacePixels(paragraph.paragraphShape?.after)))
          return unavailable("UnsupportedPageSpacing");
        continue;
      }
    }
    let unit = 0,
      empty = paragraph.text.length === 0;
    while (unit < paragraph.text.length || empty) {
      if (rows.length + flowAnchors.length >= maxRows)
        return unavailable("TablePageProjectionLimit");
      const exclusions = floatingTableBodyExclusions(placements, current);
      const geometry = paragraphLineGeometry(
        { ...paragraph.paragraphShape, alignment: 0 },
        current.page.width,
        0,
        unit === 0,
      );
      const line = floatingInlineTableLine(
        { x: current.page.x + geometry.x, y: cursor, width: geometry.width, height: 28 },
        group,
        paragraph,
        unit,
        zeroWidthAnchors.get(paragraph.paragraph),
        { column: current.page, paper: current.paper },
      );
      const result = tableFlowLine(paragraph, unit, line, exclusions, (text, p, position, kind) => {
        const value = measure(text, p, position, kind);
        const item = group.find((item) => position === item.table.anchorUnit);
        if (!item) return value;
        if (item.inline) {
          const glyph = textMeasurement(measure("", p, position, kind));
          return { width: item.width, height: item.height, spacingBasisHeight: glyph.height };
        }
        return typeof value === "number" ? 0 : { ...value, width: 0 };
      });
      if (result.state !== "available") return unavailable(result.state);
      if (
        owner &&
        !owner.inline &&
        unit === 0 &&
        result.endUnit > unit &&
        result.endUnit <= table.anchorUnit
      )
        return unavailable("UnsupportedMultiLineFloatingTableAnchor");
      if (result.height > current.page.height) return unavailable("UnsupportedPageRow");
      if (cursor + result.height > current.page.y + current.page.height) {
        if (!nextPage()) return unavailable("PageFlowLimit");
        continue;
      }
      if ((!empty && result.endUnit === unit) || (empty && !result.regions.length)) {
        if (!Number.isFinite(result.nextY) || result.nextY <= cursor)
          return {
            ...unavailable("NoFittingTableTextRegion"),
            section: paragraph.section,
            paragraph: paragraph.paragraph,
            tableNode: table?.tableNode,
            startUnit: unit,
            availableWidth: geometry.width,
            regionWidths: result.regions.map((region) => region.width),
            inlineTableMetrics: group
              .filter((item) => item.inline)
              .map((item) => ({
                tableNode: item.table.tableNode,
                anchorUnit: item.table.anchorUnit,
                width: item.width,
                height: item.height,
              })),
          };
        if (result.nextY + result.height > current.page.y + current.page.height) {
          if (!nextPage()) return unavailable("PageFlowLimit");
        } else cursor = result.nextY;
        continue;
      }
      const fragments = result.fragments.length
        ? result.fragments
        : empty && result.regions.length
          ? [
              {
                ...result.regions[0],
                text: "",
                startUnit: unit,
                endUnit: unit,
                boundaries: [{ unit, x: 0 }],
                textHeight: 20,
              },
            ]
          : [];
      for (const fragment of fragments) {
        if (rows.length + flowAnchors.length >= maxRows)
          return unavailable("TablePageProjectionLimit");
        const alignment = paragraphLineGeometry(
          { alignment: paragraph.paragraphShape?.alignment },
          fragment.width,
          fragment.boundaries.at(-1).x,
          false,
        );
        const row = alignTextRow(
          {
            ...fragment,
            x: fragment.x + alignment.x,
            width: fragment.width - alignment.x,
            kind: "text",
            y: cursor,
            height: result.height,
            section: paragraph.section,
            paragraph: paragraph.paragraph,
            editable: paragraph.editable,
            selectable: paragraph.editable || paragraph.selectable,
            paragraphShape: paragraph.paragraphShape,
            pageOrdinal: current.ordinal,
            columnOrdinal: 0,
            referenceBoxes: { paper: current.paper, page: current.page, column: current.page },
            ...(group.length
              ? {
                  inlineTables: group.map((item) => ({
                    unit: item.table.anchorUnit,
                    tableNode: item.table.tableNode,
                  })),
                }
              : {}),
          },
          { lastLine: result.complete || result.hardBreak },
        );
        for (const owner of group.filter(
          (item) =>
            item.inline &&
            fragment.startUnit <= item.table.anchorUnit &&
            item.table.anchorUnit < fragment.endUnit,
        )) {
          const table = owner.table;
          const boundary = row.boundaries.find((boundary) => boundary.unit === table.anchorUnit);
          if (!boundary) return unavailable("MissingInlineTableBoundary");
          const rectangle = {
            x: row.x + boundary.x,
            y: cursor,
            width: owner.width,
            height: owner.height,
          };
          const projected = layoutInlineTablePageContent(
            table,
            owner.measured,
            {
              objectNode: table.tableNode,
              section: table.section,
              paragraph: table.hostParagraph,
              unit: table.anchorUnit,
              pageOrdinal: current.ordinal,
              columnOrdinal: 0,
              rectangle,
              referenceBoxes: row.referenceBoxes,
            },
            owner.insets,
            { maxRows: maxRows - rows.length - 1 },
          );
          if (projected.state !== "placed") return projected;
          const registered = registerPlacement(owner, { ...projected, rectangle });
          if (registered.state !== "registered") return registered;
        }
        rows.push(row);
      }
      unit = result.endUnit;
      empty = result.hardBreak === true && unit === paragraph.text.length;
      cursor += result.height;
    }
    if (!space(paragraphSpacePixels(paragraph.paragraphShape?.after)))
      return unavailable("UnsupportedPageSpacing");
  }
  const placedTables = new Map(
    placements.map((placement) => [placement.table.tableNode, placement.table]),
  );
  for (const picture of pictures.floating)
    if (
      flowPictures.filter(
        (row) => row.section === picture.section && row.pictureNode === picture.pictureNode,
      ).length !== 1
    )
      return {
        ...unavailable("MissingFloatingTableCellPicturePlacement"),
        section: picture.section,
        pictureNode: picture.pictureNode,
      };
  if (rows.length + flowAnchors.length + repeatedTableHeaderRows.length > maxRows)
    return unavailable("TablePageProjectionLimit");
  if (placedTables.size !== owners.size) return unavailable("MissingFloatingTablePlacement");
  let result = {
    state: "paginated",
    rows: rows.toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || a.y - b.y || a.x - b.x),
    boxes,
    pages,
    height: pages.at(-1).paper.y + pages.at(-1).paper.height,
    spatialRows: true,
    limited: false,
    pageLayoutMode: "measured-body",
    ...(flowAnchors.length ? { flowAnchors } : {}),
    ...(flowPictures.length ? { flowPictures } : {}),
    ...(groupReservations.length ? { groupReservations } : {}),
    ...(repeatedTableHeaderRows.length
      ? { repeatedTableHeaderRows, repeatedTableHeaderBoxes }
      : {}),
    tableAnchors: [...placedTables.values()].map((table) => ({
      section: table.section,
      tableNode: table.tableNode,
      hostParagraph: table.hostParagraph,
      anchorUnit: table.anchorUnit,
    })),
  };
  if (completeLayout) {
    const completed = completeLayout({ ...result, state: "placed" });
    if (completed?.state === "unavailable") return completed;
    if (
      completed?.state !== "placed" ||
      !Array.isArray(completed.rows) ||
      !Array.isArray(completed.boxes)
    )
      return unavailable("InvalidTableLayoutCompletion");
    if (
      completed.rows.length +
        flowAnchors.length +
        (completed.repeatedTableHeaderRows?.length ?? 0) >
      maxRows
    )
      return unavailable("TablePageProjectionLimit");
    const contained = nestedTablePaperBounds(completed.boxes);
    if (contained.state !== "contained") return contained;
    result = { ...completed, state: "paginated" };
  }
  return result;
}

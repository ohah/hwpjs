import { layoutInlineGroupBody } from "./inline-group-body-layout.mjs";
import {
  measureCreatedBodyFlow,
  projectCreatedBodyFlow,
} from "./created-body-flow-measurement.mjs";
import { pageReferenceBoxes } from "./page-reference-boxes.mjs";
import { inlineGroupObject } from "./inline-group-object.mjs";
import { measureSourceInlineTables } from "./source-table-inline-measurement.mjs";
import { sourceInlineTablePaperBounds } from "./source-inline-table-paper-bounds.mjs";
import { inlineGroupPictureObjects } from "./inline-group-picture-objects.mjs";
import { floatingPolygonAnchorUnits } from "./floating-polygon-anchor-units.mjs";

// Pending cells keep their native identities; source groups retain their own flow.
export function layoutCreatedGroupBody(content, measure, maxRows) {
  const fail = (error) => ({ state: "unavailable", error });
  if (content.pageSettings?.length !== 1) return fail("UnsupportedCreatedGroupScope");
  const source = measureSourceInlineTables(content, measure, maxRows);
  if (source.state !== "measured") return source;
  const keys = new Set(
    content.createdTables.map((table) => `${table.section}:${table.hostParagraph}`),
  );
  for (const key of source.hosts.keys()) keys.add(key);
  const roots = (content.containers ?? []).filter((root) => root.source?.group_context === null);
  const objects = new Map();
  const selectedPictures = inlineGroupPictureObjects(
    content,
    content.pageSettings[0].section_ordinal,
    { sourceTables: source },
  );
  if (selectedPictures.state !== "measured") return selectedPictures;
  const pictures = new Map(),
    zeroWidthAnchors = new Map();
  for (const { picture, object } of selectedPictures.byNode.values()) {
    const key = `${picture.section}:${picture.paragraph}`,
      entries = pictures.get(key) ?? [];
    entries.push({
      pictureNode: object.objectNode,
      unit: object.unit,
      width: object.width,
      height: object.height,
    });
    pictures.set(key, entries);
    keys.add(key);
  }
  for (const root of roots) {
    const object = inlineGroupObject(root, content.pageSettings[0].section_ordinal, {
      paragraphs: content.paragraphs,
      measure,
      maxRows,
    });
    if (object.state !== "measured") return object;
    const key = `${root.section}:${root.hostParagraph}`,
      entries = objects.get(key) ?? [];
    entries.push(object);
    objects.set(key, entries);
    keys.add(key);
  }
  const paragraphs = content.paragraphs.filter((p) => keys.has(`${p.section}:${p.paragraph}`));
  try {
    for (const paragraph of paragraphs) {
      const key = `${paragraph.section}:${paragraph.paragraph}`;
      zeroWidthAnchors.set(key, [
        ...floatingPolygonAnchorUnits(content, paragraph),
        ...(selectedPictures.zeroWidthAnchors.get(key) ?? []),
      ]);
    }
  } catch (error) {
    return fail(error.message);
  }
  if (paragraphs.some((p) => p.tableCell || p.drawingText || p.drawingCaption))
    return fail("UnsupportedCreatedGroupScope");
  const references = pageReferenceBoxes(content.pageSettings[0], { x: 20, y: 20 });
  if (references.state !== "placed") return references;
  const width = references.boxes.page.width;
  const prepared = measureCreatedBodyFlow(
    { ...content, paragraphs, tables: [] },
    width,
    measure,
    maxRows,
    { ...source, objects, pictures, zeroWidthAnchors },
  );
  if (prepared.state !== "measured") return prepared;
  const rowsByHost = new Map();
  for (const row of prepared.rows) {
    const key = `${row.section}:${row.paragraph}`,
      rows = rowsByHost.get(key) ?? [];
    rows.push(row);
    rowsByHost.set(key, rows);
  }
  return layoutInlineGroupBody({ ...content, createdTables: [] }, measure, maxRows, {
    preparedSourceTables: source,
    measureBodyParagraph(paragraph, availableWidth) {
      const rows = rowsByHost.get(`${paragraph.section}:${paragraph.paragraph}`);
      if (!rows) return null;
      if (availableWidth !== width) return fail("UnsupportedCreatedGroupColumns");
      return { state: "measured", rows, limited: false };
    },
    completeBody(page) {
      const projected = projectCreatedBodyFlow(prepared, page.rows, maxRows);
      if (projected.state !== "projected") return projected;
      const completed = { ...page, ...projected, state: "paginated", createdTablesPaginated: true };
      const bounds = sourceInlineTablePaperBounds(source.tables, completed, content);
      return bounds.state === "contained" ? completed : bounds;
    },
  });
}

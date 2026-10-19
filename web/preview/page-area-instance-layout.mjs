import { selectPageAreaInstances } from "./page-area-instance-selection.mjs";
import { layoutPageAreas } from "./page-area-flow.mjs";
import { measurePageAreaTables } from "./page-area-table-measurement.mjs";
import { projectPageAreaTables } from "./page-area-table-projection.mjs";
import { projectPageAreaDrawings } from "./page-area-drawing-projection.mjs";
import { layoutPageAreaInlinePictures } from "./page-area-inline-picture-layout.mjs";

/** Assemble complete explicit page instances; failed groups publish no partial rows. */
export function layoutPageAreaInstances(content, partition, pages, measure, maxRows) {
  const fail = error => ({ state: "unavailable", error });
  if (partition?.state !== "partitioned" || !Array.isArray(pages) || !Number.isSafeInteger(maxRows) || maxRows < 1) return fail("InvalidPageAreaBounds");
  const rows = [], boxes = [], placedDrawings = [], flowPictures = [], tableAnchors = [], overflow = [];
  const instances = new Set();
  for (const page of pages) {
    if (!Number.isSafeInteger(page.section) || page.section < 0) return fail("UnsupportedPageAreaSections");
    if (!Number.isSafeInteger(page.ordinal) || page.ordinal < 0 || instances.has(`${page.section}:${page.ordinal}`)) return fail("AmbiguousPageAreaInstance");
    instances.add(`${page.section}:${page.ordinal}`);
    const selected = selectPageAreaInstances(partition.areas.filter(area => area.section === page.section), page);
    if (selected.state !== "selected") return selected;
    for (const area of selected.areas) {
      const remaining = maxRows - rows.length;
      if (remaining < 1) return fail("PageAreaOverflow");
      const objects = ["tables", "drawings", "pictures", "lines", "containers"].some(property => area[property].length);
      if (!objects) {
        const repeated = layoutPageAreas(area, [page], measure, remaining);
        if (repeated.state !== "placed") return repeated;
        rows.push(...repeated.rows); overflow.push(...repeated.overflow);
        continue;
      }
      if (!area.tables.length && area.pictures.length) {
        const repeated = layoutPageAreaInlinePictures(area, page, measure, remaining);
        if (repeated.state !== "placed") return repeated;
        rows.push(...repeated.rows); overflow.push(...repeated.overflow);
        continue;
      }
      if (!area.tables.length || area.lines.length || area.containers.length) return fail("UnsupportedPageAreaObjects");
      const measured = measurePageAreaTables(area, measure, remaining);
      if (measured.state !== "tables-measured") return measured;
      const tables = projectPageAreaTables(area, measured, page, measure, remaining);
      if (tables.state !== "tables-projected") return tables;
      const scene = projectPageAreaDrawings(content, area, tables, page, measure, remaining);
      if (scene.state !== "objects-projected") return scene;
      rows.push(...scene.rows); boxes.push(...scene.boxes); placedDrawings.push(...scene.placedDrawings);
      flowPictures.push(...scene.flowPictures); tableAnchors.push(...scene.tableAnchors); overflow.push(...scene.overflow);
    }
  }
  return { state: "placed", rows, boxes, placedDrawings, flowPictures, tableAnchors, overflow };
}

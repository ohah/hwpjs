import { moveLayoutRow, moveLayoutPlacement } from "./layout-world-offset.mjs";
import { affineBox } from "./affine-point-geometry.mjs";
import { rowLeft } from "./row-geometry.mjs";
import { projectNoteFlowPictures } from "./note-picture-projection.mjs";
import { moveCurvePlacement } from "./curve-world-offset.mjs";

/** Split an already proven layout into local, indivisible page scenes. */
export function notePageScenes(
  layout,
  rectangleLayers,
  pictureLayers,
  width,
  { nonPaintingBoxes = new Set() } = {},
) {
  const fail = (error) => ({ state: "unavailable", error });
  if (
    layout?.state !== "paginated" ||
    layout.limited ||
    !layout.pages?.length ||
    !Number.isFinite(width) ||
    width <= 0 ||
    ["rows", "boxes", "placedDrawings", "placedContainers"].some(
      (key) => !Array.isArray(layout[key]),
    )
  )
    return fail("InvalidGroupedNoteGeometry");
  if (layout.placedCurves !== undefined && !Array.isArray(layout.placedCurves))
    return fail("InvalidGroupedNoteGeometry");
  const curves = layout.placedCurves ?? [];
  const knownBoxes = new Set(layout.boxes);
  if (
    !(nonPaintingBoxes instanceof Set) ||
    [...nonPaintingBoxes].some((box) => !knownBoxes.has(box))
  )
    return fail("InvalidGroupedNoteGeometry");
  const painted = [
    ...layout.boxes.filter((box) => !nonPaintingBoxes.has(box)),
    ...layout.placedDrawings.map((d) => d.rectangle),
    ...layout.placedContainers.map((c) => c.outerRectangle),
    ...curves.map((c) => c.bounds),
    ...curves.filter((c) => c.textRectangle).map((c) => c.textRectangle),
    ...rectangleLayers.front.map((d) => d.rectangle),
    ...rectangleLayers.behind.map((d) => d.rectangle),
    ...pictureLayers.front.map((p) => p.visualBounds),
    ...pictureLayers.behind.map((p) => p.visualBounds),
  ];
  const paintedPages = new Map(layout.pages.map((p) => [p.ordinal, []]));
  for (const box of painted) {
    if (
      !box ||
      ![box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(
        Number.isFinite,
      )
    )
      return fail("InvalidGroupedNoteGeometry");
    const owners = layout.pages.filter(
      ({ page }) =>
        box.x >= page.x - 1e-8 &&
        box.y >= page.y - 1e-8 &&
        box.x + box.width <= page.x + width + 1e-8 &&
        box.y + box.height <= page.y + page.height + 1e-8,
    );
    if (owners.length !== 1) return fail("GroupedNoteSceneBoundsOverflow");
    paintedPages.get(owners[0].ordinal).push(box);
  }
  const scenePages = [];
  for (const [index, page] of layout.pages.entries()) {
    if (
      page.ordinal !== index ||
      !Number.isFinite(page.page.width) ||
      Math.abs(page.page.width - width) > 1e-8
    )
      return fail("InvalidGroupedNoteGeometry");
    const origin = page.page;
    const sourceRows = layout.rows.filter((r) => r.pageOrdinal === page.ordinal);
    if (!sourceRows.length) return fail("InvalidGroupedNoteGeometry");
    const rows = sourceRows.map((r) => moveLayoutRow(r, -origin.y, 0, -origin.x));
    const bounds = rows.map((r) =>
      r.transform
        ? affineBox(r.transform, { x: rowLeft(r), y: r.y, width: r.width, height: r.height })
        : { y: r.y, height: r.height },
    );
    if (bounds.some((b) => !b || !Number.isFinite(b.y + b.height) || b.y < -1e-8))
      return fail("InvalidGroupedNoteGeometry");
    const height = Math.max(
      ...bounds.map((b) => b.y + b.height),
      ...paintedPages.get(page.ordinal).map((b) => b.y + b.height - origin.y),
    );
    if (!Number.isFinite(height) || height <= 0 || height > origin.height + 1e-8)
      return fail("InvalidGroupedNoteGeometry");
    const local = (list) =>
      list
        .filter((item) => item.pageOrdinal === page.ordinal)
        .map((item) => moveLayoutPlacement(item, -origin.y, 0, -origin.x));
    const pictures = projectNoteFlowPictures(
      (layout.flowPictures ?? []).filter((p) => p.pageOrdinal === page.ordinal),
      -origin.x,
      -origin.y,
      { pageOrdinal: page.ordinal, columnOrdinal: 0 },
    );
    if (pictures.state !== "projected") return pictures;
    if (
      pictures.pictures.some(
        (p) =>
          p.rectangle.x < 0 ||
          p.rectangle.y < 0 ||
          p.rectangle.x + p.rectangle.width > width + 1e-8 ||
          p.rectangle.y + p.rectangle.height > height + 1e-8,
      )
    )
      return fail("GroupedNoteSceneBoundsOverflow");
    let placedCurves;
    try {
      placedCurves = curves
        .filter((c) => c.pageOrdinal === page.ordinal)
        .map((c) => moveCurvePlacement(c, -origin.y, 0, -origin.x));
    } catch {
      return fail("InvalidGroupedNoteGeometry");
    }
    scenePages.push({
      width,
      height,
      rows,
      boxes: local(layout.boxes),
      numberPrefixes: [],
      placedCurves,
      placedDrawings: local(layout.placedDrawings),
      placedContainers: local(layout.placedContainers),
      flowPictures: pictures.pictures,
    });
  }
  for (const key of [
    "rows",
    "boxes",
    "placedDrawings",
    "placedContainers",
    "placedCurves",
    "flowPictures",
  ]) {
    if (scenePages.reduce((sum, p) => sum + p[key].length, 0) !== (layout[key]?.length ?? 0))
      return fail("AmbiguousGroupedNotePageOwner");
  }
  return {
    state: "measured",
    scenePages,
    height: scenePages.reduce((sum, p) => sum + p.height, 0),
    warnings: layout.warnings ?? [],
    ...Object.fromEntries(
      ["rows", "boxes", "placedDrawings", "placedContainers", "placedCurves", "flowPictures"].map(
        (key) => [key, scenePages.flatMap((p) => p[key])],
      ),
    ),
  };
}

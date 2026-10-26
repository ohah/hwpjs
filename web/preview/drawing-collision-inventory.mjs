import { objectCollisionBox } from "./object-collision-box.mjs";
import { previewLineLayers } from "./line-layers.mjs";
import { lineCollisionFootprint } from "./line-collision-footprint.mjs";
import { inlinePictureIndex, picturePositionKey } from "./picture-inline.mjs";
import { inlinePictureRowPlacement } from "./inline-picture-row-placement.mjs";
import { inlineGroupCollisionFootprints } from "./inline-group-collision-footprints.mjs";
import { combineDrawingPictureFootprints } from "./drawing-owned-picture-footprints.mjs";
const key = (section, node) => `${section}:${node}`;
const validBox = (b) =>
  b &&
  [b.x, b.y, b.width, b.height, b.x + b.width, b.y + b.height].every(Number.isFinite) &&
  b.width > 0 &&
  b.height > 0;

/** Complete nominal layout footprints; missing geometry is never empty space. */
export function drawingCollisionInventory(content, layout) {
  const fail = (error) => ({ state: "unavailable", error });
  if (
    !content ||
    layout?.state !== "paginated" ||
    !Array.isArray(layout.pages) ||
    !layout.pages.length ||
    layout.pages.some(
      (p, i) => !p || p.ordinal !== i || !Number.isSafeInteger(p.section) || p.section < 0,
    )
  )
    return fail("IncompleteDrawingCollisionLayout");
  const groups = inlineGroupCollisionFootprints(content, layout);
  if (groups.state !== "collected") return groups;
  if (
    (content.hwp5Drawings ?? []).some(
      (r) =>
        !groups.covered.has(key(r.section, r.componentNode)) &&
        ![0x24726563, 0x24706963, 0x246c696e].includes(r.source?.kind_id),
    )
  )
    return fail("UnsupportedDrawingCollisionObjects");
  if (layout.tableCollisionFootprintErrors?.length) {
    const first = layout.tableCollisionFootprintErrors[0];
    return {
      ...fail("IncompleteTableCollisionInventory"),
      sourceError: first?.error,
      section: first?.section,
      tableNode: first?.tableNode,
    };
  }
  if (content.lineErrors?.length) return fail("IncompleteLineCollisionInventory");
  const footprints = [...groups.footprints],
    expected = new Set(groups.covered);
  const localPictureBindings = [];
  let inlinePictures;
  let diagnostic;
  const add = (section, node, placed, margins, kind) => {
    if (
      !Number.isSafeInteger(section) ||
      section < 0 ||
      !Number.isSafeInteger(node) ||
      node < 0 ||
      expected.has(key(section, node))
    )
      throw new Error("AmbiguousDrawingCollisionIdentity");
    if (
      !placed ||
      !Number.isSafeInteger(placed.pageOrdinal) ||
      !layout.pages.some((p) => p.ordinal === placed.pageOrdinal && p.section === section) ||
      !validBox(placed.rectangle) ||
      !Array.isArray(margins) ||
      margins.length !== 4 ||
      !margins.every((v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff)
    )
      throw new Error("IncompleteDrawingCollisionGeometry");
    expected.add(key(section, node));
    const rectangle = objectCollisionBox(placed.rectangle, margins);
    if (!validBox(rectangle)) throw new Error("InvalidDrawingCollisionBounds");
    footprints.push({ section, pageOrdinal: placed.pageOrdinal, node, kind, rectangle });
  };
  try {
    inlinePictures = inlinePictureIndex(content);
    if (content.lines?.length) {
      for (const line of content.lines) {
        const anchors = (layout.rows ?? []).filter(
          (row) =>
            row.kind === "text" &&
            row.section === line.section &&
            row.paragraph === line.paragraph &&
            row.startUnit <= line.anchorUnit &&
            line.anchorUnit < row.endUnit,
        );
        if (anchors.length !== 1) throw new Error("IncompleteLineCollisionInventory");
      }
      const layers = previewLineLayers(content, layout, layout.width);
      const placed = [...layers.front, ...layers.behind];
      if (layers.unavailable.length || placed.length !== content.lines.length)
        throw new Error("IncompleteLineCollisionInventory");
      for (const item of placed) {
        const footprint = lineCollisionFootprint(item.line, item);
        const node = item.line.anchorNode;
        if (Array.isArray(content.hwp5Drawings)) {
          const roots = content.hwp5Drawings.filter(
            (root) =>
              root.section === item.line.section &&
              root.componentNode === node &&
              root.source?.kind_id === 0x246c696e,
          );
          if (roots.length !== 1) throw new Error("IncompleteLineCollisionInventory");
        }
        if (
          !footprint ||
          !Number.isSafeInteger(node) ||
          node < 0 ||
          expected.has(key(footprint.section, node)) ||
          !layout.pages.some(
            (page) => page.ordinal === footprint.pageOrdinal && page.section === footprint.section,
          )
        )
          throw new Error("IncompleteLineCollisionInventory");
        expected.add(key(footprint.section, node));
        footprints.push(footprint);
      }
    }
    for (const drawing of content.drawings ?? []) {
      diagnostic = {
        section: drawing.section,
        drawingNode: drawing.drawingNode,
        collisionStage: "drawing",
      };
      if (groups.covered.has(key(drawing.section, drawing.drawingNode))) {
        if (!groups.drawingIds.has(key(drawing.section, drawing.drawingNode)))
          throw Error("AmbiguousDrawingCollisionIdentity");
        continue;
      }
      if (drawing.source?.group_context !== null || drawing.source?.caption)
        throw new Error("UnsupportedDrawingCollisionOwnership");
      const placements = (layout.placedDrawings ?? []).filter(
        (p) => p.section === drawing.section && p.drawingNode === drawing.drawingNode,
      );
      if (placements.length !== 1) throw new Error("IncompleteDrawingCollisionGeometry");
      add(
        drawing.section,
        drawing.drawingNode,
        placements[0],
        drawing.source.flow?.outside_margins,
        "drawing",
      );
    }
    for (const picture of content.pictures ?? []) {
      diagnostic = {
        section: picture.section,
        pictureNode: picture.pictureNode,
        collisionStage: "picture",
      };
      if (groups.covered.has(key(picture.section, picture.pictureNode))) {
        if (!groups.pictureIds.has(key(picture.section, picture.pictureNode)))
          throw Error("AmbiguousDrawingCollisionIdentity");
        continue;
      }
      if (!picture.owner || picture.owner.anchorNode !== picture.pictureNode || picture.caption)
        throw new Error("UnsupportedDrawingCollisionOwnership");
      let placements = (layout.flowPictures ?? []).filter(
        (p) => p.section === picture.section && p.pictureNode === picture.pictureNode,
      );
      if (!placements.length && picture.geometry?.treatAsCharacter === true) {
        const item = inlinePictures.get(
          picturePositionKey(picture.section, picture.paragraph, picture.anchorUnit),
        );
        const hosts = (layout.rows ?? [])
          .map((row, index) => ({ row, index }))
          .filter(
            ({ row }) =>
              row.kind === "text" &&
              row.section === picture.section &&
              row.paragraph === picture.paragraph &&
              row.startUnit <= picture.anchorUnit &&
              picture.anchorUnit < row.endUnit,
          );
        if (!item || hosts.length !== 1) throw new Error("IncompleteDrawingCollisionGeometry");
        const placed = inlinePictureRowPlacement(item, hosts[0].row, hosts[0].index);
        if (placed.state !== "placed") throw new Error(placed.error);
        placements = [placed];
      }
      if (placements.length !== 1) throw new Error("IncompleteDrawingCollisionGeometry");
      add(
        picture.section,
        picture.pictureNode,
        placements[0],
        picture.flow?.outsideMargins,
        "picture",
      );
      const owners = (content.paragraphs ?? []).filter(
        (p) => p.section === picture.section && p.paragraph === picture.paragraph,
      );
      if (owners.some((p) => p.drawingText)) {
        const owner = owners[0]?.drawingText;
        const drawings = (content.drawings ?? []).filter(
          (d) => d.section === picture.section && d.drawingNode === owner?.drawingNode,
        );
        if (
          owners.length !== 1 ||
          drawings.length !== 1 ||
          drawings[0].source?.group_context !== null ||
          drawings[0].source.text?.list_node !== owner.listNode ||
          picture.geometry?.treatAsCharacter !== true
        )
          throw Error("AmbiguousDrawingPictureFootprint");
        localPictureBindings.push({
          section: picture.section,
          pictureNode: picture.pictureNode,
          drawingNode: owner.drawingNode,
        });
      }
    }
    diagnostic = undefined;
    for (const root of content.hwp5Drawings ?? [])
      if (!expected.has(key(root.section, root.componentNode)))
        throw new Error("IncompleteDrawingCollisionGeometry");
    for (const placed of layout.placedDrawings ?? [])
      if (
        !(content.drawings ?? []).some(
          (d) => d.section === placed.section && d.drawingNode === placed.drawingNode,
        )
      )
        throw new Error("IncompleteDrawingCollisionGeometry");
    for (const placed of layout.flowPictures ?? [])
      if (
        !(content.pictures ?? []).some(
          (p) => p.section === placed.section && p.pictureNode === placed.pictureNode,
        )
      )
        throw new Error("IncompleteDrawingCollisionGeometry");
    for (const placed of layout.tableCollisionFootprints ?? [])
      if (
        !(content.tables ?? []).some(
          (t) => t.section === placed.section && t.tableNode === placed.tableNode,
        )
      ) {
        diagnostic = {
          section: placed.section,
          tableNode: placed.tableNode,
          collisionStage: "orphan-table-footprint",
        };
        throw new Error("IncompleteTableCollisionInventory");
      }
    for (const table of (content.tables ?? []).filter((t) => t.parentTableNode == null)) {
      diagnostic = { section: table.section, tableNode: table.tableNode, collisionStage: "table" };
      const selected = (layout.tableCollisionFootprints ?? []).filter(
        (p) => p.section === table.section && p.tableNode === table.tableNode,
      );
      if (!selected.length) throw new Error("IncompleteTableCollisionInventory");
      for (const placed of selected) {
        if (
          !validBox(placed.rectangle) ||
          !layout.pages.some(
            (p) => p.ordinal === placed.pageOrdinal && p.section === placed.section,
          )
        )
          throw new Error("IncompleteTableCollisionInventory");
        footprints.push({
          ...placed,
          kind: "table",
          node: table.tableNode,
          rectangle: { ...placed.rectangle },
        });
      }
    }
    return combineDrawingPictureFootprints(footprints, localPictureBindings);
  } catch (error) {
    return { ...fail(error.message), ...diagnostic };
  }
}

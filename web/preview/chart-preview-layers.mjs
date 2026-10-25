import { chartPreviewPrimitives } from "./chart-preview-primitives.mjs";
import { placeFloatingPicture } from "./picture-placement.mjs";
import { projectFloatingPicturePage } from "./picture-page-projection.mjs";
import { rowLeft, rowTop, rowHeight, TEXT_LEFT } from "./row-geometry.mjs";
import { inlineChartIndex } from "./chart-inline.mjs";
import { picturePositionKey } from "./picture-inline.mjs";
import { inlinePictureRowPlacement } from "./inline-picture-row-placement.mjs";

/** Explicit preview overlay. Does not claim source wrapping or z-order. */
export function previewChartLayers(content, layout, columnWidth, read) {
  const output = { items: [], unavailable: [], pending: 0, total: 0, height: layout.height, exact: false, mode: "preview-overlay" };
  if (content.chartDisplayAvailable !== true) return output;
  const inline = inlineChartIndex(content, read);
  for (const target of content.chartTargets ?? []) {
    output.total++;
    const refuse = reason => output.unavailable.push({ section: target.section, wrapper: target.wrapper, reason });
    if (target.error_name) { refuse(target.error_name); continue; }
    const resource = read(target.section, target.wrapper);
    if (!resource) { output.pending++; continue; }
    if (resource.error) { refuse(resource.error); continue; }
    if (!resource.value) { output.pending++; continue; }
    const value = resource.value;
    const primitives = chartPreviewPrimitives(value);
    if (primitives.state !== "ready") { refuse(primitives.reason); continue; }
    const owners = content.paragraphs.filter(p => p.section === target.section && p.paragraph === target.paragraph);
    if (owners.length !== 1 || owners[0].clipped || owners[0].tableCell || owners[0].text?.[target.anchorUnit] !== "\ufffc") { refuse("UnsupportedChartPreviewOwner"); continue; }
    const g = value.host.geometry;
    const picture = { ...target, state: "located", geometry: {
      width: g.width, height: g.height, widthRelative: g.width_relative, heightRelative: g.height_relative,
      treatAsCharacter: g.treat_as_character, horizontalOffset: g.horizontal_offset, verticalOffset: g.vertical_offset,
    }, position: value.host.position };
    let placement;
    if (layout.chartWrapReservations) {
      const reserved = layout.chartWrapReservations.filter(r => r.section === target.section && r.wrapper === target.wrapper
        && r.paragraph === target.paragraph && r.anchorUnit === target.anchorUnit && r.paintable === true);
      if (reserved.length !== 1) { refuse("MissingChartPageReservation"); continue; }
      placement = { state: "placed", rectangle: reserved[0].rectangle };
    } else if (g.treat_as_character === true) {
      const key = picturePositionKey(target.section, target.paragraph, target.anchorUnit);
      const item = inline.get(key);
      if (!item) { refuse(inline.has(key) ? "AmbiguousInlineChartAnchor" : "UnsupportedInlineChartSize"); continue; }
      const hosts = layout.rows.map((row, index) => ({ row, index })).filter(({ row }) => row.kind === "text" && row.section === target.section && row.paragraph === target.paragraph && row.startUnit <= target.anchorUnit && row.endUnit > target.anchorUnit);
      if (hosts.length !== 1) { refuse("AmbiguousInlineChartAnchor"); continue; }
      const { row, index } = hosts[0];
      if (row.transform !== undefined) { refuse("UnsupportedInlineChartTransform"); continue; }
      placement = inlinePictureRowPlacement(item, row, index);
    } else if (layout.state === "paginated") placement = projectFloatingPicturePage(picture, content.paragraphs, layout.rows);
    else {
      const rows = layout.rows.map((row, index) => ({ row, index })).filter(({ row }) => row.kind === "text" && row.section === target.section && row.paragraph === target.paragraph).sort((a, b) => a.row.startUnit - b.row.startUnit);
      let end = 0;
      const complete = rows.length && rows.every(({ row }) => {
        if (row.transform !== undefined || row.startUnit !== end || row.endUnit <= end) return false;
        end = row.endUnit; return true;
      });
      if (!complete || end !== owners[0].text.length) { refuse("IncompleteChartPreviewParagraph"); continue; }
      const first = rows[0], last = rows.at(-1);
      placement = placeFloatingPicture(picture, {
        column: { x: TEXT_LEFT, y: 0, width: columnWidth, height: layout.height },
        paragraph: { x: rowLeft(first.row), y: rowTop(first.row, first.index), width: first.row.width,
          height: rowTop(last.row, last.index) + rowHeight(last.row) - rowTop(first.row, first.index) },
      });
    }
    if (placement.state !== "placed") { refuse(placement.error ?? placement.state); continue; }
    output.items.push({ target, primitives, ...placement.rectangle });
    output.height = Math.max(output.height, placement.rectangle.y + placement.rectangle.height);
  }
  return output;
}

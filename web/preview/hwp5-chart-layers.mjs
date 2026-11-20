import { hwpUnitPixels } from './hwp-units.mjs';
import { picturePositionKey } from './picture-inline.mjs';
import { chartPreviewPrimitives } from './chart-preview-primitives.mjs';
import { inlinePictureRowPlacement } from './inline-picture-row-placement.mjs';
import { rowLeft, rowTop, rowHeight, TEXT_LEFT } from './row-geometry.mjs';
import { placeFloatingPicture } from './picture-placement.mjs';
import { projectFloatingPicturePage } from './picture-page-projection.mjs';
const key = (section, paragraph) => `${section}:${paragraph}`;
function indexContent(content) {
  const paragraphs = new Map(),
    conflicts = new Set();
  for (const row of content.paragraphs ?? []) {
    const id = key(row.section, row.paragraph);
    paragraphs.set(id, paragraphs.has(id) ? null : row);
  }
  for (const picture of content.pictures ?? [])
    if (picture.state === 'located')
      conflicts.add(picturePositionKey(picture.section, picture.paragraph, picture.anchorUnit));
  return { paragraphs, conflicts };
}
function owned(target, source) {
  const row = source.paragraphs.get(key(target.section, target.paragraph));
  return Boolean(
    row &&
    !row.clipped &&
    !row.tableCell &&
    !row.drawingText &&
    !row.drawingCaption &&
    row.text?.[target.anchorUnit] === '\ufffc' &&
    !source.conflicts.has(picturePositionKey(target.section, target.paragraph, target.anchorUnit)),
  );
}
export function inlineHwp5ChartIndex(content) {
  const result = new Map();
  if (content.hwp5ChartDisplayAvailable !== true) return result;
  const source = indexContent(content);
  for (const target of content.hwp5ChartTargets ?? []) {
    if (
      target.error_name ||
      !owned(target, source) ||
      target.frame?.geometry.treat_as_character !== true
    )
      continue;
    const g = target.frame.geometry,
      id = picturePositionKey(target.section, target.paragraph, target.anchorUnit);
    const item = {
      picture: target,
      width: hwpUnitPixels(g.width),
      height: hwpUnitPixels(g.height),
    };
    result.set(id, result.has(id) ? null : item);
  }
  return result;
}
function floatingParagraphBoxes(hosts, paragraph, columnWidth, height) {
  let end = 0;
  const complete =
    hosts.length &&
    hosts.every(({ row }) => {
      const valid = row.transform === undefined && row.startUnit === end && row.endUnit > end;
      end = row.endUnit;
      return valid;
    });
  if (!complete || end !== paragraph.text.length) return null;
  const first = hosts[0],
    last = hosts.at(-1);
  return {
    column: { x: TEXT_LEFT, y: 0, width: columnWidth, height },
    paragraph: {
      x: rowLeft(first.row),
      y: rowTop(first.row, first.index),
      width: first.row.width,
      height: rowTop(last.row, last.index) + rowHeight(last.row) - rowTop(first.row, first.index),
    },
  };
}
export function previewHwp5ChartLayers(content, layout, columnWidth, read) {
  const output = {
    items: [],
    unavailable: [],
    pending: 0,
    total: 0,
    height: layout.height,
    exact: false,
    mode: 'preview-overlay',
  };
  if (content.hwp5ChartDisplayAvailable !== true) return output;
  const source = indexContent(content),
    inline = inlineHwp5ChartIndex(content),
    rows = new Map();
  for (const [index, row] of layout.rows.entries())
    if (row.kind === 'text') {
      const id = key(row.section, row.paragraph),
        list = rows.get(id) ?? [];
      list.push({ row, index });
      rows.set(id, list);
    }
  // Monotonic paragraph rows make all inline host searches one pass per paragraph.
  const cursors = new Map(),
    floatingParagraphs = new Map();
  for (const target of content.hwp5ChartTargets ?? []) {
    output.total++;
    const refuse = (reason) =>
      output.unavailable.push({
        format: 'hwp5',
        section: target.section,
        controlNode: target.controlNode,
        reason,
      });
    if (target.error_name) {
      refuse(target.error_name);
      continue;
    }
    if (!owned(target, source)) {
      refuse('UnsupportedHwp5ChartPreviewOwner');
      continue;
    }
    const resource = read(target);
    if (!resource) {
      output.pending++;
      continue;
    }
    if (resource.error) {
      refuse(resource.error);
      continue;
    }
    if (!resource.value) {
      output.pending++;
      continue;
    }
    if (resource.provisional === true) output.pending++;
    const primitives = chartPreviewPrimitives(resource.value.data);
    if (primitives.state !== 'ready') {
      refuse(primitives.reason);
      continue;
    }
    const id = key(target.section, target.paragraph),
      hosts = rows.get(id) ?? [],
      g = target.frame.geometry;
    let placement;
    if (g.treat_as_character) {
      const cursor = cursors.get(id) ?? { at: 0, last: -1 };
      if (target.anchorUnit <= cursor.last) {
        refuse('UnorderedHwp5ChartAnchors');
        continue;
      }
      cursor.last = target.anchorUnit;
      while (cursor.at < hosts.length && hosts[cursor.at].row.endUnit <= target.anchorUnit)
        cursor.at++;
      cursors.set(id, cursor);
      const host = hosts[cursor.at],
        item = inline.get(picturePositionKey(target.section, target.paragraph, target.anchorUnit));
      if (
        !host ||
        !item ||
        host.row.startUnit > target.anchorUnit ||
        host.row.transform !== undefined
      ) {
        refuse('UnsupportedHwp5InlineChartHost');
        continue;
      }
      placement = inlinePictureRowPlacement(item, host.row, host.index);
    } else {
      const picture = {
        ...target,
        state: 'located',
        geometry: {
          width: g.width,
          height: g.height,
          widthRelative: g.width_relative,
          heightRelative: g.height_relative,
          treatAsCharacter: false,
          horizontalOffset: g.horizontal_offset,
          verticalOffset: g.vertical_offset,
        },
        position: target.frame.position,
      };
      if (layout.state === 'paginated')
        placement = projectFloatingPicturePage(picture, content.paragraphs, layout.rows);
      else {
        // The section/paragraph index must first select one actual body row.
        // This invocation owns the cache; neither a numeric ID nor a previous
        // state can supply another row's boxes, failures or Native authority.
        const paragraph = source.paragraphs.get(id);
        if (!floatingParagraphs.has(paragraph)) {
          floatingParagraphs.set(
            paragraph,
            floatingParagraphBoxes(hosts, paragraph, columnWidth, layout.height),
          );
        }
        const boxes = floatingParagraphs.get(paragraph);
        if (!boxes) {
          refuse('IncompleteHwp5ChartPreviewParagraph');
          continue;
        }
        placement = placeFloatingPicture(picture, boxes);
      }
    }
    if (placement.state !== 'placed') {
      refuse(placement.error ?? placement.state);
      continue;
    }
    const rectangle = placement.rectangle;
    output.items.push({
      target,
      primitives,
      provisional: resource.provisional === true,
      x: rectangle.x,
      y: rectangle.y,
      width: rectangle.width,
      height: rectangle.height,
    });
    output.height = Math.max(output.height, rectangle.y + rectangle.height);
  }
  return output;
}

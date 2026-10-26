import { groupShapeChildren } from './group-shape-children.mjs';
import { drawingPageReference } from './drawing-page-reference.mjs';
import { placeGroupedRoot } from './grouped-root-placement.mjs';
import { projectGroupedPicturePage } from './grouped-picture-page-projection.mjs';
import { paragraphReferenceGeometry, paragraphLineAdvance } from './paragraph-geometry.mjs';
import { textMeasurement } from './text-measurement.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';
import { rectanglesOverlap } from './rectangles-overlap.mjs';
import { DEFAULT_ROW_HEIGHT, TEXT_TOP } from './row-geometry.mjs';

// Preserve this compositor's exact supported ownership before selecting an outer one.
export function floatingTableOwnsPictureGroups(content) {
  if (
    !content.tables?.some((table) => table.sourceGeometry?.geometry?.treat_as_character === false)
  )
    return false;
  const prepared = floatingTablePictureGroups(content);
  if (prepared.state !== 'prepared') return false;
  const roots = (content.containers ?? []).filter((root) => root.source?.group_context === null);
  const selected = new Set([...prepared.hosts.values()].map((entry) => entry.root));
  return (
    roots.length > 0 && selected.size === roots.length && roots.every((root) => selected.has(root))
  );
}

// Picture-only, standalone TOP_BOTTOM roots. Child geometry stays grouped.
export function floatingTablePictureGroups(content) {
  const fail = (error) => ({ state: 'unavailable', error }),
    hosts = new Map(),
    children = new Set();
  if (content.containerSourceErrors?.length) return fail('IncompleteFloatingTablePictureGroup');
  for (const picture of content.pictures ?? []) {
    if (!picture?.owner || picture.owner.anchorNode === picture.pictureNode) continue;
    const key = `${picture.section}:${picture.owner.anchorNode}`;
    if (children.has(key)) continue;
    const roots = (content.containers ?? []).filter(
      (root) => root.section === picture.section && root.containerNode === picture.owner.anchorNode,
    );
    if (roots.length !== 1) return fail('InvalidFloatingTableInlinePictures');
    const root = roots[0],
      source = root.source,
      owner = picture.owner;
    const members = content.paragraphs.filter(
        (p) => p.section === picture.section && p.paragraph === owner.paragraph,
      ),
      host = members[0];
    if (
      source?.group_context !== null ||
      source.geometry?.treat_as_character !== false ||
      source.flow?.text_wrap !== 1 ||
      source.flow.text_flow !== 0 ||
      source.position?.relations?.[0] !== 2 ||
      source.position.relations[2] !== 0 ||
      !Array.isArray(source.position.flags) ||
      ![true, false].includes(source.position.flags[1]) ||
      members.length !== 1 ||
      host.text !== '\ufffc' ||
      owner.anchorUnit !== 0 ||
      host.tableCell ||
      host.drawingText ||
      host.tableCaption ||
      hosts.has(host.paragraph) ||
      content.tables.some(
        (table) => table.section === host.section && table.hostParagraph === host.paragraph,
      )
    )
      return {
        ...fail('UnsupportedFloatingTableGroupedPicture'),
        section: root.section,
        rootNode: root.containerNode,
      };
    let selected;
    try {
      selected = groupShapeChildren(source).filter((child) => child.kind !== 'metadata');
    } catch (error) {
      return fail(error.message);
    }
    const pictures = content.pictures.filter(
      (p) => p.section === picture.section && p.owner?.anchorNode === root.containerNode,
    );
    if (
      !selected.length ||
      selected.some((child) => child.kind !== 'picture') ||
      new Set(selected.map((child) => child.node)).size !== selected.length ||
      pictures.length !== selected.length ||
      selected.some((child) => pictures.filter((p) => p.pictureNode === child.node).length !== 1) ||
      pictures.some((p) => p.owner.paragraph !== host.paragraph || p.owner.anchorUnit !== 0)
    )
      return fail('IncompleteFloatingTablePictureGroup');
    hosts.set(host.paragraph, { root, host, pictures });
    children.add(key);
  }
  const pictures = (content.pictures ?? []).filter(
    (p) => !p?.owner || !children.has(`${p.section}:${p.owner.anchorNode}`),
  );
  return { state: 'prepared', hosts, pictures };
}

export function placeFloatingTablePictureGroup(
  entry,
  page,
  cursor,
  measure,
  placements,
  previous = [],
) {
  const { root, host, pictures } = entry,
    fail = (error) => ({ state: 'unavailable', error });
  const geometry = paragraphReferenceGeometry(host.paragraphShape, page.page.width);
  const font = textMeasurement(measure('', host, 0, 'text')),
    height = Math.max(
      DEFAULT_ROW_HEIGHT,
      paragraphLineAdvance(
        host.paragraphShape,
        font.height,
        Math.max(DEFAULT_ROW_HEIGHT, font.height + TEXT_TOP),
      ),
    );
  if (!Number.isFinite(height) || height <= 0 || height > page.page.height)
    return fail('UnsupportedFloatingGroupAnchorRow');
  if (cursor + height > page.page.y + page.page.height) return { state: 'next-page' };
  const row = {
    kind: 'text',
    section: host.section,
    paragraph: host.paragraph,
    text: host.text,
    startUnit: 0,
    endUnit: 1,
    x: page.page.x + geometry.x,
    y: cursor,
    width: geometry.width,
    height,
    textHeight: font.height,
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 0 },
    ],
    editable: host.editable,
    selectable: host.selectable,
    paragraphShape: host.paragraphShape,
    pageOrdinal: page.ordinal,
    columnOrdinal: 0,
    reservedGroupRoot: root.containerNode,
    referenceBoxes: { paper: page.paper, page: page.page, column: page.page },
  };
  const drawing = {
    section: host.section,
    hostParagraph: host.paragraph,
    anchorUnit: 0,
    source: root.source,
  };
  const reference = drawingPageReference(drawing, [host], [row]);
  if (reference.state !== 'selected') return reference;
  const placed = placeGroupedRoot(root.source, reference.boxes, reference.host, {
    section: host.section,
    paragraph: host.paragraph,
    unit: 0,
  });
  if (placed.state !== 'placed') return fail(placed.error ?? placed.state);
  const margins = root.source.flow.outside_margins;
  if (
    !Array.isArray(margins) ||
    margins.length !== 4 ||
    !margins.every((v) => Number.isSafeInteger(v) && v >= 0 && v <= 0x7fffffff)
  )
    return fail('InvalidFloatingGroupMargins');
  const [left, right, top, bottom] = margins.map(hwpUnitPixels),
    r = placed.rectangle;
  const footprint = {
    x: r.x - left,
    y: r.y - top,
    width: r.width + left + right,
    height: r.height + top + bottom,
  };
  const insidePaper = (r) =>
    [r.x, r.y, r.width, r.height, r.x + r.width, r.y + r.height].every(Number.isFinite) &&
    r.width > 0 &&
    r.height > 0 &&
    r.x >= page.paper.x &&
    r.y >= page.paper.y &&
    r.x + r.width <= page.paper.x + page.paper.width + 1e-8 &&
    r.y + r.height <= page.paper.y + page.paper.height + 1e-8;
  if (
    root.source.position.flags[1] === true &&
    (footprint.y < page.page.y || footprint.y + footprint.height > page.page.y + page.page.height)
  ) {
    if (footprint.height > page.page.height) return fail('FloatingGroupPageHeightOverflow');
    return { state: 'next-page' };
  }
  if (!insidePaper(footprint)) return fail('FloatingGroupPaperOverflow');
  if (
    placements.some(
      (p) => p.pageOrdinal === page.ordinal && rectanglesOverlap(p.footprint, footprint),
    ) ||
    previous.some(
      (p) => p.pageOrdinal === page.ordinal && rectanglesOverlap(p.footprint, footprint),
    )
  )
    return fail('FloatingGroupTableCollision');
  for (const picture of pictures) {
    const child = projectGroupedPicturePage(picture, [root], [host], [row]);
    if (child.state !== 'placed') return fail(child.error ?? child.state);
    if (!insidePaper(child.rectangle)) return fail('FloatingGroupChildPaperOverflow');
  }
  return {
    state: 'placed',
    row,
    reservation: {
      section: host.section,
      rootNode: root.containerNode,
      paragraph: host.paragraph,
      anchorUnit: 0,
      pageOrdinal: page.ordinal,
      rectangle: placed.rectangle,
      footprint,
    },
    bottom: Math.max(cursor + height, footprint.y + footprint.height),
  };
}

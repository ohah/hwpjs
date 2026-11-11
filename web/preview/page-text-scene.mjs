import { affineBox, inverseAffine } from './affine-point-geometry.mjs';
import { automaticNumberText } from './automatic-number-text.mjs';
import { isUtf16Boundary } from './utf16-boundary.mjs';
import { pageVisibleRectangle } from './page-visible-rectangle.mjs';
import { rowLeft, rowTextHeight, rowTextTop } from './row-geometry.mjs';

const kinds = ['body', 'table', 'textbox', 'caption'];
const MAX_VISITS = 1_000_000;
const EPSILON = 1e-6;
const id = (section, paragraph) => `${section}:${paragraph}`;
const index = (value) => Number.isSafeInteger(value) && value >= 0;
const ownersExcluded = new Set(['header', 'footer', 'footnote', 'endnote']);
const geometry = (box) => pageVisibleRectangle(box, box).state === 'visible';
const comparePoint = (a, b) => a.y - b.y || a.x - b.x;

export const pageTextUnavailable = (reason) => Object.freeze({ state: 'unavailable', reason });

export function pageTextFilter(filter) {
  if (filter === undefined) return new Set(kinds);
  if (
    !filter ||
    typeof filter !== 'object' ||
    Array.isArray(filter) ||
    Object.keys(filter).some((key) => key !== 'include') ||
    !Array.isArray(filter.include) ||
    filter.include.length > kinds.length ||
    Array.from(filter.include).some((kind) => !kinds.includes(kind))
  )
    return null;
  return new Set(filter.include);
}

const createdKey = (row) => {
  const cell = row.createdCell;
  if (!cell || !index(row.section) || !index(cell.row) || !index(cell.column)) return null;
  if (typeof cell.identity !== 'string' || !/^\d{1,20}$/.test(cell.identity)) return null;
  return `created:${row.section}:${cell.identity}:${cell.row}:${cell.column}`;
};
const sourceKey = (row) =>
  index(row.section) && index(row.paragraph) ? id(row.section, row.paragraph) : null;

function sourceKind(paragraph, host) {
  if (ownersExcluded.has(host) || paragraph.pageArea || paragraph.noteBody || paragraph.memoPane)
    return 'excluded';
  if (paragraph.tableCaption || paragraph.drawingCaption) return 'caption';
  if (paragraph.cell || paragraph.createdCell) return 'table';
  if (paragraph.drawingText) return 'textbox';
  if (host === 'body' || paragraph.selectionOwner === `section:${paragraph.section}:body`)
    return 'body';
  return null;
}

function rangeMatches(row, owner) {
  const { startUnit: start, endUnit: end } = row;
  return (
    index(start) &&
    index(end) &&
    start < end &&
    end <= owner.text.length &&
    isUtf16Boundary(owner.text, start) &&
    isUtf16Boundary(owner.text, end) &&
    row.text === owner.text.slice(start, end)
  );
}

function inside(rect, clip) {
  return (
    rect.x >= clip.x - EPSILON &&
    rect.y >= clip.y - EPSILON &&
    rect.x + rect.width <= clip.x + clip.width + EPSILON &&
    rect.y + rect.height <= clip.y + clip.height + EPSILON
  );
}

function textExtent(row, startX, endX) {
  const bounds = {
    x: rowLeft(row) + Math.min(startX, endX),
    y: row.y + rowTextTop(row),
    width: Math.abs(endX - startX),
    height: rowTextHeight(row),
  };
  return row.transform === undefined ? bounds : affineBox(row.transform, bounds);
}

const cellKey = (row) =>
  createdKey(row) ??
  (index(row.tableNode) && index(row.listNode)
    ? `${row.section}:${row.tableNode}:${row.listNode}`
    : null);
const tableKey = (row) =>
  row.createdCell
    ? `created:${row.section}:${row.createdCell.identity}`
    : index(row.tableNode)
      ? id(row.section, row.tableNode)
      : null;

function pageReadingOrder({ records, boxes, tracks, drawings, page }, issue) {
  const zones = new Map();
  for (const row of tracks) {
    if (!index(row.zoneOrdinal) || !index(row.columnOrdinal)) continue;
    const column = row.referenceBoxes?.column;
    if (column && !geometry(column)) continue;
    const key = `${row.zoneOrdinal}:${row.columnOrdinal}`;
    const old = zones.get(key);
    const top = Math.min(old?.top ?? Infinity, row.y, column?.y ?? Infinity);
    zones.set(key, { zone: row.zoneOrdinal, column: row.columnOrdinal, top, box: column });
  }
  const zoneList = [...zones.values()];
  const multipleTracks =
    new Set(zoneList.map((entry) => entry.zone)).size > 1 ||
    new Set(zoneList.map((entry) => entry.column)).size > 1 ||
    page.columns?.length > 1;
  let inferenceVisits = 0;
  const cellBoxes = new Map();
  for (const box of boxes) {
    const key = cellKey(box);
    if (!key || !geometry(box)) continue;
    const old = cellBoxes.get(key);
    if (!old || comparePoint(box, old) < 0) cellBoxes.set(key, box);
  }

  const blocks = new Map();
  const placeBlock = (key, point, order) => {
    const old = blocks.get(key);
    blocks.set(key, {
      point: !old || comparePoint(point, old.point) < 0 ? point : old.point,
      order: Math.min(order, old?.order ?? Infinity),
    });
  };
  for (const item of records) {
    const { row, kind, position } = item;
    let zone = row.zoneOrdinal;
    // A textbox row's column is local to its drawing. The reference column
    // belongs to its anchor on the physical page.
    let column = kind === 'textbox' ? undefined : row.columnOrdinal;
    const drawing =
      kind === 'textbox' && index(row.drawingNode) ? id(row.section, row.drawingNode) : null;
    const anchor = drawings.get(drawing) ?? position;
    if (!index(zone) || !index(column)) {
      inferenceVisits += zoneList.length;
      let candidates = inferenceVisits <= 20000 ? zoneList : [];
      if (index(zone)) candidates = candidates.filter((entry) => entry.zone === zone);
      if (index(column)) candidates = candidates.filter((entry) => entry.column === column);
      const reference = row.referenceBoxes?.column;
      const exact =
        reference &&
        candidates.filter(
          ({ box }) =>
            box &&
            box.x === reference.x &&
            box.y === reference.y &&
            box.width === reference.width &&
            box.height === reference.height,
        );
      const placed = exact?.length
        ? exact
        : candidates.filter(
            ({ box, top }) =>
              box &&
              anchor.y >= top - EPSILON &&
              anchor.x >= box.x - EPSILON &&
              anchor.x < box.x + box.width + EPSILON,
          );
      // Later column declarations replace the same horizontal space.
      if (placed.length) {
        const latest = Math.max(...placed.map((entry) => entry.zone));
        candidates = placed.filter((entry) => entry.zone === latest);
      }
      if (candidates.length === 1) {
        zone ??= candidates[0].zone;
        column ??= candidates[0].column;
      } else if (multipleTracks) {
        issue('ambiguous-reading-order', kind);
      }
    }
    item.zone = index(zone) ? zone : 0;
    item.column = index(column) ? column : 0;
    if (drawing) {
      item.block = `${item.zone}:${item.column}:drawing:${drawing}`;
      item.localPosition = { x: rowLeft(row), y: row.y };
      item.localColumn = row.columnOrdinal ?? 0;
      placeBlock(item.block, anchor, item.order);
    } else if (kind === 'table') {
      const table = tableKey(row);
      const cell = cellKey(row);
      if (!table || !cell) {
        issue('ambiguous-reading-order', kind);
        continue;
      }
      const block = `${item.zone}:${item.column}:${table}`;
      item.block = block;
      item.cell = cell;
      item.cellPosition = cellBoxes.get(cell) ?? position;
      if (!cellBoxes.has(cell)) issue('ambiguous-reading-order', kind);
      placeBlock(block, item.cellPosition, item.order);
    }
  }
  return records.toSorted((a, b) => {
    const group = a.zone - b.zone || a.column - b.column;
    if (group) return group;
    const aBlock = blocks.get(a.block);
    const bBlock = blocks.get(b.block);
    const position = comparePoint(aBlock?.point ?? a.position, bBlock?.point ?? b.position);
    if (position) return position;
    if (a.block !== b.block) return (aBlock?.order ?? a.order) - (bBlock?.order ?? b.order);
    if (a.block && a.block === b.block && a.localPosition && b.localPosition)
      return (
        a.localColumn - b.localColumn ||
        comparePoint(a.localPosition, b.localPosition) ||
        a.row.startUnit - b.row.startUnit ||
        a.order - b.order
      );
    return (
      (a.block === b.block && a.cell && b.cell
        ? comparePoint(a.cellPosition, b.cellPosition)
        : 0) ||
      (a.cell === b.cell && a.cell
        ? (a.row.cellColumnOrdinal ?? 0) - (b.row.cellColumnOrdinal ?? 0)
        : 0) ||
      comparePoint(a.position, b.position) ||
      a.row.startUnit - b.row.startUnit ||
      a.order - b.order
    );
  });
}

function collectScene(content, layout) {
  if (
    !content ||
    !['hwp5', 'hwpx'].includes(content.format) ||
    !Array.isArray(content.paragraphs) ||
    !Array.isArray(layout?.rows)
  )
    return pageTextUnavailable('unknown-scene');
  if (
    content.window ||
    content.viewKind ||
    content.limited ||
    layout.limited ||
    layout.documentPageNumbersExact === false ||
    layout.layoutScope === 'paragraph-window-fragment'
  )
    return pageTextUnavailable('incomplete-scene');
  if (layout.state !== 'paginated' || layout.pageLayoutError || !layout.pages?.length)
    return pageTextUnavailable('unknown-scene');
  if (
    layout.pages.length > 2000 ||
    layout.rows.length > 20000 ||
    (layout.boxes?.length ?? 0) > 40000 ||
    (layout.placedDrawings?.length ?? 0) > 20000 ||
    content.paragraphs.length + (layout.createdCellParagraphs?.length ?? 0) > 40000 ||
    (content.paragraphFlows?.length ?? 0) > 40000
  )
    return pageTextUnavailable('scene-budget-exceeded');
  const sections = new Set(content.paragraphs.map((p) => p.section));
  const singleSection = sections.size === 1 ? sections.values().next().value : undefined;
  let bottom = 0;
  const pages = [];
  for (const [ordinal, page] of layout.pages.entries()) {
    const section = page.section ?? singleSection;
    if (
      page.ordinal !== ordinal ||
      !index(section) ||
      !geometry(page.paper) ||
      page.paper.y + EPSILON < bottom
    )
      return pageTextUnavailable('unknown-physical-page-identity');
    bottom = page.paper.y + page.paper.height;
    pages.push({
      page,
      section,
      records: [],
      boxes: [],
      tracks: [],
      drawings: new Map(),
      issues: new Map(),
    });
  }
  const documentIssues = new Map();
  const issue = (issues, code, kind) =>
    issues.set(`${code}:${kind ?? ''}`, Object.freeze({ code, ...(kind ? { kind } : {}) }));
  if (
    layout.sourceCoverage === 'incomplete' ||
    layout.previewReadOnlyTables?.length ||
    layout.unverifiedTableSources?.length ||
    layout.unverifiedDrawingSources?.length ||
    layout.unverifiedSectionSources?.length
  )
    issue(documentIssues, 'incomplete-source-coverage');
  for (const [kind, errors] of [
    [
      'caption',
      [
        'tableCaptionErrors',
        'tableCaptionBindingErrors',
        'pictureCaptionErrors',
        'containerCaptionErrors',
        'hwp5CaptionErrors',
        'hwp5CaptionGeometryErrors',
      ],
    ],
    ['textbox', ['drawingTextBindingErrors', 'drawingTextSnapshotErrors', 'hwp5DrawingBodyErrors']],
  ])
    if (errors.some((key) => content[key]?.length))
      issue(documentIssues, 'incomplete-source-coverage', kind);

  const flows = new Map(
    (content.paragraphFlows ?? []).map((flow) => [id(flow.section, flow.paragraph), flow.host]),
  );
  const owners = new Map();
  let units = 0;
  for (const paragraph of [...content.paragraphs, ...(layout.createdCellParagraphs ?? [])]) {
    const key = paragraph.createdCell ? createdKey(paragraph) : sourceKey(paragraph);
    if (!key || owners.has(key) || typeof paragraph.text !== 'string')
      return pageTextUnavailable('unknown-text-ownership');
    units += paragraph.text.length;
    if (units > MAX_VISITS) return pageTextUnavailable('scene-budget-exceeded');
    owners.set(key, {
      paragraph,
      text: paragraph.text,
      kind: sourceKind(paragraph, flows.get(key)),
      units: null,
    });
  }
  for (const box of layout.boxes ?? [])
    if (!box.repeatedTableHeader) pages[box.pageOrdinal]?.boxes.push(box);
  for (const drawing of layout.placedDrawings ?? []) {
    if (index(drawing.section) && index(drawing.drawingNode) && geometry(drawing.rectangle))
      pages[drawing.pageOrdinal]?.drawings.set(
        id(drawing.section, drawing.drawingNode),
        drawing.rectangle,
      );
  }
  let visits = 0;
  for (const [order, row] of layout.rows.entries()) {
    if (index(row.zoneOrdinal) && !row.pageArea && !row.repeatedTableHeader)
      pages[row.pageOrdinal]?.tracks.push(row);
    if (
      row.kind !== 'text' ||
      !row.text ||
      row.repeatedTableHeader ||
      row.pageArea ||
      row.noteBody ||
      row.memoPane ||
      row.sourceObjectAnchor === true
    )
      continue;
    const key = row.createdCell ? createdKey(row) : sourceKey(row);
    const owner = owners.get(key);
    if (owner?.kind === 'excluded') continue;
    if (!owner) {
      issue(documentIssues, 'unknown-text-ownership');
      continue;
    }
    const kind = owner.kind ?? (index(row.tableNode) && index(row.listNode) ? 'table' : null);
    if (!kind) {
      if (row.text.replaceAll('\ufffc', '')) issue(documentIssues, 'unknown-text-ownership');
      continue;
    }
    owner.kind ??= kind;
    const page = pages[row.pageOrdinal];
    if (!page || page.section !== row.section) {
      issue(documentIssues, 'unplaced-text', kind);
      continue;
    }
    if (!rangeMatches(row, owner)) {
      issue(page.issues, 'invalid-text-range', kind);
      continue;
    }
    visits += row.endUnit - row.startUnit;
    if (visits > MAX_VISITS) return pageTextUnavailable('scene-budget-exceeded');
    owner.units ??= new Uint8Array(owner.text.length);
    for (let unit = row.startUnit; unit < row.endUnit; unit++)
      if (owner.units[unit] === 0) owner.units[unit] = 1;
    const boundaries = row.boundaries;
    if (
      !Array.isArray(boundaries) ||
      boundaries.length < 2 ||
      boundaries[0]?.unit !== row.startUnit ||
      boundaries.at(-1)?.unit !== row.endUnit ||
      (row.transform !== undefined && !inverseAffine(row.transform)) ||
      (row.pageClip !== undefined && !geometry(row.pageClip))
    ) {
      issue(page.issues, 'unknown-text-geometry', kind);
      continue;
    }
    const position = textExtent(row, boundaries[0].x, boundaries.at(-1).x);
    if (
      !position ||
      ![position.x, position.y, position.height].every(Number.isFinite) ||
      position.height <= 0
    ) {
      issue(page.issues, 'unknown-text-geometry', kind);
      continue;
    }
    page.records.push({ owner, key, kind, row, position, order });
  }

  for (const owner of owners.values()) {
    if (owner.kind === 'excluded') continue;
    for (let unit = 0; unit < owner.text.length; unit++) {
      if (!owner.units?.[unit] && !['\ufffc', '\r', '\n'].includes(owner.text[unit])) {
        issue(documentIssues, 'unplaced-text', owner.kind);
        break;
      }
    }
  }
  const result = [];
  for (const [pageIndex, page] of pages.entries()) {
    const fragments = [];
    const ordered = pageReadingOrder(page, (code, kind) => issue(page.issues, code, kind));
    for (const item of ordered) {
      const { row, owner, kind, key } = item;
      const { boundaries } = row;
      // Validate the whole row before emitting text from any grapheme.
      if (
        boundaries.some(
          (point, i) =>
            !index(point?.unit) ||
            !Number.isFinite(point.x) ||
            !isUtf16Boundary(owner.text, point.unit) ||
            (i > 0 && point.unit <= boundaries[i - 1].unit),
        )
      ) {
        issue(page.issues, 'unknown-text-geometry', kind);
        continue;
      }
      for (let i = 1; i < boundaries.length; i++) {
        const start = boundaries[i - 1],
          end = boundaries[i];
        const raw = owner.text.slice(start.unit, end.unit);
        const text =
          raw === '\ufffc'
            ? (automaticNumberText(owner.paragraph, start.unit, row.pageNumber) ?? '')
            : raw.replaceAll('\ufffc', '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
        if (!text) {
          const previous = fragments.at(-1);
          if (previous?.key === key && previous.endUnit === start.unit) previous.endUnit = end.unit;
          continue;
        }
        const extent = textExtent(row, start.x, end.x);
        if (
          !extent ||
          !inside(extent, page.page.paper) ||
          (row.pageClip && !inside(extent, row.pageClip))
        ) {
          issue(page.issues, 'clipped-text', kind);
          continue;
        }
        let already = 0;
        for (let unit = start.unit; unit < end.unit; unit++) if (owner.units[unit] === 2) already++;
        if (already) {
          if (already !== end.unit - start.unit) issue(page.issues, 'invalid-text-range', kind);
          continue;
        }
        owner.units.fill(2, start.unit, end.unit);
        const previous = fragments.at(-1);
        if (previous?.key === key && previous.endUnit === start.unit) {
          previous.endUnit = end.unit;
          previous.text += text;
        } else
          fragments.push({
            key,
            kind,
            section: row.section,
            startUnit: start.unit,
            endUnit: end.unit,
            text,
          });
      }
    }
    const issues = new Map([...documentIssues, ...page.issues]);
    result.push({
      pageIndex,
      section: page.section,
      fragments,
      issues: [...issues.values()],
    });
  }
  return { state: 'indexed', pages: result };
}

const scenes = new WeakMap();

export function getScenePageText(content, layout, pageIndex, filter) {
  if (!index(pageIndex)) return pageTextUnavailable('invalid-page-index');
  const included = pageTextFilter(filter);
  if (!included) return pageTextUnavailable('invalid-filter');
  if (!layout || typeof layout !== 'object') return pageTextUnavailable('unknown-scene');
  let cached = scenes.get(layout);
  if (!cached || cached.content !== content) {
    cached = { content, index: collectScene(content, layout) };
    scenes.set(layout, cached);
  }
  const scene = cached.index;
  if (scene.state === 'unavailable') return scene;
  const page = scene.pages[pageIndex];
  if (!page) return pageTextUnavailable('page-out-of-range');
  const fragments = page.fragments.filter(({ kind }) => included.has(kind));
  // Soft wraps are joined by source range. A new paragraph or a visible gap
  // separates runs without manufacturing text from the missing span.
  let text = '';
  let previous;
  for (const fragment of fragments) {
    if (
      previous &&
      (previous.key !== fragment.key || previous.endUnit !== fragment.startUnit) &&
      !text.endsWith('\n')
    )
      text += '\n';
    text += fragment.text;
    previous = fragment;
  }
  const issues = included.size ? page.issues.filter(({ kind }) => !kind || included.has(kind)) : [];
  return Object.freeze({
    state: 'available',
    pageIndex,
    pageCount: scene.pages.length,
    section: page.section,
    text,
    coverage: issues.length ? 'partial' : 'complete',
    issues: Object.freeze(issues),
  });
}

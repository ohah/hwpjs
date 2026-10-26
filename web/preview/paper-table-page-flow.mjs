import { paginateBodyRows } from './page-row-flow.mjs';
import { projectPaperTablePage } from './paper-table-page-projection.mjs';
import { reservePaperTableRow } from './paper-table-row-reservation.mjs';

/** Recompute from original rows until explicit anchor-page reservations stabilize. */
export function paginatePaperTableRows(
  rows,
  setting,
  flows,
  entries,
  { maxIterations = 32, ...options } = {},
) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    !Array.isArray(entries) ||
    !entries.length ||
    !Number.isSafeInteger(maxIterations) ||
    maxIterations < 1 ||
    maxIterations > 1000 ||
    options.rowY !== undefined ||
    options.minimumRowPage !== undefined
  )
    return fail('InvalidPaperTableFlow');
  const ids = new Set();
  for (const entry of entries) {
    const table = entry?.table,
      key = `${table?.section}:${table?.tableNode}`;
    if (
      !table ||
      ![table.section, table.tableNode, table.hostParagraph].every(
        (v) => Number.isSafeInteger(v) && v >= 0,
      ) ||
      ids.has(key) ||
      entry.measured?.state !== 'measured' ||
      table.section !== setting?.section_ordinal ||
      !Number.isSafeInteger(table.anchorUnit) ||
      table.anchorUnit < 0
    )
      return fail('InvalidPaperTableFlowOwner');
    ids.add(key);
  }
  const project = (layout) => {
    const scenes = [];
    let remaining =
      (options.maxRows ?? 20000) - layout.rows.length - (layout.flowAnchors?.length ?? 0);
    for (const { table, measured } of entries) {
      const anchors = (layout.flowAnchors ?? []).filter(
        (anchor) => anchor.section === table.section && anchor.tableNode === table.tableNode,
      );
      if (
        anchors.length !== 1 ||
        anchors[0].paragraph !== table.hostParagraph ||
        anchors[0].anchorUnit !== table.anchorUnit
      )
        return fail('MissingPaperTableFlowAnchor');
      const page = layout.pages.find((page) => page.ordinal === anchors[0].pageOrdinal);
      if (!page || (page.section !== undefined && page.section !== table.section))
        return fail('InvalidPaperTableFlowPage');
      const scene = projectPaperTablePage(
        table,
        measured,
        { ...page, section: table.section },
        remaining,
      );
      if (scene.state !== 'paper-projected') return scene;
      remaining -= scene.rows.length;
      scenes.push({
        ...scene,
        section: table.section,
        tableNode: table.tableNode,
        hostParagraph: table.hostParagraph,
        pageOrdinal: page.ordinal,
      });
    }
    return { state: 'projected', scenes };
  };
  const signature = (scenes) =>
    JSON.stringify(
      scenes.map((scene) => [scene.section, scene.tableNode, scene.pageOrdinal, scene.footprint]),
    );
  let layout = paginateBodyRows(rows, setting, flows, options);
  if (layout.state !== 'paginated' || layout.limited) return layout;
  let projected = project(layout);
  if (projected.state !== 'projected') return projected;
  const anchorPages = new Map();
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    for (const scene of projected.scenes) {
      const key = `${scene.section}:${scene.hostParagraph}`;
      anchorPages.set(key, Math.max(anchorPages.get(key) ?? 0, scene.pageOrdinal));
    }
    const reservations = projected.scenes.map((scene) => ({
      pageOrdinal: scene.pageOrdinal,
      footprint: scene.footprint,
    }));
    let failure;
    layout = paginateBodyRows(rows, setting, flows, {
      ...options,
      minimumRowPage: (row) => anchorPages.get(`${row.section}:${row.paragraph}`) ?? 0,
      rowY(row, context) {
        const reserved = reservePaperTableRow(row, context, reservations);
        if (reserved.state !== 'reserved') {
          failure = reserved.error;
          return NaN;
        }
        return reserved.y;
      },
    });
    if (failure) return fail(failure);
    if (layout.state !== 'paginated' || layout.limited) return layout;
    const next = project(layout);
    if (next.state !== 'projected') return next;
    if (signature(next.scenes) === signature(projected.scenes))
      return { ...layout, paperTableScenes: next.scenes, paperTableFlowIterations: iteration + 1 };
    projected = next;
  }
  return fail('PaperTableFlowConvergenceLimit');
}

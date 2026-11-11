import { createObservationReadScope } from './read-observation-scope.ts';
import type {
  ObservationSdk,
  Observation,
  Diagnostic,
  DocumentObservations,
  SectionObservation,
  ParagraphFlow,
  ParagraphObservation,
  PictureObservation,
  ObjectObservation,
  TableBinding,
  TablePlacement,
  CellInventory,
  PageAreaObservation,
} from '../types/document-view.ts';
interface SnapshotRow {
  paragraph: number;
  text?: string;
}
interface PictureSite {
  pictureNode: number;
  paragraph?: number | null;
}
interface PictureOwner {
  pictureNode: number;
  owner?: { paragraph: number } | null;
  error?: string | null;
}
interface ObjectSite {
  wrapper?: number;
  source?: { node?: number; issue?: string | null };
  paragraph?: number;
  anchorUnit?: number;
  error_name?: string | null;
  ole_node?: number;
  node?: number;
  owner?: { paragraph?: number };
  drawingNode?: number;
}
import { call, array, uint, unique } from './common.ts';
function collectSection(
  sdk: ObservationSdk,
  section: number,
  warnings: Diagnostic[],
): SectionObservation {
  const source = { section },
    get = <T = unknown>(name: string): Observation<T> =>
      call<T>(sdk, name, [section], warnings, source);
  const flowResult = get<ParagraphFlow[]>('paragraphFlow'),
    flows = array<ParagraphFlow>(flowResult, warnings, 'paragraphFlow', source),
    flowMap = unique(flows, (r) => r.paragraph, warnings, 'paragraphFlow');
  const snapshot = get<SnapshotRow[]>('paragraphTextSnapshot'),
    rows = array<SnapshotRow>(snapshot, warnings, 'paragraphTextSnapshot', source);
  const observedRows = rows.slice();
  const observedIds = new Set(rows.map((row) => row.paragraph));
  for (const flow of flows)
    if (!observedIds.has(flow.paragraph)) {
      observedRows.push({ paragraph: flow.paragraph });
      observedIds.add(flow.paragraph);
    }
  const paragraphs: ParagraphObservation[] = observedRows.map((row) => {
    const flow = flowMap.get(row.paragraph);
    return {
      paragraph: row.paragraph,
      node: uint(flow?.source_node) ? flow.source_node : null,
      identityKnown: uint(flow?.source_node),
      displayText: typeof row.text === 'string' ? row.text : null,
      flow: flow ?? null,
    };
  });
  const bindings = get<TableBinding[]>('tableBindings'),
    placements = get<TablePlacement[]>('tablePlacements'),
    tableInventory = get<CellInventory>('tableBorderSources'),
    areas = get<PageAreaObservation[]>('pageAreaDeclarations');
  for (const [name, result] of Object.entries({ bindings, placements, areas }))
    array(result, warnings, name, source);
  if (tableInventory.ok && (!tableInventory.value || !Array.isArray(tableInventory.value.cells))) {
    warnings.push({ code: 'InvalidObservation', message: 'tableBorderSources', source });
    tableInventory.ok = false;
  }
  const sitesResult = get<PictureSite[]>('pictureSites'),
    ownersResult = get<PictureOwner[]>('pictureOwners');
  const owners = unique(
    array<PictureOwner>(ownersResult, warnings, 'pictureOwners', source),
    (row) => row.pictureNode,
    warnings,
    'picture owner',
  );
  const sites = array<PictureSite>(sitesResult, warnings, 'pictureSites', source).slice();
  const inventoryPictures = new Set(
    sites.filter((row) => uint(row?.pictureNode)).map((row) => row.pictureNode),
  );
  const seenPictures = new Set(sites.map((row) => row.pictureNode));
  for (const owner of owners.values())
    if (owner && !seenPictures.has(owner.pictureNode)) {
      sites.push({ pictureNode: owner.pictureNode, paragraph: owner.owner?.paragraph ?? null });
      seenPictures.add(owner.pictureNode);
    }
  const pictures: PictureObservation[] = sites.map((row) => {
    const owner = owners.get(row.pictureNode),
      proof = owner?.owner;
    const parentParagraph = proof && row.paragraph === proof.paragraph ? proof.paragraph : null;
    // 그림별 바이트 요청·OCR·치수 추정은 수행하지 않습니다.
    return {
      inventorySiteKnown: inventoryPictures.has(row.pictureNode),
      pictureNode: row.pictureNode,
      parentParagraph,
      sourceInfo: { section, pictureNode: row.pictureNode },
      width: null,
      height: null,
      reason: uint(parentParagraph) ? null : (owner?.error ?? 'PictureOwnerUnverified'),
    };
  });
  const objects = new Map<number, ObjectObservation>();
  let objectsKnown = true;
  const addObject = (row: Omit<ObjectObservation, 'node'> & { node: unknown }) => {
    if (!uint(row.node)) {
      objectsKnown = false;
      return;
    }
    const previous = objects.get(row.node);
    if (previous && previous.kind !== row.kind) throw new Error('ConflictingObjectKind');
    if (!previous) objects.set(row.node, { ...row, node: row.node, siteKnown: true });
  };
  const inventory = <T = ObjectSite>(method: string): T[] => {
    const result = get(method);
    const rows = array<T>(result, warnings, method, source);
    objectsKnown &&= result.ok;
    return rows;
  };
  for (const row of inventory('chartSites'))
    addObject({
      kind: 'chart',
      node: row?.wrapper,
      parentParagraph:
        row?.error_name === null && uint(row?.paragraph) && uint(row?.anchorUnit)
          ? row.paragraph
          : null,
      detailUnavailable: row?.error_name !== null,
      reason: row?.error_name ?? 'ObjectDetailsDeferred',
    });
  for (const row of inventory('equationSites'))
    addObject({
      kind: 'equation',
      node: row?.source?.node,
      parentParagraph:
        row?.source?.issue === null && row?.error_name === null && uint(row?.paragraph)
          ? row.paragraph
          : null,
      detailUnavailable: row?.source?.issue !== null || row?.error_name !== null,
      reason: row?.source?.issue ?? row?.error_name ?? 'ObjectDetailsDeferred',
    });
  for (const row of inventory('oleSites'))
    addObject({
      kind: 'ole',
      node: row?.ole_node,
      parentParagraph: row?.error_name === null && uint(row?.paragraph) ? row.paragraph : null,
      detailUnavailable: row?.error_name !== null,
      reason: row?.error_name ?? 'ObjectDetailsDeferred',
    });
  for (const method of ['rectangleNodes', 'lineNodes', 'connectorNodes'])
    for (const node of inventory<number>(method))
      addObject({
        kind: 'drawing',
        node,
        parentParagraph: null,
        subtype: method,
        reason: 'ObjectOwnerUnverified',
      });
  for (const row of inventory('ellipseSources'))
    addObject({
      kind: 'drawing',
      node: row?.node,
      parentParagraph: uint(row?.owner?.paragraph) ? row.owner.paragraph : null,
      subtype: 'ellipse',
      reason: 'ObjectDetailsDeferred',
    });
  for (const row of inventory('drawingTextBindings'))
    addObject({
      kind: 'drawing',
      node: row?.drawingNode,
      parentParagraph: null,
      subtype: 'text-bearing',
      reason: 'ObjectOwnerUnverified',
    });
  return {
    section,
    paragraphs,
    paragraphTotal: snapshot.ok && observedRows.length === rows.length ? rows.length : null,
    flowsKnown: flowResult.ok,
    bindings,
    placements,
    tableInventory,
    cellInventory: null,
    areas,
    pictures,
    picturesKnown: sitesResult.ok && ownersResult.ok,
    objects: [...objects.values()],
    objectsKnown,
    objectInventoryScope: 'hwpx-chart-equation-ole-and-supported-drawing-sites',
    format: 'hwpx',
  };
}

export function collectHwpx({
  sdk,
  sectionCount,
}: {
  sdk: ObservationSdk;
  sectionCount: number;
}): DocumentObservations {
  const warnings: Diagnostic[] = [],
    sections: SectionObservation[] = [];
  const observe = createObservationReadScope(sdk);
  for (let section = 0; section < sectionCount; section++) {
    sections.push(observe(section, () => collectSection(sdk, section, warnings)));
  }
  return { sections, warnings };
}

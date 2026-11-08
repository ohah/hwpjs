import { call, array, uint, unique } from './common.mjs';
export function collectHwpx({ sdk, sectionCount }) {
  const warnings = [],
    sections = [];
  for (let section = 0; section < sectionCount; section++) {
    const source = { section },
      get = (name) => call(sdk, name, [section], warnings, source);
    const flowResult = get('paragraphFlow'),
      flows = array(flowResult, warnings, 'paragraphFlow', source),
      flowMap = unique(flows, (r) => r.paragraph, warnings, 'paragraphFlow');
    const snapshot = get('paragraphTextSnapshot'),
      rows = array(snapshot, warnings, 'paragraphTextSnapshot', source);
    const observedRows = rows.slice();
    const observedIds = new Set(rows.map((row) => row.paragraph));
    for (const flow of flows)
      if (!observedIds.has(flow.paragraph)) {
        observedRows.push({ paragraph: flow.paragraph });
        observedIds.add(flow.paragraph);
      }
    const paragraphs = observedRows.map((row) => {
      const flow = flowMap.get(row.paragraph);
      return {
        paragraph: row.paragraph,
        node: uint(flow?.source_node) ? flow.source_node : null,
        identityKnown: uint(flow?.source_node),
        displayText: typeof row.text === 'string' ? row.text : null,
        flow: flow ?? null,
      };
    });
    const bindings = get('tableBindings'),
      placements = get('tablePlacements'),
      tableInventory = get('tableBorderSources'),
      areas = get('pageAreaDeclarations');
    for (const [name, result] of Object.entries({ bindings, placements, areas }))
      array(result, warnings, name, source);
    if (
      tableInventory.ok &&
      (!tableInventory.value || !Array.isArray(tableInventory.value.cells))
    ) {
      warnings.push({ code: 'InvalidObservation', message: 'tableBorderSources', source });
      tableInventory.ok = false;
    }
    const sitesResult = get('pictureSites'),
      ownersResult = get('pictureOwners');
    const owners = unique(
      array(ownersResult, warnings, 'pictureOwners', source),
      (row) => row.pictureNode,
      warnings,
      'picture owner',
    );
    const sites = array(sitesResult, warnings, 'pictureSites', source).slice();
    const inventoryPictures = new Set(
      sites.filter((row) => uint(row?.pictureNode)).map((row) => row.pictureNode),
    );
    const seenPictures = new Set(sites.map((row) => row.pictureNode));
    for (const owner of owners.values())
      if (owner && !seenPictures.has(owner.pictureNode)) {
        sites.push({ pictureNode: owner.pictureNode, paragraph: owner.owner?.paragraph ?? null });
        seenPictures.add(owner.pictureNode);
      }
    const pictures = sites.map((row) => {
      const owner = owners.get(row.pictureNode),
        proof = owner?.owner;
      const parentParagraph = proof && row.paragraph === proof.paragraph ? proof.paragraph : null;
      // No per-picture resource/byte requests, OCR or derived dimensions.
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
    const objects = new Map();
    let objectsKnown = true;
    const addObject = (row) => {
      if (!uint(row.node)) {
        objectsKnown = false;
        return;
      }
      const previous = objects.get(row.node);
      if (previous && previous.kind !== row.kind) throw new Error('ConflictingObjectKind');
      if (!previous) objects.set(row.node, { ...row, siteKnown: true });
    };
    const inventory = (method) => {
      const result = get(method);
      const rows = array(result, warnings, method, source);
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
      for (const node of inventory(method))
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
    sections.push({
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
    });
  }
  return { sections, warnings };
}

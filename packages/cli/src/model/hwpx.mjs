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
        pictureNode: row.pictureNode,
        parentParagraph,
        sourceInfo: { section, pictureNode: row.pictureNode },
        width: null,
        height: null,
        reason: uint(parentParagraph) ? null : (owner?.error ?? 'PictureOwnerUnverified'),
      };
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
      format: 'hwpx',
    });
  }
  return { sections, warnings };
}

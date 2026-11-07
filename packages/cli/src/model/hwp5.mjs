import { call, array, uint, unique, diagnostic } from './common.mjs';
export function collectHwp5({ sdk, sectionCount }) {
  const warnings = [],
    sections = [];
  const preview = call(sdk, 'currentTextPreview', [], warnings);
  const previewSections = unique(
    array(
      { ok: preview.ok, value: preview.value?.sections },
      warnings,
      'currentTextPreview.sections',
    ),
    (row) => row.index,
    warnings,
    'preview section',
  );
  for (let section = 0; section < sectionCount; section++) {
    const source = { section };
    const get = (name) => call(sdk, name, [section], warnings, source);
    const flowResult = get('paragraphFlow'),
      flows = array(flowResult, warnings, 'paragraphFlow', source);
    const flowMap = unique(flows, (r) => r.paragraph, warnings, 'paragraphFlow');
    const countResult = get('paragraphCount');
    const count =
      countResult.ok && uint(countResult.value) && countResult.value <= 100000
        ? countResult.value
        : null;
    const previewRows = previewSections.get(section)?.paragraphs;
    const paragraphs = [];
    const ordinals =
      count !== null
        ? Array.from({ length: count }, (_, ordinal) => ordinal)
        : [...new Set(flows.map((row) => row.paragraph))];
    for (const paragraph of ordinals) {
      const p = previewRows?.[paragraph],
        flow = flowMap.get(paragraph);
      const node = uint(flow?.source_node)
        ? flow.source_node
        : uint(p?.nodeIndex)
          ? p.nodeIndex
          : null;
      let displayText = typeof p?.text === 'string' && p.textPresent === true ? p.text : null;
      let identityKnown = uint(node) && flow?.generated !== true;
      if (uint(p?.nodeIndex) && uint(flow?.source_node) && p.nodeIndex !== flow.source_node) {
        identityKnown = false;
        displayText = null;
        warnings.push(
          diagnostic('ParagraphSourceMismatch', 'Native source identities disagree', {
            section,
            paragraph,
          }),
        );
      }
      paragraphs.push({
        paragraph,
        node,
        identityKnown,
        displayText,
        flow: flow ?? null,
      });
    }
    const bindings = get('tableBindings'),
      placements = get('tablePlacements'),
      tableInventory = get('tableLayoutSources'),
      cellInventory = get('cellLayoutSources'),
      areas = get('pageAreaSources');
    for (const [name, result] of Object.entries({
      bindings,
      placements,
      tableInventory,
      cellInventory,
      areas,
    }))
      array(result, warnings, name, source);
    const anchors = get('tableAnchors'),
      drawingSources = get('drawingSources'),
      drawingAnchors = get('drawingAnchors');
    const pictureResult = call(sdk, 'pictureSources', [section, 'base73'], warnings, source);
    const drawByComponent = unique(
      array(drawingSources, warnings, 'drawingSources', source),
      (r) => r.component_node,
      warnings,
      'drawing component',
    );
    const anchorByComponent = unique(
      array(drawingAnchors, warnings, 'drawingAnchors', source),
      (r) => r.component_node,
      warnings,
      'drawing anchor',
    );
    const pictures = array(pictureResult, warnings, 'pictureSources', source).map((row) => {
      const draw = drawByComponent.get(row.component_node),
        anchor = anchorByComponent.get(row.component_node);
      const owner =
        draw?.control_node === row.owner_node && anchor?.control_node === row.owner_node;
      return {
        pictureNode: row.component_node,
        parentParagraph: owner && uint(anchor.paragraph) ? anchor.paragraph : null,
        sourceInfo: {
          section,
          pictureNode: row.component_node,
          recordNode: row.picture_node,
          componentNode: row.component_node,
          ownerNode: row.owner_node,
          resourceId: row.bin_data_id,
        },
        width: owner && uint(draw.width) ? draw.width : null,
        height: owner && uint(draw.height) ? draw.height : null,
        reason: owner ? null : 'PictureOwnerUnverified',
      };
    });
    const representedPictures = new Set(pictures.map((row) => row.pictureNode));
    let fallbackPictures = 0;
    for (const draw of drawByComponent.values()) {
      if (draw?.kind_id !== 0x24706963 || representedPictures.has(draw.component_node)) continue;
      const anchor = anchorByComponent.get(draw.component_node);
      const ownerKnown = anchor?.control_node === draw.control_node && uint(anchor?.paragraph);
      pictures.push({
        pictureNode: draw.component_node,
        parentParagraph: ownerKnown ? anchor.paragraph : null,
        sourceInfo: {
          section,
          pictureNode: draw.component_node,
          componentNode: draw.component_node,
          ownerNode: draw.control_node,
        },
        width: uint(draw.width) ? draw.width : null,
        height: uint(draw.height) ? draw.height : null,
        reason: 'PictureSourceUnobserved',
      });
      fallbackPictures++;
      warnings.push(
        diagnostic(
          'PictureSourceUnobserved',
          'Native drawing proves an image exists, but its picture profile metadata is unavailable',
          { section },
        ),
      );
    }
    sections.push({
      section,
      paragraphs,
      paragraphTotal: count,
      flowsKnown: flowResult.ok,
      bindings,
      placements,
      tableInventory,
      cellInventory,
      areas,
      anchors,
      pictures,
      picturesKnown: pictureResult.ok && fallbackPictures === 0,
      format: 'hwp5',
    });
  }
  return { sections, warnings };
}

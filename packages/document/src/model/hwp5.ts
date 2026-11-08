import type {
  ObservationSdk,
  Observation,
  Diagnostic,
  DocumentObservations,
  SectionObservation,
  PreviewSection,
  ParagraphFlow,
  ParagraphObservation,
  PictureObservation,
  ObjectObservation,
  NativeDrawing,
  NativePicture,
  TableBinding,
  TablePlacement,
  TableLayout,
  CellLayout,
  PageAreaObservation,
} from '../types/document-view.ts';
import { call, array, uint, unique, diagnostic } from './common.ts';
export function collectHwp5({
  sdk,
  sectionCount,
}: {
  sdk: ObservationSdk;
  sectionCount: number;
}): DocumentObservations {
  const warnings: Diagnostic[] = [],
    sections: SectionObservation[] = [];
  const preview = call<{ sections: PreviewSection[] }>(sdk, 'currentTextPreview', [], warnings);
  const previewSections = unique(
    array<PreviewSection>(
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
    const get = <T = unknown>(name: string): Observation<T> =>
      call<T>(sdk, name, [section], warnings, source);
    const flowResult = get<ParagraphFlow[]>('paragraphFlow'),
      flows = array<ParagraphFlow>(flowResult, warnings, 'paragraphFlow', source);
    const flowMap = unique(flows, (r) => r.paragraph, warnings, 'paragraphFlow');
    const countResult = get('paragraphCount');
    const count =
      countResult.ok && uint(countResult.value) && countResult.value <= 100000
        ? countResult.value
        : null;
    const previewRows = previewSections.get(section)?.paragraphs;
    const paragraphs: ParagraphObservation[] = [],
      objectTokens: { paragraph: number; anchorUnit: number; identityKnown: boolean }[] = [];
    let objectTokensKnown =
      count !== null && preview.ok && Array.isArray(previewRows) && previewRows.length === count;
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
      // 텍스트 레코드의 부재와 표시 텍스트의 미관측은 다릅니다.
      const emptyParagraph =
        p?.textPresent === false &&
        p.text === '' &&
        uint(p.nodeIndex) &&
        uint(p.declaredUnits) &&
        p.declaredUnits <= 1 &&
        Array.isArray(p.tokens) &&
        p.tokens.length === 0;
      let displayText =
        typeof p?.text === 'string' && (p.textPresent === true || emptyParagraph) ? p.text : null;
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
      if (!Array.isArray(p?.tokens)) objectTokensKnown = false;
      else
        for (const token of p.tokens) {
          if (token?.type !== 'control' || token.code !== 11) continue;
          if (!uint(token.startUnit)) {
            objectTokensKnown = false;
            continue;
          }
          objectTokens.push({ paragraph, anchorUnit: token.startUnit, identityKnown });
        }
    }
    const bindings = get<TableBinding[]>('tableBindings'),
      placements = get<TablePlacement[]>('tablePlacements'),
      tableInventory = get<TableLayout[]>('tableLayoutSources'),
      cellInventory = get<CellLayout[]>('cellLayoutSources'),
      areas = get<PageAreaObservation[]>('pageAreaSources');
    for (const [name, result] of Object.entries({
      bindings,
      placements,
      tableInventory,
      cellInventory,
      areas,
    }))
      array(result, warnings, name, source);
    const anchors = get<NativeDrawing[]>('tableAnchors'),
      drawingSources = get<NativeDrawing[]>('drawingSources'),
      drawingAnchors = get<NativeDrawing[]>('drawingAnchors');
    const pictureResult = call<NativePicture[]>(
      sdk,
      'pictureSources',
      [section, 'base73'],
      warnings,
      source,
    );
    const drawByComponent = unique(
      array<NativeDrawing>(drawingSources, warnings, 'drawingSources', source),
      (r) => r.component_node,
      warnings,
      'drawing component',
    );
    const anchorByComponent = unique(
      array<NativeDrawing>(drawingAnchors, warnings, 'drawingAnchors', source),
      (r) => r.component_node,
      warnings,
      'drawing anchor',
    );
    const pictures: PictureObservation[] = array<NativePicture>(
      pictureResult,
      warnings,
      'pictureSources',
      source,
    ).map((row) => {
      const draw = drawByComponent.get(row.component_node),
        anchor = anchorByComponent.get(row.component_node);
      const owner =
        draw?.control_node === row.owner_node && anchor?.control_node === row.owner_node;
      return {
        inventorySiteKnown:
          uint(row.component_node) &&
          uint(row.picture_node) &&
          uint(row.owner_node) &&
          uint(row.bin_data_id) &&
          row.bin_data_id > 0,
        pictureNode: row.component_node,
        parentParagraph: owner && uint(anchor?.paragraph) ? anchor.paragraph : null,
        sourceInfo: {
          section,
          pictureNode: row.component_node,
          recordNode: row.picture_node,
          componentNode: row.component_node,
          ownerNode: row.owner_node,
          resourceId: row.bin_data_id,
        },
        width: owner && uint(draw?.width) ? draw.width : null,
        height: owner && uint(draw?.height) ? draw.height : null,
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
        inventorySiteKnown: false,
        pictureNode: draw.component_node,
        parentParagraph: ownerKnown ? anchor.paragraph : null,
        sourceInfo: {
          section,
          pictureNode: draw.component_node,
          componentNode: draw.component_node,
          ownerNode: draw.control_node,
        },
        width: uint(draw?.width) ? draw.width : null,
        height: uint(draw?.height) ? draw.height : null,
        reason: 'PictureSourceUnobserved',
      });
      representedPictures.add(draw.component_node);
      fallbackPictures++;
      warnings.push(
        diagnostic(
          'PictureSourceUnobserved',
          'Native drawing proves an image exists, but its picture profile metadata is unavailable',
          { section },
        ),
      );
    }
    const objects: ObjectObservation[] = [];
    const componentsResult = get<NativeDrawing[]>('drawingComponentSources');
    const components = unique(
      array<NativeDrawing>(componentsResult, warnings, 'drawingComponentSources', source),
      (r) => r.component_node,
      warnings,
      'drawing component inventory',
    );
    let componentsKnown = componentsResult.ok;
    for (const row of components.values()) {
      if (!row || !uint(row.component_node) || !uint(row.kind_id) || !uint(row.owner_node)) {
        componentsKnown = false;
        continue;
      }
      if (row.kind_id === 0x24706963) {
        if (!representedPictures.has(row.component_node)) {
          representedPictures.add(row.component_node);
          pictures.push({
            pictureNode: row.component_node,
            inventorySiteKnown: false,
            parentParagraph: null,
            sourceInfo: {
              section,
              pictureNode: row.component_node,
              componentNode: row.component_node,
              ownerNode: row.owner_node,
            },
            reason: 'PictureSourceUnobserved',
          });
          fallbackPictures++;
        }
        continue;
      }
      const drawing = drawByComponent.get(row.component_node),
        anchor = anchorByComponent.get(row.component_node);
      const ownerKnown =
        drawing &&
        anchor &&
        drawing.control_node === anchor.control_node &&
        drawing.control_node === row.owner_node;
      objects.push({
        kind: 'drawing',
        node: row.component_node,
        siteKnown: true,
        parentParagraph: ownerKnown && uint(anchor?.paragraph) ? anchor.paragraph : null,
        parentObjectNode:
          components.get(row.owner_node)?.kind_id === 0x24636f6e ? row.owner_node : null,
        nativeKind: row.kind_id,
        reason: ownerKnown ? 'ObjectDetailsDeferred' : 'ObjectOwnerUnverified',
      });
    }
    // 객체 토큰은 SDK가 분류한 code와 현재 위치만 사용합니다. raw 제어 ID를 해석하지 않습니다.
    const knownAnchors = new Set();
    let anchorsKnown = anchors.ok && drawingAnchors.ok;
    for (const row of [
      ...array<NativeDrawing>(anchors, warnings, 'tableAnchors', source),
      ...array<NativeDrawing>(drawingAnchors, warnings, 'drawingAnchors', source),
    ]) {
      if (!uint(row?.paragraph) || !uint(row?.current_unit)) {
        anchorsKnown = false;
        continue;
      }
      knownAnchors.add(`${row.paragraph}:${row.current_unit}`);
    }
    const tokenCounts = new Map();
    for (const token of objectTokens) {
      const key = `${token.paragraph}:${token.anchorUnit}`;
      tokenCounts.set(key, (tokenCounts.get(key) ?? 0) + 1);
    }
    const seenTokens = new Set();
    for (const token of objectTokens) {
      const key = `${token.paragraph}:${token.anchorUnit}`;
      if (seenTokens.has(key)) {
        objectTokensKnown = false;
        continue;
      }
      seenTokens.add(key);
      const located = anchorsKnown && token.identityKnown && tokenCounts.get(key) === 1;
      if (located && knownAnchors.has(key)) continue;
      objects.push({
        kind: 'unknown',
        node: null,
        siteKnown: false,
        parentParagraph: located ? token.paragraph : null,
        paragraph: token.paragraph,
        anchorUnit: token.anchorUnit,
        reason: located ? 'UnclassifiedExtendedObject' : 'ObjectAnchorInventoryUnavailable',
      });
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
      objects,
      objectsKnown: componentsKnown && objectTokensKnown && anchorsKnown,
      objectInventoryScope: 'hwp5-drawing-components-and-typed-code11-signals',
      format: 'hwp5',
    });
  }
  return { sections, warnings };
}

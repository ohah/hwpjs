import { translatePicturePlacement } from './picture-placement-translation.mjs';
import { inlinePictureIndex } from './picture-inline.mjs';
import { pictureReferenceSpace } from './picture-reference-space.mjs';
import { textMeasurement } from './text-measurement.mjs';
import { layoutContent } from './layout.mjs';
import { compactTerminalTextFlow } from './terminal-text-flow.mjs';
import { measureInlineObjectParagraph } from './inline-object-paragraph-measurement.mjs';

// Ownership stays on the source cell; paragraph-local flow only shifts references.
export function inspectNestedCellPictureSources(input) {
  const fail = (reason, picture) => ({
    state: 'unavailable',
    error: 'UnsupportedNestedCellPictureSource',
    nestedCellPictureReason: reason,
    ...(picture ? { pictureNode: picture.pictureNode, paragraph: picture.paragraph } : {}),
  });
  for (const picture of input.pictures) {
    if (picture.state !== 'located') return fail('unlocated-picture', picture);
    if (picture.captionPartial) return fail('incomplete-caption', picture);
    if (
      picture.caption &&
      (picture.geometry?.treatAsCharacter !== false || picture.caption.side !== 3)
    )
      return fail('caption-flow', picture);
    if (picture.owner?.anchorNode !== picture.pictureNode) return fail('anchor-owner', picture);
    if (![true, false].includes(picture.geometry?.treatAsCharacter))
      return fail('missing-inline-policy', picture);
  }
  const inline = input.pictures.filter((p) => p.geometry.treatAsCharacter === true);
  const pictures = inlinePictureIndex({ paragraphs: input.paragraphs, pictures: inline });
  if (pictures.size !== inline.length || [...pictures.values()].some((p) => !p))
    return fail('inline-picture-index');
  const floating = input.pictures.filter((p) => p.geometry.treatAsCharacter === false);
  const units = new Set();
  for (const picture of input.pictures) {
    const owners = input.paragraphs.filter(
      (owner) => owner.section === picture.section && owner.paragraph === picture.paragraph,
    );
    const key = `${picture.section}:${picture.paragraph}:${picture.anchorUnit}`;
    if (
      owners.length !== 1 ||
      (owners[0].textStartUnit ?? 0) !== 0 ||
      owners[0].text[picture.anchorUnit] !== '\ufffc'
    )
      return fail('paragraph-anchor', picture);
    if (units.has(key)) return fail('duplicate-anchor', picture);
    units.add(key);
  }
  return { state: 'indexed', pictures, floating };
}

export function nestedCellPictureSources(input) {
  const result = inspectNestedCellPictureSources(input);
  return result.state === 'indexed'
    ? { pictures: result.pictures, floating: result.floating }
    : null;
}

export function measureNestedCellPictureParagraph(
  input,
  paragraph,
  entries,
  zeroWidthUnits,
  height,
  floating,
  previous,
  overflow,
) {
  const current = floating.filter(
    (p) => p.section === paragraph.section && p.paragraph === paragraph.paragraph,
  );
  const references = pictureReferenceSpace(input.pictureReferences, { x: 0, y: height });
  if (references.state !== 'mapped')
    return { state: 'unavailable', error: 'InvalidTableCellPictureReferences' };
  const shiftedPrevious = previous.map((p) => translatePicturePlacement(p, 0, -height));
  if (shiftedPrevious.some((p) => p.state !== 'translated'))
    return { state: 'unavailable', error: 'InvalidNestedPictureProjection' };
  const pictureFlow =
    current.length || previous.length
      ? {
          pictures: current,
          placedPictures: shiftedPrevious.map((p) => p.picture),
          pictureFlowContext: {
            captionParagraphs: input.captionParagraphs,
            captionMeasure: input.measure,
            cell: { tableNode: input.table.tableNode, listNode: input.cell.listNode },
            references: references.boxes,
          },
        }
      : null;
  const overlays = [...zeroWidthUnits, ...current.map((p) => p.anchorUnit)];
  const measure = (text, owner, unit, kind) =>
    kind === 'text' && overlays.includes(unit) && text !== ''
      ? { ...textMeasurement(input.measure('', owner, unit, kind)), width: 0 }
      : input.measure(text, owner, unit, kind);
  let flow = entries.length
    ? measureInlineObjectParagraph(paragraph, entries, input.width, measure, {
        maxRows: input.maxRows,
        allowLineOverflow: overflow !== 'reject',
        compactLines: true,
        includeTerminalAfter: paragraph !== input.paragraphs.at(-1),
        zeroWidthUnits: overlays,
        pictureFlow,
      })
    : compactTerminalTextFlow(
        layoutContent(
          { ...pictureFlow, paragraphs: [paragraph], limited: false },
          input.width,
          measure,
          input.maxRows,
          { documentBody: true, includeTerminalAfter: paragraph !== input.paragraphs.at(-1) },
        ),
      );
  if (flow.state === 'unavailable')
    return flow.error === 'UnsupportedInlinePictureFlow'
      ? { ...flow, error: 'UnsupportedNestedCellPictureSource' }
      : flow;
  if (pictureFlow && !flow.spatialRows)
    return { state: 'unavailable', error: 'UnsupportedNestedCellPictureSource' };
  const added = (flow.flowPictures ?? []).filter(
    (p) => p.paragraph === paragraph.paragraph && p.section === paragraph.section,
  );
  if (
    added.length !== current.length ||
    current.some(
      (source) =>
        added.filter(
          (p) => p.pictureNode === source.pictureNode && p.anchorUnit === source.anchorUnit,
        ).length !== 1,
    )
  )
    return { state: 'unavailable', error: 'UnsupportedNestedCellPictureSource' };
  const shifted = added.map((p) => translatePicturePlacement(p, 0, height));
  if (shifted.some((p) => p.state !== 'translated'))
    return { state: 'unavailable', error: 'InvalidNestedPictureProjection' };
  const occupiedBottom = added.reduce(
    (end, p) =>
      [0, 1].includes(p.flow?.textWrap)
        ? Math.max(
            end,
            (p.flowRectangle ?? p.rectangle).y + (p.flowRectangle ?? p.rectangle).height,
          )
        : end,
    flow.height,
  );
  return { ...flow, height: occupiedBottom, flowPictures: shifted.map((p) => p.picture) };
}

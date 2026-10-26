import { layoutPictureBodyContent } from './picture-body-content-layout.mjs';
import { notePageScenes } from './note-page-scenes.mjs';
import { notePlanningFrame, columnNotePictureReference } from './note-planning-frame.mjs';
import { previewPictureLayers } from './picture-layers.mjs';
import { equationTextAnchors, equationTextMeasure } from './equation-text-anchors.mjs';
import { structuralAnchorUnits } from './structural-anchor-units.mjs';

/** Scope independent note pictures before adapting their proven list to body flow. */
export function measurePictureNoteBody(
  content,
  note,
  paragraphs,
  tables,
  createdTables,
  width,
  measure,
  maxRows,
  endnoteContext,
) {
  const ids = new Set(paragraphs.map((p) => p.paragraph));
  const pictures = (content.pictures ?? []).filter(
    (p) => p.section === note.section && ids.has(p.paragraph),
  );
  if (!pictures.length || tables.length || createdTables.length) return null;
  const fail = (error) => ({ state: 'unavailable', error });
  if (content.pageSettings?.length !== 1) return fail('UnsupportedPictureNoteScope');
  for (const [key, host] of [
    ['drawings', 'hostParagraph'],
    ['containers', 'hostParagraph'],
    ['lines', 'paragraph'],
    ['rectangles', 'hostParagraph'],
    ['polygons', 'paragraph'],
    ['ellipses', 'paragraph'],
  ])
    if (content[key]?.some((item) => item.section === note.section && ids.has(item[host])))
      return fail('UnsupportedPictureNoteObjects');
  const pictureIds = new Set(),
    positions = new Set();
  for (const p of pictures) {
    const host = paragraphs.find(
        (row) => row.paragraph === p.paragraph && row.section === p.section,
      ),
      key = `${p.paragraph}:${p.anchorUnit}`;
    if (
      !host ||
      host.tableCell ||
      host.drawingText ||
      host.drawingCaption ||
      p.owner?.anchorNode !== p.pictureNode ||
      p.owner.paragraph !== p.paragraph ||
      p.owner.anchorUnit !== p.anchorUnit ||
      host.text[p.anchorUnit] !== '\ufffc' ||
      p.caption != null ||
      pictureIds.has(p.pictureNode) ||
      positions.has(key)
    )
      return fail('InvalidPictureNoteOwner');
    pictureIds.add(p.pictureNode);
    positions.add(key);
  }
  const flows = [],
    structuralByParagraph = new Map();
  for (const p of paragraphs) {
    const matches = content.paragraphFlows.filter(
        (f) => f.section === note.section && f.paragraph === p.paragraph,
      ),
      flow = matches[0];
    if (
      matches.length !== 1 ||
      flow.host !== note.kind ||
      flow.top_level !== false ||
      flow.note_context?.note_node !== note.noteNode ||
      flow.note_context?.list_node !== note.listNode ||
      flow.note_context?.kind !== note.kind ||
      (flow.column_declaration !== null && flow.column_declaration?.count !== 1)
    )
      return fail('InvalidPictureNoteOwner');
    const equations = equationTextAnchors(p);
    if (equations.state !== 'resolved')
      return {
        ...fail('UnsupportedPictureNoteEquation'),
        section: p.section,
        paragraph: p.paragraph,
        equationNode: equations.equationNode,
      };
    let structural;
    try {
      structural = structuralAnchorUnits(p);
    } catch {
      return fail('InvalidPictureNoteAnchor');
    }
    structuralByParagraph.set(p.paragraph, structural);
    const anchors = [
      ...structural,
      ...equations.anchors.map((e) => e.anchorUnit),
      ...(p.automaticNumbers ?? []).map((a) => a.unit),
      ...pictures.filter((pic) => pic.paragraph === p.paragraph).map((pic) => pic.anchorUnit),
    ];
    if (
      new Set(anchors).size !== anchors.length ||
      anchors.some((unit) => p.text[unit] !== '\ufffc')
    )
      return fail('InvalidPictureNoteAnchor');
    for (let unit = 0; unit < p.text.length; unit++)
      if (p.text[unit] === '\ufffc' && !anchors.includes(unit))
        return fail('UnsupportedPictureNoteAnchor');
    flows.push({ ...flow, host: 'body', top_level: true, single_column: true });
  }
  const frame = notePlanningFrame(content, note, width, endnoteContext);
  if (frame.state !== 'selected')
    return { ...fail('UnsupportedPictureNoteWidth'), sourceError: frame.error };
  if (frame.localColumn && pictures.some((p) => !columnNotePictureReference(p)))
    return fail('UnsupportedNoteColumnPictureReference');
  const view = {
    ...content,
    pageSettings: [frame.setting],
    paragraphs,
    paragraphFlows: flows,
    pictures,
    tables: [],
    drawings: [],
    lines: [],
    containers: [],
    rectangles: [],
    polygons: [],
    ellipses: [],
    groupRectangles: [],
    createdTables: [],
  };
  const baseMeasure = equationTextMeasure(measure);
  const layout = layoutPictureBodyContent(
    view,
    (text, p, unit, kind) =>
      kind === 'text' && text !== '' && structuralByParagraph.get(p.paragraph).has(unit)
        ? { ...baseMeasure('', p, unit, kind), width: 0 }
        : baseMeasure(text, p, unit, kind),
    maxRows,
    { firstPageTopInset: frame.localColumn ? (endnoteContext.firstPageTopInset ?? 0) : 0 },
  );
  if (layout.state !== 'paginated') return { ...layout, noteNode: note.noteNode };
  if (note.kind === 'footnote' && layout.pages.length !== 1)
    return fail('UnsupportedPictureFootnoteContinuation');
  const layers = previewPictureLayers(view, layout, width);
  const scenes = notePageScenes(
    { ...layout, boxes: layout.boxes ?? [], placedDrawings: [], placedContainers: [] },
    { front: [], behind: [] },
    layers,
    width,
  );
  if (scenes.state !== 'measured') return scenes;
  return {
    ...scenes,
    ...(scenes.scenePages.length === 1 ? { scenePages: undefined } : {}),
    numberPrefixes: [],
    atomicScene: true,
    rowCount: scenes.rows.length,
    ownedPictures: pictures.map((p) => ({
      section: p.section,
      pictureNode: p.pictureNode,
      paragraph: p.paragraph,
      anchorUnit: p.anchorUnit,
    })),
  };
}

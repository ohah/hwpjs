import { layoutGroupPictureBody } from './group-picture-body-layout.mjs';
import { notePageScenes } from './note-page-scenes.mjs';
import { notePlanningFrame, columnNotePictureReference } from './note-planning-frame.mjs';
import { previewPictureLayers } from './picture-layers.mjs';
import { previewRectangleLayers } from './rectangle-layers.mjs';
import { groupedLayoutCoverage } from './grouped-layout-coverage.mjs';
import { equationTextAnchors, equationTextMeasure } from './equation-text-anchors.mjs';
import { groupShapeChildren } from './group-shape-children.mjs';

/** Null means no group owner. Never turn absent child geometry into a root. */
export function measureGroupedNoteBody(
  content,
  note,
  selected,
  tables,
  createdTables,
  width,
  measure,
  maxRows,
  endnoteContext,
) {
  const fail = (error) => ({ state: 'unavailable', error });
  const direct = new Set(note.paragraphs);
  const roots = (content.containers ?? []).filter(
    (root) =>
      root.section === note.section &&
      root.source?.group_context === null &&
      direct.has(root.hostParagraph),
  );
  if (!roots.length) return null;
  if (note.kind !== 'endnote' || createdTables.length || content.pageSettings?.length !== 1)
    return fail('UnsupportedGroupedNoteBody');
  const rootIds = new Set(roots.map((root) => root.containerNode));
  if (rootIds.size !== roots.length) return fail('AmbiguousGroupedNoteOwner');
  const containers = content.containers.filter(
    (c) =>
      c.section === note.section &&
      (rootIds.has(c.containerNode) || rootIds.has(c.source.group_context?.root_anchor)),
  );
  const drawings = (content.drawings ?? []).filter(
    (d) => d.section === note.section && rootIds.has(d.source.group_context?.root_anchor),
  );
  const rectangles = (content.rectangles ?? []).filter(
    (d) => d.section === note.section && rootIds.has(d.source.group_context?.root_anchor),
  );
  const groupCurves = (content.groupCurves ?? []).filter(
    (c) => c.section === note.section && rootIds.has(c.source?.common?.group_context?.root_anchor),
  );
  const curveTextSources = (content.curveTextSources ?? []).filter(
    (c) => c.section === note.section && rootIds.has(c.source?.common?.group_context?.root_anchor),
  );
  const drawingIds = new Set([
    ...drawings.map((d) => d.drawingNode),
    ...curveTextSources.map((c) => c.curveNode),
  ]);
  const childIds = new Set();
  try {
    for (const container of containers)
      for (const child of groupShapeChildren(container.source))
        if (child.kind !== 'metadata') childIds.add(child.node);
  } catch {
    return fail('InvalidGroupedNoteSource');
  }
  if (
    content.paragraphs.some(
      (p) =>
        p.section === note.section &&
        childIds.has(p.drawingText?.drawingNode) &&
        !drawingIds.has(p.drawingText.drawingNode),
    )
  )
    return fail('MissingGroupedNoteTextOwner');
  const extraParagraphs = content.paragraphs.filter(
    (p) =>
      p.section === note.section &&
      !selected.some((s) => s.paragraph === p.paragraph) &&
      (drawingIds.has(p.drawingText?.drawingNode) ||
        drawingIds.has(p.drawingCaption?.drawingNode) ||
        rootIds.has(p.drawingCaption?.drawingNode)),
  );
  const paragraphs = [...selected, ...extraParagraphs].toSorted(
      (a, b) => a.paragraph - b.paragraph,
    ),
    ids = new Set(paragraphs.map((p) => p.paragraph));
  const flows = [];
  for (const paragraph of paragraphs) {
    const sources = content.paragraphFlows.filter(
      (f) => f.section === note.section && f.paragraph === paragraph.paragraph,
    );
    if (sources.length !== 1) return fail('AmbiguousGroupedNoteFlow');
    const flow = sources[0];
    if (!direct.has(paragraph.paragraph)) {
      flows.push(flow);
      continue;
    }
    if (
      flow.host !== note.kind ||
      flow.top_level !== false ||
      flow.note_context?.note_node !== note.noteNode ||
      flow.note_context.list_node !== note.listNode ||
      flow.note_context.kind !== note.kind
    )
      return fail('InvalidGroupedNoteOwner');
    if (flow.column_declaration !== null && flow.column_declaration?.count !== 1)
      return fail('UnsupportedGroupedNoteColumns');
    const declaration = flow.column_declaration ?? {
      count: 1,
      same_size: true,
      gap: 0,
      direction: 'left',
      kind: 'newspaper',
      ambiguous: false,
    };
    flows.push({
      ...flow,
      host: 'body',
      top_level: true,
      single_column: true,
      column_declaration: declaration,
      column_start_declaration: declaration,
    });
  }
  for (const paragraph of paragraphs) {
    const equations = equationTextAnchors(paragraph);
    if (equations.state !== 'resolved')
      return {
        ...fail('UnsupportedGroupedNoteEquation'),
        section: paragraph.section,
        paragraph: paragraph.paragraph,
        equationNode: equations.equationNode,
        sourceError: content.equationPaintErrors?.find(
          (error) => error.section === paragraph.section && error.node === equations.equationNode,
        )?.error,
      };
  }
  const frame = notePlanningFrame(content, note, width, endnoteContext);
  if (frame.state !== 'selected')
    return { ...fail('UnsupportedGroupedNoteWidth'), sourceError: frame.error };
  const pictures = (content.pictures ?? []).filter(
    (p) => p.section === note.section && (ids.has(p.paragraph) || rootIds.has(p.owner?.anchorNode)),
  );
  if (
    frame.localColumn &&
    (pictures.some((p) => !columnNotePictureReference(p)) ||
      roots.some(
        (r) =>
          r.source.geometry?.treat_as_character !== true ||
          r.source.geometry.width_relative !== 4 ||
          r.source.geometry.height_relative !== 2,
      ))
  )
    return fail('UnsupportedNoteColumnGroupReference');
  const view = {
    ...content,
    pageSettings: [frame.setting],
    paragraphs,
    paragraphFlows: flows,
    tables,
    createdTables,
    containers,
    drawings,
    rectangles,
    pictures,
    groupCurves,
    curveTextSources,
    lines: [],
    polygons: [],
    ellipses: [],
    groupRectangles: (content.groupRectangles ?? []).filter(
      (r) =>
        r.section === note.section && containers.some((c) => c.containerNode === r.parentContainer),
    ),
  };
  const layout = layoutGroupPictureBody(view, equationTextMeasure(measure), maxRows, {
    firstPageTopInset: frame.localColumn ? (endnoteContext.firstPageTopInset ?? 0) : 0,
  });
  if (layout.state !== 'paginated') return layout;
  if (layout.limited) return fail('UnsupportedGroupedNoteContinuation');
  const rectangleLayers = previewRectangleLayers(view, layout),
    pictureLayers = previewPictureLayers(view, layout, width);
  const coverage = groupedLayoutCoverage(view, layout, rectangleLayers, pictureLayers);
  if (coverage.length !== roots.length || coverage.some((c) => !c.complete))
    return { ...fail('IncompleteGroupedNoteScene'), groups: coverage };
  const scenes = notePageScenes(layout, rectangleLayers, pictureLayers, width);
  if (scenes.state !== 'measured') return scenes;
  return {
    ...scenes,
    rowCount: scenes.rows.length,
    ...(scenes.scenePages.length === 1 ? { scenePages: undefined } : {}),
    numberPrefixes: [],
    atomicScene: true,
    extraParagraphs,
    ownedDrawings: drawings.map((d) => ({ section: d.section, drawingNode: d.drawingNode })),
    ownedCurves: curveTextSources.map((c) => ({ section: c.section, curveNode: c.curveNode })),
    ownedContainers: containers.map((c) => ({
      section: c.section,
      containerNode: c.containerNode,
    })),
    ownedRectangles: rectangles.map((d) => ({ section: d.section, drawingNode: d.drawingNode })),
    ownedPictures: pictures.map((p) => ({
      section: p.section,
      pictureNode: p.pictureNode,
      paragraph: p.paragraph,
      anchorUnit: p.anchorUnit,
    })),
  };
}

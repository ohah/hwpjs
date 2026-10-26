import { projectNoteFlowPictures } from './note-picture-projection.mjs';
import { moveLayoutRow, moveLayoutPlacement } from './layout-world-offset.mjs';
import { moveCurvePlacement } from './curve-world-offset.mjs';
/** Shared endnote planning/projection; source note ownership remains unchanged. */
export function prepareEndnoteBodyFlow(
  notes,
  policy,
  separator,
  sourceFlows,
  { sceneColumns = false } = {},
) {
  if (
    !Array.isArray(notes) ||
    policy?.state !== 'selected' ||
    policy.kind !== 'endnote' ||
    !Number.isSafeInteger(policy.section) ||
    policy.section < 0 ||
    !Array.isArray(sourceFlows) ||
    sourceFlows.some((flow) => !flow) ||
    ![policy.aboveLine, policy.belowLine, policy.betweenNotes, separator?.height].every(
      (n) => Number.isFinite(n) && n >= 0,
    ) ||
    notes.some(
      (note) =>
        !note ||
        note.kind !== 'endnote' ||
        note.section !== policy.section ||
        !Number.isSafeInteger(note.noteNode) ||
        note.noteNode < 0 ||
        !Array.isArray(note.paragraphs) ||
        !note.paragraphs.length ||
        !Array.isArray(note.rows) ||
        !Array.isArray(note.boxes) ||
        !Array.isArray(note.numberPrefixes) ||
        !Number.isFinite(note.height) ||
        note.height <= 0,
    )
  )
    return { state: 'unavailable', error: 'InvalidEndnoteBodyFlow' };
  const rows = [],
    flows = [];
  if (
    sourceFlows.some(
      (f) => !Number.isSafeInteger(f.paragraph) || f.paragraph < 0 || f.paragraph > 0xffffffff,
    )
  )
    return { state: 'unavailable', error: 'InvalidEndnoteBodyFlow' };
  let virtualParagraph = sourceFlows.reduce((maximum, f) => Math.max(maximum, f.paragraph), 0);
  for (const [index, note] of notes.entries()) {
    if (note.scenePages !== undefined) {
      if (!Array.isArray(note.scenePages) || !note.scenePages.length)
        return { state: 'unavailable', error: 'InvalidEndnoteBodyFlow' };
      for (const paragraph of note.paragraphs)
        if (
          sourceFlows.filter((f) => f.section === note.section && f.paragraph === paragraph)
            .length !== 1
        )
          return { state: 'unavailable', error: 'MissingEndnoteBodyFlow' };
      for (const [sceneIndex, scene] of note.scenePages.entries()) {
        if (
          !scene ||
          !Number.isFinite(scene.height) ||
          scene.height <= 0 ||
          !Array.isArray(scene.rows) ||
          !Array.isArray(scene.boxes) ||
          !Array.isArray(scene.numberPrefixes) ||
          ++virtualParagraph > 0xffffffff
        )
          return { state: 'unavailable', error: 'InvalidEndnoteBodyFlow' };
        const paragraph = virtualParagraph;
        flows.push({
          section: note.section,
          paragraph,
          host: 'body',
          top_level: true,
          page_break: !sceneColumns && sceneIndex > 0,
          column_break: sceneColumns && sceneIndex > 0,
        });
        const gap =
          index === 0
            ? policy.aboveLine + separator.height + policy.belowLine
            : policy.betweenNotes;
        if (sceneIndex === 0 && gap > 0)
          rows.push({
            kind: 'gap',
            text: '',
            section: note.section,
            paragraph,
            height: gap,
            noteOwnerNode: note.noteNode,
            keepNextHeight: scene.height,
            ...(index === 0 ? { noteSeparator: { ...separator, offset: policy.aboveLine } } : {}),
          });
        rows.push({
          kind: 'gap',
          section: note.section,
          paragraph,
          height: scene.height,
          createdNoteNode: note.noteNode,
          createdNoteScene: sceneIndex,
        });
      }
      continue;
    }
    const height =
      index === 0 ? policy.aboveLine + separator.height + policy.belowLine : policy.betweenNotes;
    let firstTextHeight = 0;
    if (note.boxes.length || note.atomicScene) firstTextHeight = note.height;
    else
      for (const row of note.rows) {
        firstTextHeight += row.height;
        if (row.kind === 'text') break;
      }
    if (height > 0)
      rows.push({
        kind: 'gap',
        text: '',
        section: note.section,
        paragraph: note.paragraphs[0],
        height,
        noteOwnerNode: note.noteNode,
        keepNextHeight: firstTextHeight,
        ...(index === 0 ? { noteSeparator: { ...separator, offset: policy.aboveLine } } : {}),
      });
    if (note.boxes.length || note.atomicScene)
      rows.push({
        kind: 'gap',
        section: note.section,
        paragraph: note.paragraphs[0],
        height: note.height,
        createdNoteNode: note.noteNode,
      });
    else rows.push(...note.rows);
    for (const paragraph of note.paragraphs) {
      const sources = sourceFlows.filter(
        (flow) => flow.section === note.section && flow.paragraph === paragraph,
      );
      if (sources.length !== 1) return { state: 'unavailable', error: 'MissingEndnoteBodyFlow' };
      flows.push({ ...sources[0], host: 'body', top_level: true });
    }
  }
  return { state: 'prepared', rows, flows };
}

export function projectEndnoteBodySlots(page, notes) {
  const sceneSlots = new Set();
  for (const slot of page.rows.filter((row) => row.createdNoteScene !== undefined)) {
    const note = notes.find((n) => n.noteNode === slot.createdNoteNode),
      key = `${slot.createdNoteNode}:${slot.createdNoteScene}`;
    if (
      !Number.isSafeInteger(slot.createdNoteScene) ||
      slot.createdNoteScene < 0 ||
      !note?.scenePages?.[slot.createdNoteScene] ||
      sceneSlots.has(key)
    )
      return { state: 'unavailable', error: 'InvalidNoteSceneProjection' };
    sceneSlots.add(key);
  }
  for (const note of notes)
    if (note.scenePages?.some((_scene, index) => !sceneSlots.has(`${note.noteNode}:${index}`)))
      return { state: 'unavailable', error: 'InvalidNoteSceneProjection' };
  const rows = page.rows.filter((row) => row.createdNoteNode === undefined),
    boxes = [],
    numberPrefixes = [],
    separators = [],
    flowPictures = [],
    placedDrawings = [],
    placedContainers = [],
    placedCurves = [],
    noteAreas = [];
  const placement = (item, physical, x, y, column, ordinal) => ({
    ...moveLayoutRow(item, y, physical.ordinal - (item.pageOrdinal ?? 0), x),
    pageOrdinal: physical.ordinal,
    columnOrdinal: ordinal,
    referenceBoxes: { paper: physical.paper, page: physical.page, column },
  });
  for (const slot of page.rows.filter((row) => row.createdNoteNode !== undefined)) {
    const owner = notes.find((note) => note.noteNode === slot.createdNoteNode),
      physical = page.pages.find((p) => p.ordinal === slot.pageOrdinal);
    const note =
      slot.createdNoteScene === undefined ? owner : owner?.scenePages?.[slot.createdNoteScene];
    if (!note || !physical) return { state: 'unavailable', error: 'MissingCreatedNotePageOwner' };
    const ordinal = slot.columnOrdinal ?? 0;
    const column = slot.columnOrdinal === undefined ? physical.page : physical.columns?.[ordinal];
    if (
      !Number.isSafeInteger(ordinal) ||
      ordinal < 0 ||
      !column ||
      ![column.x, column.y, column.width, column.height].every(Number.isFinite)
    )
      return { state: 'unavailable', error: 'MissingCreatedNoteColumnOwner' };
    if (
      note.width !== undefined &&
      (!Number.isFinite(note.width) || note.width <= 0 || note.width > column.width + 1e-8)
    )
      return { state: 'unavailable', error: 'InvalidNoteColumnPlacement' };
    if ([note.width, note.height].every((value) => Number.isFinite(value) && value > 0))
      noteAreas.push({
        section: owner.section,
        noteNode: owner.noteNode,
        pageOrdinal: physical.ordinal,
        rectangle: { x: slot.x, y: slot.y, width: note.width, height: note.height },
      });
    try {
      rows.push(
        ...note.rows.map((row) => placement(row, physical, slot.x, slot.y, column, ordinal)),
      );
      boxes.push(
        ...note.boxes.map((box) => placement(box, physical, slot.x, slot.y, column, ordinal)),
      );
      numberPrefixes.push(
        ...note.numberPrefixes.map((prefix) => ({
          ...placement(prefix, physical, slot.x, slot.y, column, ordinal),
          pageClip: column,
        })),
      );
      for (const [key, output] of [
        ['placedDrawings', placedDrawings],
        ['placedContainers', placedContainers],
      ])
        for (const item of note[key] ?? [])
          output.push({
            ...moveLayoutPlacement(
              item,
              slot.y,
              physical.ordinal - (item.pageOrdinal ?? 0),
              slot.x,
            ),
            columnOrdinal: ordinal,
            referenceBoxes: { paper: physical.paper, page: physical.page, column },
          });
      if (note.placedCurves !== undefined && !Array.isArray(note.placedCurves))
        return { state: 'unavailable', error: 'InvalidNoteBodyProjection' };
      for (const item of note.placedCurves ?? [])
        placedCurves.push({
          ...moveCurvePlacement(item, slot.y, physical.ordinal - (item.pageOrdinal ?? 0), slot.x),
          columnOrdinal: ordinal,
          referenceBoxes: { paper: physical.paper, page: physical.page, column },
        });
    } catch (error) {
      if (
        [
          'InvalidSectionLayoutOffset',
          'InvalidSectionPageOrdinal',
          'InvalidSectionLayoutTransform',
        ].includes(error?.message)
      )
        return { state: 'unavailable', error: 'InvalidNoteBodyProjection' };
      throw error;
    }
    const pictures = projectNoteFlowPictures(
      note.flowPictures ?? [],
      slot.x,
      slot.y,
      {
        pageOrdinal: physical.ordinal,
        columnOrdinal: ordinal,
        referenceBoxes: { paper: physical.paper, page: physical.page, column },
      },
      note,
    );
    if (pictures.state !== 'projected') return pictures;
    flowPictures.push(...pictures.pictures);
  }
  for (const row of page.rows)
    if (row.noteSeparator?.height > 0)
      separators.push({
        x: row.x,
        y: row.y + row.noteSeparator.offset,
        width: row.noteSeparator.width,
        height: row.noteSeparator.height,
        color: row.noteSeparator.color,
        pageOrdinal: row.pageOrdinal,
        ...(row.noteSeparator.bands ? { bands: row.noteSeparator.bands } : {}),
      });
  return {
    state: 'projected',
    rows,
    boxes,
    numberPrefixes,
    separators,
    flowPictures,
    placedDrawings,
    placedContainers,
    placedCurves,
    noteAreas,
    warnings: notes.flatMap((note) => note.warnings ?? []),
  };
}

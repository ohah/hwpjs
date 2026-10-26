import { hwp5WindowFlows } from './hwp5-window-flows.mjs';
import { attachHwp5Drawings } from './hwp5-drawing-content.mjs';

// Native decoders validate full source inventories before window selection.
export function attachHwp5WindowDrawings(editor, content) {
  const { displayed, completeFlows, selectedFlows } = hwp5WindowFlows(editor, content);
  content.currentParagraphFlows = selectedFlows;
  const sections = new Map(),
    scoped = Object.create(editor);
  const selected = (section) => {
    if (sections.has(section)) return sections.get(section);
    const anchors = editor
      .drawingAnchors(section)
      .filter((row) => displayed.has(`${section}:${row.paragraph}`));
    const controls = new Set(anchors.map((row) => row.control_node)),
      components = new Set();
    const rows = editor.drawingComponentSources(section);
    for (const row of rows) {
      if (row.second_id !== null ? controls.has(row.owner_node) : components.has(row.owner_node))
        components.add(row.component_node);
    }
    const result = { anchors, controls, components, rows };
    sections.set(section, result);
    return result;
  };
  scoped.drawingAnchors = (section) => selected(section).anchors;
  scoped.drawingSources = (section) =>
    editor
      .drawingSources(section)
      .filter((row) => selected(section).controls.has(row.control_node));
  scoped.drawingComponentSources = (section) =>
    selected(section).rows.filter((row) => selected(section).components.has(row.component_node));
  scoped.drawingListSources = (section) => {
    const rows = editor
      .drawingListSources(section)
      .filter((row) => selected(section).controls.has(row.control_node));
    for (const source of rows) {
      const members = completeFlows
        .get(section)
        .filter(
          (row) =>
            row.host === 'drawing' &&
            row.parent_node === source.owner_node &&
            row.list_node === source.list_node,
        );
      if (members.some((row) => !displayed.has(`${section}:${row.paragraph}`)))
        throw new Error('MissingHwp5DrawingBodyParagraph');
    }
    return rows;
  };
  for (const name of [
    'drawingMatrixSources',
    'drawingLocalTransforms',
    'drawingRectangleCorners',
    'drawingStyleSources',
  ]) {
    scoped[name] = (section, ...options) =>
      editor[name](section, ...options).filter((row) =>
        selected(section).components.has(row.component_node),
      );
  }
  return attachHwp5Drawings(scoped, content);
}

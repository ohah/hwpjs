import { hwp5WindowFlows } from './hwp5-window-flows.mjs';
import { attachHwp5StructuralAnchors } from './hwp5-structural-anchor-content.mjs';

export function attachHwp5WindowStructuralAnchors(editor, content) {
  const { displayed, completeFlows } = hwp5WindowFlows(editor, content),
    scoped = Object.create(editor);
  scoped.structuralAnchors = (section) => {
    if (!completeFlows.has(section)) return [];
    const rows = editor.structuralAnchors(section),
      controls = new Set();
    for (const row of rows) {
      if (controls.has(row.control_node)) throw new Error('StructuralDisplayAnchorBindingMismatch');
      controls.add(row.control_node);
    }
    return rows.filter((row) => displayed.has(`${section}:${row.paragraph}`));
  };
  return attachHwp5StructuralAnchors(scoped, content);
}

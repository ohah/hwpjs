import { hwp5WindowIdentities } from './hwp5-window-identities.mjs';

export function boundHwp5ColumnSources(editor, section, flows) {
  const declarations = new Map();
  for (const source of editor.columnSources(section)) {
    const owner = flows[source.current_paragraph];
    if (
      !owner ||
      owner.generated ||
      owner.source_node !== source.paragraph_node ||
      declarations.has(source.current_paragraph)
    )
      throw new Error('WindowDependencyBindingMismatch');
    declarations.set(source.current_paragraph, source);
  }
  return declarations;
}

// Keep the real preceding declaration owner instead of inventing inherited data.
export function hwp5ColumnWindowDependencies(editor, projection) {
  const { total, ordinals, resolve } = hwp5WindowIdentities(projection),
    dependencies = new Map();
  for (const section of projection.sections) {
    const flows = editor.paragraphFlow(section.index),
      active = new Map();
    if (
      flows.length !== section.paragraphs.length ||
      flows.some((row, index) => row.paragraph !== index)
    )
      throw new Error('WindowDependencyBindingMismatch');
    const declarations = boundHwp5ColumnSources(editor, section.index, flows);
    for (const flow of flows) {
      const scope = `${flow.host}:${flow.parent_node}:${flow.list_node}`;
      const previous = active.get(scope);
      if (
        declarations.has(flow.paragraph) &&
        previous !== undefined &&
        previous !== flow.paragraph
      ) {
        dependencies.set(resolve(section.index, flow.paragraph), [
          resolve(section.index, previous),
        ]);
      }
      if (declarations.has(flow.paragraph)) active.set(scope, flow.paragraph);
      const owner = active.get(scope);
      if (owner === undefined || owner === flow.paragraph) continue;
      dependencies.set(resolve(section.index, flow.paragraph), [resolve(section.index, owner)]);
    }
  }
  return { total, ordinals, dependencies };
}

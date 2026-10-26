import { hwp5TableWindowDependencies } from './hwp5-table-window-dependencies.mjs';
import { hwp5ListWindowDependencies } from './hwp5-list-window-dependencies.mjs';
import { hwp5DrawingWindowDependencies } from './hwp5-drawing-window-dependencies.mjs';
import { hwp5FieldWindowDependencies } from './hwp5-field-window-dependencies.mjs';
import { hwp5ColumnWindowDependencies } from './hwp5-column-window-dependencies.mjs';
import { hwp5RepeatedWindowDependencies } from './hwp5-repeated-window-dependencies.mjs';
import { hwp5PageControlWindowDependencies } from './hwp5-page-control-window-dependencies.mjs';
import { memoHwp5WindowFlows } from './hwp5-window-flows.mjs';

// Compose independent ownership adapters; do not mutate their discovered maps.
function compose([first, ...rest]) {
  for (const found of rest)
    if (
      first.total !== found.total ||
      first.ordinals.size !== found.ordinals.size ||
      [...first.ordinals].some(([key, ordinal]) => found.ordinals.get(key) !== ordinal)
    )
      throw new Error('WindowDependencyBindingMismatch');
  const dependencies = new Map();
  for (const source of [first, ...rest])
    for (const [child, required] of source.dependencies) {
      if (!dependencies.has(child)) dependencies.set(child, []);
      const values = dependencies.get(child);
      for (const parent of required) if (!values.includes(parent)) values.push(parent);
    }
  return { total: first.total, ordinals: first.ordinals, dependencies };
}

export function hwp5OwnedWindowDependencies(editor, projection) {
  return compose([
    hwp5TableWindowDependencies(editor, projection),
    hwp5ListWindowDependencies(editor, projection),
    hwp5DrawingWindowDependencies(editor, projection),
  ]);
}

// Explicit new-ABI route: unavailable field discovery must not become empty data.
export function hwp5FieldOwnedWindowDependencies(editor, projection) {
  editor = memoHwp5WindowFlows(editor);
  const fields = hwp5FieldWindowDependencies(editor, projection);
  return {
    ...compose([
      hwp5OwnedWindowDependencies(editor, projection),
      fields,
      hwp5ColumnWindowDependencies(editor, projection),
      hwp5RepeatedWindowDependencies(editor, projection),
      hwp5PageControlWindowDependencies(editor, projection),
    ]),
    fieldTopologyDiagnostics: fields.fieldTopologyDiagnostics,
  };
}

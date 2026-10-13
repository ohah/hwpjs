import { hwp5TableWindowDependencies } from "./hwp5-table-window-dependencies.mjs";
import { hwp5ListWindowDependencies } from "./hwp5-list-window-dependencies.mjs";
import { hwp5DrawingWindowDependencies } from "./hwp5-drawing-window-dependencies.mjs";

// Compose independent ownership adapters; do not mutate their discovered maps.
export function hwp5OwnedWindowDependencies(editor, projection) {
  const table = hwp5TableWindowDependencies(editor, projection);
  const lists = hwp5ListWindowDependencies(editor, projection);
  const drawings = hwp5DrawingWindowDependencies(editor, projection);
  for (const found of [lists, drawings]) if (table.total !== found.total || [...table.ordinals].some(([key, ordinal]) => found.ordinals.get(key) !== ordinal)) throw new Error("WindowDependencyBindingMismatch");
  const dependencies = new Map();
  for (const source of [table.dependencies, lists.dependencies, drawings.dependencies]) for (const [child, required] of source) {
    if (!dependencies.has(child)) dependencies.set(child, []);
    const values = dependencies.get(child);
    for (const parent of required) if (!values.includes(parent)) values.push(parent);
  }
  return { total: table.total, ordinals: table.ordinals, dependencies };
}

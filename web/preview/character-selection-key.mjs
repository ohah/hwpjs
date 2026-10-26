// Immutable UI selection identity, never document content or an edit model.
export function characterSelectionKey(range) {
  return JSON.stringify([
    Array.isArray(range),
    (Array.isArray(range) ? range : [range]).map((part) =>
      part ? [part.section, part.paragraph, part.startUnit, part.endUnit] : null,
    ),
  ]);
}

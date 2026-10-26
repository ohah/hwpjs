const version = 0x05010100;
const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

// Observed opaque zero tail: geometry can be previewed only with native proof.
// This does not identify the field or change the original parser/save policy.
export function hasObservedDrawingObjectExtension(source) {
  const proof = source?.observedObjectExtension;
  return (
    source?.object_extra_bytes === 2 &&
    proof?.fileVersion === version &&
    proof.extraBytes === 2 &&
    proof.extraHex === '0000' &&
    uint(source.control_node) &&
    uint(source.paragraph_node) &&
    proof.controlNode === source.control_node &&
    proof.paragraphNode === source.paragraph_node
  );
}

export function withObservedDrawingObjectExtensions(editor, sources, section) {
  if (
    !sources.some((source) => source.object_extra_bytes === 2) ||
    editor.fileVersion() !== version
  )
    return sources;
  if (!uint(section)) throw new Error('InvalidDrawingObjectExtensionSection');
  const extras = editor.drawingObjectExtras(section);
  if (!Array.isArray(extras) || extras.length !== sources.length)
    throw new Error('MismatchedDrawingObjectExtensionSources');
  const byControl = new Map(extras.map((row) => [row?.control_node, row]));
  if (byControl.size !== extras.length) throw new Error('AmbiguousDrawingObjectExtensionSources');
  const prepared = [];
  for (const source of sources) {
    const row = byControl.get(source.control_node);
    if (
      !row ||
      row.paragraph_node !== source.paragraph_node ||
      row.extra_bytes !== source.object_extra_bytes ||
      typeof row.extra_hex !== 'string' ||
      row.extra_hex.length !== row.extra_bytes * 2 ||
      !/^[0-9a-f]*$/.test(row.extra_hex)
    )
      throw new Error('MismatchedDrawingObjectExtensionSources');
    prepared.push(
      source.object_extra_bytes === 2 && row.extra_hex === '0000'
        ? {
            ...source,
            observedObjectExtension: {
              fileVersion: version,
              controlNode: row.control_node,
              paragraphNode: row.paragraph_node,
              extraBytes: row.extra_bytes,
              extraHex: row.extra_hex,
            },
          }
        : source,
    );
  }
  return prepared;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff;

// Locations here are current Native UTF-16 source positions, not display positions.
export function decodeHwp5NamedFields(bytes) {
  const source = JSON.parse(utf8.decode(bytes));
  const invalid = () => new Error('InvalidHwp5NamedFields');
  if (
    source?.format !== 'hwp5' ||
    !['complete', 'partial'].includes(source.coverage) ||
    !Array.isArray(source.rows) ||
    source.rows.length > 20_000
  )
    throw invalid();
  const ids = new Set();
  const rows = source.rows.map(({ section, node, kind, name, text, sourceLocation }) => {
    const id = `hwp5:${section}:${node}`;
    if (
      !uint(section) ||
      !uint(node) ||
      ids.has(id) ||
      !['CLICK_HERE', 'BOOKMARK'].includes(kind) ||
      (name !== null && (typeof name !== 'string' || !name.isWellFormed())) ||
      (text !== null && (typeof text !== 'string' || !text.isWellFormed()))
    )
      throw invalid();
    ids.add(id);
    if ((text === null) !== (sourceLocation === null)) throw invalid();
    if (sourceLocation !== null) {
      if (!sourceLocation || typeof sourceLocation !== 'object') throw invalid();
      const { paragraph, sourceNode, startUnit, endUnit } = sourceLocation;
      if (
        ![paragraph, sourceNode, startUnit, endUnit].every(uint) ||
        endUnit - startUnit !== text.length
      )
        throw invalid();
    }
    return {
      id,
      section,
      name,
      kind,
      protection: 'unknown',
      value: text === null ? { status: 'unavailable' } : { status: 'available', text },
      sourceLocation,
    };
  });
  return { format: 'hwp5', coverage: source.coverage, rows };
}

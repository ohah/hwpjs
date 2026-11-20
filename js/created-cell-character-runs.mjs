// Validate native-derived complete UTF16 run maps. This never allocates IDs,
// edits text, infers resource inventories, or grants a typing capability.
const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff && !Object.is(n, -0);
export function validateCreatedCellCharacterRuns(text, runs) {
  const fail = () => {
    throw Error('InvalidCreatedCellCharacterRuns');
  };
  if (
    typeof text !== 'string' ||
    !text.isWellFormed() ||
    !Array.isArray(runs) ||
    !runs.length ||
    runs.length > 65535 ||
    runs[0]?.start_unit !== 0
  )
    return fail();
  let previous = -1;
  for (const run of runs) {
    if (
      !run ||
      typeof run !== 'object' ||
      Array.isArray(run) ||
      Object.keys(run).length !== 2 ||
      !Object.hasOwn(run, 'start_unit') ||
      !Object.hasOwn(run, 'char_shape_id') ||
      !uint(run.start_unit) ||
      !uint(run.char_shape_id) ||
      run.start_unit <= previous ||
      run.start_unit > text.length
    )
      return fail();
    const at = run.start_unit;
    if (
      at > 0 &&
      at < text.length &&
      text.charCodeAt(at - 1) >= 0xd800 &&
      text.charCodeAt(at - 1) <= 0xdbff &&
      text.charCodeAt(at) >= 0xdc00 &&
      text.charCodeAt(at) <= 0xdfff
    )
      return fail();
    previous = at;
  }
  return runs;
}

export function createdCellCharacterRanges(cell, fallback) {
  if (Object.hasOwn(cell, 'character_runs')) {
    const runs = validateCreatedCellCharacterRuns(cell.text, cell.character_runs);
    return runs.map((run, index) => ({
      start: run.start_unit,
      end: runs[index + 1]?.start_unit ?? cell.text.length,
      charShapeId: run.char_shape_id,
    }));
  }
  // Legacy Native snapshots explicitly use the table's sole default resource.
  // Their absence of per-cell runs is not proof of rich-cell ABI availability.
  if (!uint(fallback)) throw Error('InvalidCreatedCellCharacterRuns');
  return [{ start: 0, end: cell.text.length, charShapeId: fallback }];
}

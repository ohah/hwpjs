/** Strict JSON transport shared by separate, versioned resource projections. */
export function decodeCharacterSnapshot(bytes, keys, errorName) {
  const fail = () => {
    throw new Error(errorName);
  };
  if (!(bytes instanceof Uint8Array)) return fail();
  let rows;
  try {
    rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (!Array.isArray(rows) || rows.length > 1000000) return fail();
  let previous = -1;
  for (const row of rows) {
    if (
      !row ||
      typeof row !== "object" ||
      Array.isArray(row) ||
      Object.keys(row).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(row, key)) ||
      !Number.isInteger(row.id) ||
      row.id <= previous ||
      row.id > 0xffffffff
    )
      return fail();
    previous = row.id;
  }
  return rows;
}

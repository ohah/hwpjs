export function decodePictureOwners(bytes) {
  const fail = () => {
    throw new Error("InvalidPictureOwners");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length > 32 * 1024 * 1024) fail();
  let rows;
  try {
    rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail();
  }
  if (!Array.isArray(rows) || rows.length > 100000) fail();
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const seen = new Set();
  return rows.map((row) => {
    if (!row || !uint(row.picture_node) || seen.has(row.picture_node)) fail();
    seen.add(row.picture_node);
    if (row.owner === null) {
      if (typeof row.failure !== "string" || !/^[A-Za-z][A-Za-z0-9]{0,127}$/.test(row.failure))
        fail();
      return { pictureNode: row.picture_node, owner: null, error: row.failure };
    }
    if (
      row.failure !== null ||
      !row.owner ||
      !uint(row.owner.paragraph) ||
      row.owner.paragraph === 0 ||
      !uint(row.owner.anchor_node) ||
      !uint(row.owner.anchor_unit)
    )
      fail();
    return {
      pictureNode: row.picture_node,
      owner: {
        paragraph: row.owner.paragraph,
        anchorNode: row.owner.anchor_node,
        anchorUnit: row.owner.anchor_unit,
      },
      error: null,
    };
  });
}

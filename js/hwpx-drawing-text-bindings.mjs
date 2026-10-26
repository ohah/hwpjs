export function decodeDrawingTextBindings(bytes) {
  const fail = () => {
    throw new Error("InvalidDrawingTextBindings");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length > 16000000) return fail();
  let rows;
  try {
    rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (!Array.isArray(rows) || rows.length > 100000) return fail();
  const seen = new Set(),
    owners = new Map(),
    integer = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
  return rows.map((row) => {
    if (
      !row ||
      !integer(row.paragraph) ||
      row.paragraph === 0 ||
      seen.has(row.paragraph) ||
      !row.owner
    )
      return fail();
    const owner = row.owner;
    if (Object.hasOwn(owner, "kind") && !["text", "caption"].includes(owner.kind)) return fail();
    if (
      ![owner.drawing_node, owner.text_node, owner.list_node].every(integer) ||
      !(owner.drawing_node < owner.text_node && owner.text_node < owner.list_node)
    )
      return fail();
    const key = `${owner.drawing_node}:${owner.text_node}:${owner.kind ?? "text"}`;
    if (owners.has(owner.list_node) && owners.get(owner.list_node) !== key) return fail();
    owners.set(owner.list_node, key);
    seen.add(row.paragraph);
    return {
      paragraph: row.paragraph,
      drawingNode: owner.drawing_node,
      textNode: owner.text_node,
      listNode: owner.list_node,
      ...(Object.hasOwn(owner, "kind") ? { kind: owner.kind } : {}),
    };
  });
}

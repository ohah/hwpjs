const decoder = new TextDecoder("utf-8", { fatal: true });
export function decodeTableCreationResources(bytes) {
  const value = JSON.parse(decoder.decode(bytes));
  const keys = ["paragraph", "character", "style", "border_fill"];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every(
      (key) =>
        Object.hasOwn(value, key) &&
        Array.isArray(value[key]) &&
        value[key].every(
          (id, i, ids) =>
            Number.isInteger(id) && id >= 0 && id <= 0xffffffff && (!i || ids[i - 1] < id),
        ),
    )
  )
    throw new Error("InvalidTableCreationResources");
  return value;
}

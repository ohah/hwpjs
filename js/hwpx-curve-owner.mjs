const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export function decodeCurveOwner(bytes) {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const owner = value?.owner;
  if (
    !object(value) ||
    value.sourceOnly !== true ||
    !uint(value.node) ||
    (owner !== null &&
      (!object(owner) ||
        ![owner.paragraph, owner.anchor_node, owner.anchor_unit].every(uint) ||
        owner.paragraph === 0 ||
        owner.anchor_node >= value.node))
  )
    throw new Error("InvalidCurveOwner");
  return value;
}

export function queryCurveOwner(editor, section, node, root) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  try {
    if (typeof editor.curveOwner !== "function") throw new Error("HwpxCurveOwnerAbiUnavailable");
    if (![section, node, root].every(uint) || root >= node)
      throw new Error("CurveOwnerBindingMismatch");
    const result = editor.curveOwner(section, node),
      owner = result?.owner;
    if (
      result?.sourceOnly !== true ||
      result.node !== node ||
      !owner ||
      owner.anchor_node !== root ||
      !uint(owner.paragraph) ||
      owner.paragraph < 1 ||
      !uint(owner.anchor_unit)
    )
      throw new Error("CurveOwnerBindingMismatch");
    return { state: "bound", owner };
  } catch (error) {
    return { state: "unavailable", error: error.message };
  }
}

import { structuralAnchorUnits } from "./structural-anchor-units.mjs";
import { validateHwp5PageControlSources } from "../../js/hwp5-page-control-sources.mjs";
import { equationTextAnchors } from "./equation-text-anchors.mjs";

// 모든 placeholder를 표로 세지 않고 확인된 소유자별로 나눕니다.
export function inlineTableHostAnchors(paragraph, tables, overlays = [], textAnchors = []) {
  const fail = () => ({ state: "unavailable", error: "InvalidInlineTableHostAnchors" });
  if (typeof paragraph?.text !== "string" || ![tables, overlays, textAnchors].every(Array.isArray))
    return fail();
  let structural;
  try {
    structural = structuralAnchorUnits(paragraph);
  } catch {
    return fail();
  }
  const used = new Set(structural),
    nodes = new Set((paragraph.structuralAnchors ?? []).map((row) => row.control_node));
  const zeroWidthUnits = [...structural],
    textAnchorUnits = [];
  try {
    for (const control of validateHwp5PageControlSources(paragraph.pageControls ?? [])) {
      if (
        control.section !== paragraph.section ||
        control.paragraph !== paragraph.paragraph ||
        !Number.isSafeInteger(control.unit) ||
        control.unit < 0 ||
        paragraph.text[control.unit] !== "\ufffc" ||
        used.has(control.unit) ||
        nodes.has(control.control_node)
      )
        return fail();
      used.add(control.unit);
      nodes.add(control.control_node);
      zeroWidthUnits.push(control.unit);
    }
  } catch {
    return fail();
  }
  const equations = equationTextAnchors(paragraph);
  if (equations.state !== "resolved") return fail();
  for (const [items, target] of [
    [tables, null],
    [overlays, zeroWidthUnits],
    [textAnchors, textAnchorUnits],
    [equations.anchors, textAnchorUnits],
  ]) {
    for (const item of items) {
      const unit = item?.anchorUnit,
        node = item?.node;
      if (
        item?.section !== paragraph.section ||
        item?.paragraph !== paragraph.paragraph ||
        !Number.isSafeInteger(node) ||
        node < 0 ||
        nodes.has(node) ||
        !Number.isSafeInteger(unit) ||
        unit < 0 ||
        paragraph.text[unit] !== "\ufffc" ||
        used.has(unit)
      )
        return fail();
      nodes.add(node);
      used.add(unit);
      target?.push(unit);
    }
  }
  for (let unit = 0; unit < paragraph.text.length; unit++)
    if (paragraph.text[unit] === "\ufffc" && !used.has(unit))
      return { ...fail(), anchorUnit: unit };
  return { state: "resolved", zeroWidthUnits, textAnchorUnits };
}

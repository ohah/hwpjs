import { structuralAnchorUnits } from "./structural-anchor-units.mjs";

// 모든 placeholder를 표로 세지 않고 확인된 소유자별로 나눕니다.
export function inlineTableHostAnchors(paragraph, tables, overlays = [], textAnchors = []) {
  const fail = () => ({ state: "unavailable", error: "InvalidInlineTableHostAnchors" });
  if (typeof paragraph?.text !== "string" || ![tables, overlays, textAnchors].every(Array.isArray)) return fail();
  let structural;
  try { structural = structuralAnchorUnits(paragraph); } catch { return fail(); }
  const used = new Set(structural), nodes = new Set();
  const zeroWidthUnits = [...structural], textAnchorUnits = [];
  for (const [items, target] of [[tables, null], [overlays, zeroWidthUnits], [textAnchors, textAnchorUnits]]) {
    for (const item of items) {
      const unit = item?.anchorUnit, node = item?.node;
      if (item?.section !== paragraph.section || item?.paragraph !== paragraph.paragraph
        || !Number.isSafeInteger(node) || node < 0 || nodes.has(node)
        || !Number.isSafeInteger(unit) || unit < 0 || paragraph.text[unit] !== "\ufffc" || used.has(unit)) return fail();
      nodes.add(node); used.add(unit); target?.push(unit);
    }
  }
  for (let unit = 0; unit < paragraph.text.length; unit++) if (paragraph.text[unit] === "\ufffc" && !used.has(unit)) return fail();
  return { state: "resolved", zeroWidthUnits, textAnchorUnits };
}

const decoder = new TextDecoder("utf-8", { fatal: true });
const counts = ["zero_fat_tail_slots", "off_by_one_fat_markers", "zero_unclaimed_fat_slots", "orphan_end_fat_slots", "zero_mini_tail_slots", "zero_unclaimed_mini_slots", "zero_unused_entries", "stale_unused_entries"];
export function decodeHwp5NormalizationInfo(bytes) {
  const value = JSON.parse(decoder.decode(bytes));
  if (value === null) return { normalized: false, historyBaseline: "original", deviations: null };
  const invalid = () => { throw new Error("InvalidHwp5NormalizationInfo"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  for (const key of counts) if (!Number.isSafeInteger(value[key]) || value[key] < 0) invalid();
  const root = value.original_root_created;
  if (!(typeof root === "string" && /^(0|[1-9][0-9]*)$/.test(root)) && !(Number.isSafeInteger(root) && root >= 0)) invalid();
  if (BigInt(root) > 0xffffffffffffffffn) invalid();
  return { normalized: true, historyBaseline: "normalized", deviations: { ...value, original_root_created: String(root) } };
}

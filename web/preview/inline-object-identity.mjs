import { createdTableIdentity } from "../../js/created-table-identity.mjs";

export function inlineObjectIdentity(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (Object.hasOwn(entry, "createdTableIdentity")) {
    if (Object.hasOwn(entry, "objectNode")) return null;
    try { createdTableIdentity(entry.createdTableIdentity); } catch { return null; }
    return `created-table:${entry.createdTableIdentity}`;
  }
  return Number.isSafeInteger(entry.objectNode) && entry.objectNode >= 0 ? `source:${entry.objectNode}` : null;
}

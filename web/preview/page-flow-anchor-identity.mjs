import { createdTableIdentity } from "../../js/created-table-identity.mjs";

// Source nodes and generated u64 identities occupy disjoint namespaces.
export function pageFlowAnchorIdentity(row) {
  if (Object.hasOwn(row, "createdTableIdentity")) {
    if (Object.hasOwn(row, "tableNode")) return null;
    try { createdTableIdentity(row.createdTableIdentity); } catch { return null; }
    return `${row.section}:created:${row.createdTableIdentity}`;
  }
  if (!Number.isSafeInteger(row.tableNode) || row.tableNode < 0) return null;
  return `${row.section}:source:${row.tableNode}`;
}

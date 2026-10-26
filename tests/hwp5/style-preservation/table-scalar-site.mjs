import { tableBindings } from "./table-binding-oracle.mjs";
import { paragraphRecords } from "./text-record-oracle.mjs";
import { variedScalarSites } from "./scalar-sites.mjs";

// Representative native UTF-16 range from independent raw cell/list ownership.
export function firstTableCellScalar(raw, tableNode) {
  for (const binding of tableBindings(raw).filter((row) => row.tableNode === tableNode)) {
    const owner = paragraphRecords(raw, binding.paragraph);
    const text = owner.direct.find((row) => row.tag === 67 && row.level === owner.head.level + 1);
    if (!text) continue;
    const site = variedScalarSites({
      sections: [{ bytes: Buffer.concat([owner.head.raw, text.raw]) }],
    })[0];
    if (site) return { ...site, paragraph: binding.paragraph };
  }
  return null;
}

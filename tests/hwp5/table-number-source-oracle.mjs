/** Independent CFB/record-level table-caption census; no native tree or cached field output. */
import { createHash } from "node:crypto";
import { inspect, records } from "./style-preservation/text-record-oracle.mjs";
export function tableNumberSourceOracle(bytes) {
  const source = inspect(bytes),
    objects = [],
    tables = [],
    references = [];
  source.sections.forEach((section, sectionIndex) => {
    const rows = records(section.bytes);
    rows.forEach((row, index) => {
      if (row.tag !== 71) return;
      const id = row.payload.readUInt32LE(0);
      if ([0x74626c20, 0x67736f20, 0x65716564].includes(id)) {
        const object = {
          section: sectionIndex,
          offset: row.start,
          id,
          instance: row.payload.readUInt32LE(36),
        };
        objects.push(object);
        if (id !== 0x74626c20) return;
        const values = [];
        for (let at = index + 1; at < rows.length && rows[at].level > row.level; at++) {
          const child = rows[at];
          if (child.tag === 77 && child.level === row.level + 1) break;
          if (
            child.tag === 71 &&
            child.level === row.level + 2 &&
            child.payload.readUInt32LE(0) === 0x61746e6f
          ) {
            values.push({
              attributes: child.payload.readUInt32LE(4),
              number: child.payload.readUInt16LE(8),
            });
          }
        }
        tables.push({ object, values });
      } else if (id === 0x25787266) {
        const units = row.payload.readUInt16LE(9),
          command = row.payload.subarray(11, 11 + units * 2).toString("utf16le");
        const match = /^\?#([0-9]+);0;1;[01];[012];?$/.exec(command);
        references.push({ command, target: match ? Number(match[1]) : null });
      }
    });
  });
  const digest = createHash("sha256");
  for (const reference of references) {
    const matches = objects.filter((row) => row.instance === reference.target);
    if (reference.target === null) reference.state = "unsupported-command";
    else if (matches.length === 0) reference.state = "unresolved-target";
    else if (matches.length !== 1) reference.state = "ambiguous-target";
    else if (matches[0].id !== 0x74626c20) reference.state = "wrong-object-kind";
    else {
      const table = tables.find((row) => row.object === matches[0]);
      if (table.values.length !== 1) reference.state = "missing-or-ambiguous-caption-number";
      else if ((table.values[0].attributes & 15) !== 4) reference.state = "wrong-number-kind";
      else {
        reference.state = "resolved-declaration";
        reference.number = table.values[0].number;
        const pair = Buffer.alloc(6);
        pair.writeUInt32LE(reference.target, 0);
        pair.writeUInt16LE(reference.number, 4);
        digest.update(pair);
      }
    }
  }
  return { objects, tables, references, resolvedDigest: digest.digest("hex") };
}

import { hwp5TableGeometry, hwp5TablePagination } from "./hwp5-table-geometry.mjs";
import { hwp5TableFlags } from "./hwp5-table-flags.mjs";
import { hasObservedZeroTableObjectTail } from "./hwp5-table-object-tail.mjs";
// A derived preview projection only. Native values and strict source reports stay intact.
export function projectOpaqueHwp5Tables(content) {
  const unverified = [],
    accepted = new Map();
  if (
    !Array.isArray(content.tables) ||
    !Array.isArray(content.tableGeometryErrors) ||
    content.tableGeometryErrors.some((error) => !error || typeof error !== "object")
  )
    return { content, unverified };
  const sourceErrors = new Map();
  for (const error of content.tableGeometryErrors ?? []) {
    const key = `${error.section}:${error.tableNode}`;
    sourceErrors.set(key, sourceErrors.has(key) ? null : error);
  }
  const tables = (content.tables ?? []).map((table) => {
    if (
      !table ||
      ![table.section, table.tableNode].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff,
      )
    )
      return table;
    const source = table.layoutSource;
    if (table.sourceGeometry || !source) return table;
    try {
      const unknown = hwp5TableFlags(source.table_flags).unknown_flags;
      const zeroTail = hasObservedZeroTableObjectTail(source);
      if (!unknown && !zeroTail) return table;
      const sourceGeometry = hwp5TableGeometry(source, {
          allowOpaqueTableFlags: true,
          allowObservedZeroObjectTail: zeroTail,
        }),
        pagination = hwp5TablePagination(source, { allowOpaqueTableFlags: true });
      const evidence = {
        section: table.section,
        tableNode: table.tableNode,
        rawTableFlags: source.table_flags,
        unknownTableFlags: unknown,
      };
      const error = sourceErrors.get(`${table.section}:${table.tableNode}`);
      if (
        !error ||
        error.error !== "UnsupportedHwp5TableExtension" ||
        error.rawTableFlags !== source.table_flags ||
        error.unknownTableFlags !== unknown
      )
        return table;
      if (zeroTail) {
        if (
          error.rawObjectFlags !== source.object_flags ||
          error.unsupportedObjectFlags !== 0 ||
          error.objectExtraBytes !== 2 ||
          error.tableExtraBytes !== 0
        )
          return table;
        evidence.objectExtraBytes = 2;
        evidence.objectExtraU16 = source.object_extra_u16;
      }
      unverified.push(evidence);
      accepted.set(`${table.section}:${table.tableNode}`, error);
      return { ...table, sourceGeometry, pagination };
    } catch {
      return table;
    }
  });
  if (!unverified.length) return { content, unverified };
  return {
    content: {
      ...content,
      tables,
      tableGeometryErrors: content.tableGeometryErrors.filter(
        (e) => accepted.get(`${e.section}:${e.tableNode}`) !== e,
      ),
    },
    unverified,
  };
}

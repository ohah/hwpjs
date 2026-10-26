import {
  hwp5TableGeometry,
  hwp5TablePagination,
  hwp5TableUnsupportedObjectFlags,
} from "./hwp5-table-geometry.mjs";
import { hwp5TableFlags } from "./hwp5-table-flags.mjs";
/** Source adapters only; placement policy still decides whether it is usable. */
export function attachHwp5TableGeometry(content) {
  content.tableGeometryErrors = [];
  for (const table of content.tables) {
    delete table.sourceGeometry;
    delete table.pagination;
    try {
      if (!table.layoutSource) throw new Error("MissingTableLayoutSource");
      const geometry = hwp5TableGeometry(table.layoutSource),
        pagination = hwp5TablePagination(table.layoutSource);
      table.sourceGeometry = geometry;
      table.pagination = pagination;
    } catch (error) {
      const raw = table.layoutSource?.table_flags;
      const decoded =
        Number.isInteger(raw) && raw >= 0 && raw <= 0xffffffff ? hwp5TableFlags(raw) : null;
      content.tableGeometryErrors.push({
        section: table.section,
        tableNode: table.tableNode,
        error: error.message,
        rawTableFlags: decoded ? raw : null,
        unknownTableFlags: decoded?.unknown_flags ?? null,
        rawObjectFlags:
          hwp5TableUnsupportedObjectFlags(table.layoutSource?.object_flags) === null
            ? null
            : table.layoutSource.object_flags,
        unsupportedObjectFlags: hwp5TableUnsupportedObjectFlags(table.layoutSource?.object_flags),
        objectExtraBytes: table.layoutSource?.object_extra_bytes ?? null,
        tableExtraBytes: table.layoutSource?.table_extra_bytes ?? null,
      });
    }
  }
  return content;
}

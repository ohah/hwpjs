import { tableCollisionFootprints } from './table-collision-footprints.mjs';
import { rectanglesOverlap } from './rectangles-overlap.mjs';

// Validate every fragment before the caller publishes any placement or rows.
export function inspectFloatingTablePlacement(
  table,
  placement,
  insets,
  content,
  placements,
  groups,
) {
  const collected = tableCollisionFootprints(table, placement, insets, content);
  if (collected.state !== 'collected') return collected;
  if (collected.footprints.length !== (placement.fragmentCount ?? 1))
    return { state: 'unavailable', error: 'InvalidFloatingTableFootprint' };
  for (const entry of collected.footprints) {
    const conflict = placements.find(
      (previous) =>
        previous.pageOrdinal === entry.pageOrdinal &&
        rectanglesOverlap(entry.rectangle, previous.footprint),
    );
    if (conflict)
      return {
        state: 'unavailable',
        error: 'UnsupportedFloatingTableCollision',
        section: table.section,
        tableNode: table.tableNode,
        pageOrdinal: entry.pageOrdinal,
        conflictingTableNode: conflict.table.tableNode,
        rectangle: { ...entry.rectangle },
        conflictingRectangle: { ...conflict.footprint },
      };
    if (
      groups.some(
        (group) =>
          group.pageOrdinal === entry.pageOrdinal &&
          rectanglesOverlap(group.footprint, entry.rectangle),
      )
    )
      return {
        state: 'unavailable',
        error: 'FloatingGroupTableCollision',
        section: table.section,
        tableNode: table.tableNode,
        pageOrdinal: entry.pageOrdinal,
      };
  }
  return collected;
}

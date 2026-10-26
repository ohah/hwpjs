import { projectFloatingOlePage } from './ole-page-projection.mjs';
import { resolveComponentWrapReservations } from './component-wrap-reservations.mjs';

/** Standalone OLE policy remains separate from shared geometric reservation. */
export function resolveOleWrapReservations(oles, paragraphs, body, inventory) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    !Array.isArray(oles) ||
    inventory?.state !== 'collected' ||
    !Array.isArray(inventory.footprints)
  )
    return fail('IncompleteOleCollisionInventory');
  for (const ole of oles) {
    if (!ole || typeof ole !== 'object') return fail('InvalidOlePageAnchor');
    if (
      ole.chartWrapper != null ||
      (ole.representation !== undefined && ole.representation !== 'standalone')
    )
      return fail('UnsupportedOleAlternateWrap');
  }
  const result = resolveComponentWrapReservations(
    oles.map((ole) => ({ ...ole, node: ole.oleNode })),
    paragraphs,
    body,
    inventory,
    projectFloatingOlePage,
    'ole',
  );
  return result.state === 'reserved'
    ? {
        ...result,
        reservations: result.reservations.map(({ node, ...row }) => ({ ...row, oleNode: node })),
      }
    : result;
}

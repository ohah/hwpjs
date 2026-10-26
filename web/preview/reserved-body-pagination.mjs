import { paginateBodyRows } from './page-row-flow.mjs';
import { bodyRowSources } from './body-row-sources.mjs';
import { createReservedBodyCallbacks } from './reserved-body-callbacks.mjs';

/** Reuse the selected table/body paginator while shaping text in reserved regions. */
export function paginateReservedBodyRows(
  rows,
  setting,
  flows,
  paragraphs,
  reservations,
  measure,
  options = {},
  paginate = paginateBodyRows,
) {
  if (typeof paginate !== 'function' || options.measurePositionedRow !== undefined)
    return { state: 'unavailable', error: 'InvalidReservedBodyPaginator' };
  const sources = bodyRowSources(rows, paragraphs, { maxRows: options.maxRows });
  if (sources.state !== 'prepared') return sources;
  const callbacks = createReservedBodyCallbacks(reservations, measure, { rowY: options.rowY });
  if (callbacks.state !== 'ready') return callbacks;
  const result = paginate(sources.rows, setting, flows, {
    ...options,
    rowY: callbacks.rowY,
    measurePositionedRow: callbacks.measurePositionedRow,
  });
  return callbacks.failure()
    ? { state: 'unavailable', error: callbacks.failure(), ...callbacks.diagnostic() }
    : result;
}

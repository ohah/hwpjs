import { layoutSourceTableCaption } from './table-caption-source-layout.mjs';
import { tableInsets } from './table-insets.mjs';
import { captionBoundsInsets } from './caption-bounds-insets.mjs';

// Reserve current caption bounds before pagination; does not place page fragments.
export function reserveTableCaptionSpace(
  table,
  paragraphs,
  rectangle,
  measure,
  outerInsets,
  { maxRows = 20000 } = {},
) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  const margins = tableInsets(outerInsets);
  if (!margins) return unavailable('InvalidTableOuterInsets');
  const caption = layoutSourceTableCaption(table, paragraphs, rectangle, measure, { maxRows });
  if (caption.state !== 'positioned') return caption;
  const reserved = captionBoundsInsets(rectangle, caption.bounds, margins);
  if (!reserved) return unavailable('InvalidTableCaptionReservation');
  return {
    state: 'reserved',
    outerInsets: reserved,
    caption,
    rectangle: { ...rectangle },
    rowCount: caption.rows.length,
  };
}

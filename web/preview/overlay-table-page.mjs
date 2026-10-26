import { alignedReferenceCoordinate } from './picture-placement.mjs';
import { signedInt32 } from './signed-int32.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';
import { prepareTablePageBands } from './table-page-bands.mjs';
import { resolveTablePadding } from './table-source-insets.mjs';
import { projectTablePageFragments } from './table-page-fragments.mjs';

const validBox = (box) =>
  box &&
  [box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(
    Number.isFinite,
  ) &&
  box.width > 0 &&
  box.height > 0;

/** Project an unsplit overlay on caller-owned physical references, never reserve body space. */
export function projectOverlayTablePage(
  table,
  measured,
  reference,
  { pageOrdinal, columnOrdinal = 0, maxRows = 20000 } = {},
) {
  const refuse = (error) => ({ state: 'unavailable', error });
  const source = table?.sourceGeometry,
    geometry = source?.geometry;
  if (
    geometry?.treat_as_character !== false ||
    ![2, 3].includes(source.text_wrap) ||
    geometry.width_relative !== 4 ||
    geometry.height_relative !== 2 ||
    source.text_flow !== 0 ||
    table.pagination?.page_break !== 'none' ||
    source.allow_overlap !== false ||
    table.sourceCaption ||
    ![geometry.width, geometry.height].every(
      (value) => Number.isInteger(value) && value > 0 && value <= 0xffffffff,
    )
  )
    return refuse('UnsupportedOverlayTableSource');
  if (
    !Number.isSafeInteger(source.z_order) ||
    source.z_order < -2147483648 ||
    source.z_order > 4294967295
  )
    return refuse('MissingOverlayTableOrder');
  if (
    !Number.isSafeInteger(pageOrdinal) ||
    pageOrdinal < 0 ||
    !Number.isSafeInteger(columnOrdinal) ||
    columnOrdinal < 0 ||
    !validBox(reference?.page)
  )
    return refuse('InvalidOverlayTableReference');
  if (![source.vertical_relative, source.horizontal_relative].every(Number.isInteger))
    return refuse('InvalidOverlayTableReference');
  const vertical = ['paper', 'page', 'paragraph'][source.vertical_relative];
  const horizontal = ['paper', 'page', 'column', 'paragraph'][source.horizontal_relative];
  const vbox = reference?.[vertical],
    hbox = reference?.[horizontal];
  if (!vertical || !horizontal || !validBox(vbox) || !validBox(hbox))
    return refuse('InvalidOverlayTableReference');
  const dx = signedInt32(geometry.horizontal_offset),
    dy = signedInt32(geometry.vertical_offset);
  if (
    dx === null ||
    dy === null ||
    ![0, 1, 2].includes(source.vertical_alignment) ||
    ![0, 1, 2].includes(source.horizontal_alignment)
  )
    return refuse('UnsupportedOverlayTablePosition');
  if (
    measured?.state !== 'measured' ||
    ![measured.grid?.width, measured.grid?.height].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    return refuse('InvalidOverlayTableMeasurement');
  // Nonzero outer-inset alignment needs a distinct source policy, not block reservation.
  if (
    !Array.isArray(source.out_margin) ||
    source.out_margin.length !== 4 ||
    !Array.from(source.out_margin).every((value) => value === 0)
  )
    return refuse('UnsupportedOverlayTableInsets');
  const prepared = prepareTablePageBands(table, measured.grid.rows, 'whole', 0);
  if (prepared.state !== 'prepared') return prepared;
  const padding = resolveTablePadding(table, 'source');
  if (!padding) return refuse('MissingTableSourceInsets');
  const { width, height } = measured.grid;
  const x = alignedReferenceCoordinate(
    hbox.x,
    hbox.width,
    width,
    hwpUnitPixels(dx),
    source.horizontal_alignment,
  );
  const y = alignedReferenceCoordinate(
    vbox.y,
    vbox.height,
    height,
    hwpUnitPixels(dy),
    source.vertical_alignment,
  );
  if (![x, y, x + width, y + height].every(Number.isFinite))
    return refuse('InvalidOverlayTablePosition');
  const fragment = {
    ...prepared.selected[0],
    x,
    y,
    pageOrdinal,
    columnOrdinal,
    referenceBoxes: reference,
  };
  const projected = projectTablePageFragments(
    table,
    measured.grid,
    measured.flows,
    { state: 'planned', fragments: [fragment] },
    { origin: { x: 0, y: 0 }, padding, maxRows },
  );
  if (projected.state !== 'placed') return projected;
  if (projected.boxes.some((box) => box.tableNode !== table.tableNode))
    return refuse('UnsupportedNestedOverlayTableScene');
  const layer = {
    tablePaintLayer: source.text_wrap === 2 ? 'behind' : 'front',
    tablePaintZOrder: source.z_order,
    positionOwnerTableNode: table.tableNode,
  };
  const tag = (item) => ({ ...item, ...layer });
  return {
    ...projected,
    rows: projected.rows.map(tag),
    boxes: projected.boxes.map(tag),
    ...(projected.flowPictures ? { flowPictures: projected.flowPictures.map(tag) } : {}),
    ...(projected.tableCaptionBounds
      ? { tableCaptionBounds: projected.tableCaptionBounds.map(tag) }
      : {}),
    rectangle: { x, y, width, height },
    ...layer,
    bodyReservation: null,
  };
}

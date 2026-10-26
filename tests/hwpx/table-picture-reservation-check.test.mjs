import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTablePictureReservations } from '../../web/preview/table-picture-reservation-check.mjs';

const table = {
  section: 0,
  tableNode: 5,
  pageOrdinal: 0,
  rectangle: { x: 20, y: 20, width: 40, height: 40 },
};
const picture = {
  section: 0,
  pageOrdinal: 0,
  rectangle: { x: 60, y: 20, width: 40, height: 40 },
  flow: { textWrap: 0, textFlow: 0, outsideMargins: [0, 0, 0, 0] },
};

test('final table footprint permits touching edges but refuses actual reserved overlap', () => {
  const before = structuredClone({ table, picture });
  assert.equal(checkTablePictureReservations([table], [picture]).state, 'clear');
  const moved = { ...table, rectangle: { ...table.rectangle, x: 21 } };
  assert.equal(
    checkTablePictureReservations([moved], [picture]).error,
    'TablePictureReservationOverlap',
  );
  assert.deepEqual({ table, picture }, before);
});

test('caption frame and picture margins participate without changing the nominal image', () => {
  const caption = {
    ...picture,
    rectangle: { x: 20, y: 0, width: 40, height: 10 },
    flowRectangle: { x: 20, y: 0, width: 40, height: 30 },
  };
  assert.equal(
    checkTablePictureReservations([table], [caption]).error,
    'TablePictureReservationOverlap',
  );
  const margin = { ...picture, flow: { ...picture.flow, outsideMargins: [75, 0, 0, 0] } };
  assert.equal(
    checkTablePictureReservations([table], [margin]).error,
    'TablePictureReservationOverlap',
  );
});

test('reservation checks isolate sections and pages and respect non-wrapping layers', () => {
  for (const change of [
    { section: 1 },
    { pageOrdinal: 1 },
    { flow: { textWrap: 2 } },
    { flow: { textWrap: 3 } },
  ]) {
    assert.equal(
      checkTablePictureReservations(
        [table],
        [{ ...picture, rectangle: table.rectangle, ...change }],
      ).state,
      'clear',
    );
  }
  assert.equal(
    checkTablePictureReservations([table], [{ ...picture, flow: { ...picture.flow, textWrap: 1 } }])
      .error,
    'TablePictureReservationOverlap',
  );
});

test('invalid final geometry and reservation identity never count as clear', () => {
  assert.equal(
    checkTablePictureReservations([{ ...table, rectangle: { ...table.rectangle, x: NaN } }], [])
      .state,
    'unavailable',
  );
  assert.equal(
    checkTablePictureReservations([table], [{ ...picture, pageOrdinal: -1 }]).state,
    'unavailable',
  );
  assert.equal(
    checkTablePictureReservations([table], [{ ...picture, rectangle: null }]).state,
    'unavailable',
  );
});

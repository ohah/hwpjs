import { createHwp5CellWidthFixture } from './hwp5-cell-width-fixture.mjs';
export const createCellHeightFixture = (module, options = {}) =>
  createHwp5CellWidthFixture(module, { heights: [1500, 4500, 3000], ...options });

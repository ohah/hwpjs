import test from 'node:test';
import assert from 'node:assert/strict';
import { model, camera, proposed, context } from './chart-family-model.mjs';
import { chartFamilyFieldNames } from '../../js/chart-family-display-settings.mjs';
import { decodeChartDisplay } from '../../js/hwpx-chart-display.mjs';
import { chartPreviewPrimitives } from '../../web/preview/chart-preview-primitives.mjs';
import { paintChartPreview } from '../../web/preview/chart-preview-paint.mjs';

// Authored DTO fixture matching the source contract. Never labeled Native output.
function authored(kind) {
  const dto = proposed(
    model(kind, [
      [2, 3, 4],
      [1, 2, 3],
    ]),
  );
  for (const key of chartFamilyFieldNames)
    if (!Object.hasOwn(dto.plot_settings[0], key)) dto.plot_settings[0][key] = null;
  if (kind === 'surface3DChart') {
    camera(dto);
    dto.view_3d.rotation_x.value = 15;
    dto.view_3d.rotation_y.value = 20;
  }
  return dto;
}
for (const kind of ['doughnutChart', 'radarChart', 'bubbleChart', 'surfaceChart', 'surface3DChart'])
  test(`synthetic v1 DTO -> strict decoder -> ${kind} projector and painter`, () => {
    const dto = authored(kind),
      snapshot = structuredClone(dto);
    const decoded = decodeChartDisplay(new TextEncoder().encode(JSON.stringify(dto)));
    const geometry = chartPreviewPrimitives(decoded);
    assert.equal(geometry.state, 'ready', JSON.stringify(geometry));
    const c = context();
    assert.equal(
      paintChartPreview(c.ctx, { x: 0, y: 0, width: 600, height: 400, primitives: geometry }, 0),
      true,
    );
    assert.equal(c.depth(), 0);
    assert.deepEqual(dto, snapshot);
    dto.plot_settings[0].family_unparsed_children = true;
    const rejected = chartPreviewPrimitives(
      decodeChartDisplay(new TextEncoder().encode(JSON.stringify(dto))),
    );
    assert.equal(rejected.state, 'unavailable');
    assert.equal(rejected.reason, 'UnsupportedChartFamilyChildren');
  });

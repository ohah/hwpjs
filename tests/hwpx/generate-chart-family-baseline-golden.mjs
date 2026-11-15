// 고정 자체 프로젝트 HEAD4e99를 명시적으로 지정할 때만 실행하는 golden 생성 도구.
// 일반 시험은 이 파일을 import하거나 baseline을 실행하지 않는다.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { model, camera, context } from './chart-family-model.mjs';
import { encodeBaselineGolden, decodeBaselineGolden } from './chart-baseline-golden-codec.mjs';
const [baselineRoot, output] = process.argv.slice(2);
if (!baselineRoot || !output)
  throw Error(
    '사용법: node generate-chart-family-baseline-golden.mjs <고정 HEAD4e99 root> <출력 디렉터리>',
  );
const provenance = JSON.parse(
  readFileSync(
    new URL('./fixtures/chart-family-baseline-4e99.provenance.json', import.meta.url),
    'utf8',
  ),
);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert(
  [provenance.modelSha256, provenance.formattedModelSha256].includes(
    sha(readFileSync(new URL('./chart-family-model.mjs', import.meta.url))),
  ),
  'model helper must match a pinned normalJSr2 or Main formatting40 source',
);
for (const [relative, expected] of Object.entries(provenance.baselineModuleSha256))
  assert.equal(sha(readFileSync(resolve(baselineRoot, relative))), expected, relative);
const { chartPreviewPrimitives: baselinePreview } = await import(
  pathToFileURL(resolve(baselineRoot, 'web/preview/chart-preview-primitives.mjs'))
);
const { paintChartPreview: baselinePaint } = await import(
  pathToFileURL(resolve(baselineRoot, 'web/preview/chart-preview-paint.mjs'))
);
const cases = {};
for (const kind of [
  'barChart',
  'bar3DChart',
  'lineChart',
  'scatterChart',
  'pieChart',
  'pie3DChart',
  'ofPieChart',
  'stockChart',
]) {
  let d = model(
    kind,
    kind === 'stockChart'
      ? [
          [7, 8, 9],
          [1, 2, 3],
          [4, 5, 6],
        ]
      : [[1, 2, 3]],
  );
  const settings = d.plot_settings[0];
  settings.grouping = { node: 4, value: 'standard' };
  if (kind.startsWith('bar')) {
    settings.direction = { node: 5, value: 'col' };
    settings.grouping.value = 'clustered';
  }
  if (['pieChart', 'pie3DChart', 'ofPieChart'].includes(kind)) {
    d.axes = [];
    d.axis_links = [];
    settings.axis_references = [];
  }
  if (kind === 'scatterChart') {
    d = model('bubbleChart', [[1, 2, 3]]);
    d.plots[0].kind = kind;
    d.plot_settings[0].scatter_style = { node: 4, value: 'marker' };
    const keep = d.points
      .map((point, i) => ({ point, binding: d.bindings[i] }))
      .filter((r) => r.binding.role !== 'bubble_size');
    d.points = keep.map((r) => r.point);
    d.bindings = keep.map((r) => r.binding);
  }
  if (kind === 'bar3DChart') {
    camera(d);
    settings.spatial = { gap_depth: { node: 6, value: 150 }, shape: { node: 7, value: 'box' } };
  }
  if (kind === 'pie3DChart') {
    camera(d);
    d.view_3d.right_angle_axes.value = false;
    d.view_3d.perspective = { node: 956, value: 30 };
  }
  if (kind === 'stockChart') {
    settings.stock = {
      high_low_node: 600,
      up_down_node: null,
      up_node: null,
      down_node: null,
      gap_width: null,
    };
    d.series_settings.forEach((s, i) => {
      s.index = { value: i };
      s.order = { value: i };
    });
  }

  const before = structuredClone(d),
    geometry = baselinePreview(d);
  assert.equal(geometry.state, 'ready', JSON.stringify(geometry));
  assert.deepEqual(d, before);
  const canvas = context();
  assert.equal(
    baselinePaint(canvas.ctx, { x: 2, y: 3, width: 600, height: 400, primitives: geometry }, 0),
    true,
  );
  assert.equal(canvas.depth(), 0);
  const result = { input: before, geometry, canvasCalls: canvas.calls, paintResult: true };
  // JSON에서 undefined/-0/비유한 값 등을 잃으면 생성 자체를 거부한다.
  assert.deepEqual(
    decodeBaselineGolden(JSON.parse(JSON.stringify(encodeBaselineGolden(result)))),
    result,
    kind + ' requires a lossless representation',
  );
  cases[kind] = encodeBaselineGolden(result);
}
writeFileSync(
  resolve(output, 'chart-family-baseline-4e99.json'),
  JSON.stringify({ schema: 1, baselineHead: provenance.baselineHead, cases }, null, 2) + '\n',
);

const abi = await import(pathToFileURL(resolve(baselineRoot, 'js/abi-schema.mjs')));
const abiGolden = {
  baselineHead: provenance.baselineHead,
  ABI_VERSION: abi.ABI_VERSION,
  REQUIRED_FUNCTIONS: abi.REQUIRED_FUNCTIONS,
  EXPERIMENTAL_EDITOR_FUNCTIONS: abi.EXPERIMENTAL_EDITOR_FUNCTIONS,
  hwpxEditSha256: sha(readFileSync(resolve(baselineRoot, 'src/wasm/hwpx_edit.zig'))),
};
writeFileSync(
  resolve(output, 'chart-profile-abi-baseline-4e99.json'),
  JSON.stringify(abiGolden, null, 2) + '\n',
);

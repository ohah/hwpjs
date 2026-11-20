import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeHwp5ChartCandidates } from '../../js/hwp5-chart-display-api.mjs';
import { hwp5ChartFrame, projectHwp5ChartContent } from '../../web/preview/hwp5-chart-content.mjs';
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/official-modern-chart-frame.json', import.meta.url), 'utf8'),
);
function fresh() {
  const packet = decodeHwp5ChartCandidates(
    new TextEncoder().encode(JSON.stringify(fixture.packet)),
  );
  return { row: packet.candidates[0], local: structuredClone(fixture.local) };
}
test('actual observed official B owner and Native local matrix yield its declared document frame', () => {
  const { row, local } = fresh(),
    frame = hwp5ChartFrame(row.owner, local, row.resource);
  assert.equal(frame.geometry.width, 20000);
  assert.equal(frame.geometry.height, 12000);
  assert.equal(row.owner.geometry.current_width, 7200);
  assert.equal(row.owner.geometry.current_height, 7200);
  assert.deepEqual(local.matrix, [1, 0, 0, 0, 1, 0]);
  assert.equal(row.owner.geometry.component_attributes, 720896);
});
test('normal internal axis scale is checked once against current viewport; common frame is not double scaled', () => {
  const { row, local } = fresh();
  const g = row.owner.geometry;
  g.original_width = 100;
  g.original_height = 80;
  g.current_width = 200;
  g.current_height = 240;
  g.width = 400;
  g.height = 480;
  local.matrix = [2, 0, 0, 0, 3, 0];
  const frame = hwp5ChartFrame(row.owner, local, row.resource);
  assert.equal(frame.geometry.width, 400);
  assert.equal(frame.geometry.height, 480);
  assert.equal(g.original_width, 100);
  assert.equal(local.matrix[0], 2);
});
test('Unknown OLE alone never becomes a chart frame without modern resource resolution', () => {
  const { row, local } = fresh();
  assert.throws(() => hwp5ChartFrame(row.owner, local));
  for (const state of ['unresolved_ole', 'unavailable', 'unknown'])
    assert.throws(() => hwp5ChartFrame(row.owner, local, { ...row.resource, state }));
  row.owner.attributes = 65537;
  assert.doesNotThrow(() => hwp5ChartFrame(row.owner, local));
  for (const kind of [2, 3, 4, 63]) {
    row.owner.attributes = 1 | (kind << 16);
    assert.throws(() => hwp5ChartFrame(row.owner, local, row.resource));
  }
});
test('missing, foreign and malformed Native local transforms remain unavailable', () => {
  for (const change of [
    (v) => {
      v.local = null;
    },
    (v) => {
      v.local.owner_node = 10;
    },
    (v) => {
      v.local.component_node = 99;
    },
    (v) => {
      v.local.matrix[0] = NaN;
    },
    (v) => {
      v.local.matrix[0] = Infinity;
    },
    (v) => {
      v.local.matrix = [];
    },
  ]) {
    const v = fresh();
    change(v);
    assert.throws(() => hwp5ChartFrame(v.row.owner, v.local, v.row.resource));
  }
});
test('rotation, reflection, skew, translation, group offsets and incomplete geometry never become zero defaults', () => {
  for (const change of [
    (v) => {
      v.row.owner.geometry.rotation_angle = null;
    },
    (v) => {
      v.row.owner.geometry.rotation_angle = 90;
    },
    (v) => {
      v.local.matrix[1] = 1;
    },
    (v) => {
      v.local.matrix[0] = -1;
    },
    (v) => {
      v.local.matrix[0] = 0;
    },
    (v) => {
      v.local.matrix[2] = 1;
    },
    (v) => {
      v.row.owner.geometry.component_attributes |= 1;
    },
    (v) => {
      v.row.owner.geometry.component_offset_x = 1;
    },
    (v) => {
      v.row.owner.geometry.component_extra_bytes = 4;
    },
    (v) => {
      delete v.row.owner.geometry.current_width;
    },
  ]) {
    const v = fresh();
    change(v);
    assert.throws(() => hwp5ChartFrame(v.row.owner, v.local, v.row.resource));
  }
});
test('matrix and current dimensions cannot disagree or be replaced by an inferred ratio', () => {
  const v = fresh();
  v.row.owner.geometry.current_width = 14400;
  assert.throws(() => hwp5ChartFrame(v.row.owner, v.local, v.row.resource));
  assert.deepEqual(v.local.matrix, [1, 0, 0, 0, 1, 0]);
});

test('request-local section join never reuses a foreign or ambiguous local row', () => {
  const packet = decodeHwp5ChartCandidates(
    new TextEncoder().encode(JSON.stringify(fixture.packet)),
  );
  // Authored placement host only: this checks section join, not actual B text layout or Canvas.
  const host = {
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        selectionOwner: 'section:0:body',
        text: '\ufffc\ufffc \ufffc',
        sourceOffsets: [
          { at: 0, source: 0 },
          { at: 1, source: 8 },
          { at: 2, source: 16 },
          { at: 4, source: 25 },
        ],
      },
    ],
    hwp5DrawingLocalTransforms: [{ ...structuredClone(fixture.local), section: 0 }],
  };
  const first = projectHwp5ChartContent(host, packet);
  assert(first.hwp5ChartTargets[0].frame);
  const foreign = {
    ...host,
    hwp5DrawingLocalTransforms: [{ ...structuredClone(fixture.local), section: 1 }],
  };
  assert(projectHwp5ChartContent(foreign, packet).hwp5ChartTargets[0].error_name);
  const duplicate = {
    ...host,
    hwp5DrawingLocalTransforms: [
      ...host.hwp5DrawingLocalTransforms,
      ...host.hwp5DrawingLocalTransforms,
    ],
  };
  assert(projectHwp5ChartContent(duplicate, packet).hwp5ChartTargets[0].error_name);
  assert.equal(first.hwp5ChartTargets[0].frame.geometry.width, 20000);
});

const createdFixture = JSON.parse(
  readFileSync(
    new URL('./fixtures/created-modern-chart-spec24-frame.json', import.meta.url),
    'utf8',
  ),
);
function freshSpec24() {
  return structuredClone(createdFixture);
}
test('own actual spec24 attrs1 modern chart retains the declared frame without changing Native observations', () => {
  const { row, local } = freshSpec24(),
    before = structuredClone({ row, local });
  assert.equal(row.owner.ole_layout, 'spec24');
  assert.equal(row.owner.attributes, 1);
  assert.equal(row.resource.state, 'modern_chart');
  const frame = hwp5ChartFrame(row.owner, local, row.resource);
  assert.equal(frame.geometry.width, 20000);
  assert.equal(frame.geometry.height, 12000);
  assert.deepEqual({ row, local }, before);
});
test('spec24 refuses wrong content aspect low bits and unsupported attributes rather than reading observed26 kind bits', () => {
  for (const attributes of [0, 2, 3, 255, 257, 513, 32769, 65537, 131073, 0xffffffff, '1', null]) {
    const { row, local } = freshSpec24();
    row.owner.attributes = attributes;
    assert.throws(
      () => hwp5ChartFrame(row.owner, local, row.resource),
      /UnsupportedHwp5ChartOleAspect/,
    );
  }
});
test('spec24 has no chart authority without the resolved modern resource', () => {
  const { row, local } = freshSpec24();
  for (const resource of [
    null,
    undefined,
    { ...row.resource, state: 'unresolved_ole' },
    { ...row.resource, state: 'unavailable' },
    { ...row.resource, state: 'unknown' },
  ])
    assert.throws(
      () => hwp5ChartFrame(row.owner, local, resource),
      /UnsupportedHwp5ChartOleAspect/,
    );
});
test('spec24 still refuses foreign owner transforms and unsupported component geometry', () => {
  for (const change of [
    (v) => {
      v.local.owner_node++;
    },
    (v) => {
      v.local.component_node++;
    },
    (v) => {
      v.local.matrix[2] = 1;
    },
    (v) => {
      v.row.owner.geometry.component_offset_x = 1;
    },
    (v) => {
      v.row.owner.geometry.component_extra_bytes = 1;
    },
    (v) => {
      delete v.row.owner.geometry.current_width;
    },
  ]) {
    const value = freshSpec24();
    change(value);
    assert.throws(() => hwp5ChartFrame(value.row.owner, value.local, value.row.resource));
  }
});
test('observed26 with the existing four opaque tail bytes keeps its complete baseline frame and kind semantics', () => {
  const { row, local } = fresh();
  assert.equal(row.owner.ole_layout, 'observed26');
  assert.equal(row.owner.opaque_tail_bytes, 4);
  assert.deepEqual(
    hwp5ChartFrame(row.owner, local, row.resource),
    createdFixture.observed30Baseline.frame,
  );
  row.owner.attributes = 65537;
  assert.deepEqual(hwp5ChartFrame(row.owner, local), createdFixture.observed30Baseline.frame);
  for (const attributes of [0, 2, 257, 131073, 4128769]) {
    row.owner.attributes = attributes;
    assert.throws(
      () => hwp5ChartFrame(row.owner, local, row.resource),
      /UnsupportedHwp5ChartOleAspect/,
    );
  }
});
test('spec24 display projection keeps the Native owner resource and exact body join; foreign rows stay unavailable', () => {
  const { packet, host } = freshSpec24();
  const decoded = decodeHwp5ChartCandidates(new TextEncoder().encode(JSON.stringify(packet)));
  const result = projectHwp5ChartContent(host, decoded),
    target = result.hwp5ChartTargets[0];
  assert.equal(result.hwp5ChartTargets.length, 1);
  assert.equal(target.frame.geometry.width, 20000);
  assert.equal(target.frame.geometry.height, 12000);
  assert.equal(target.owner, decoded.candidates[0].owner);
  assert.equal(target.resource, decoded.candidates[0].resource);
  assert.equal(target.historyRevision, 14);
  assert.equal(target.sourceEpoch, '16');
  for (const change of [
    (h) => {
      h.hwp5DrawingLocalTransforms[0].section = 1;
    },
    (h) => {
      h.hwp5DrawingLocalTransforms.push(structuredClone(h.hwp5DrawingLocalTransforms[0]));
    },
    (h) => {
      h.paragraphs[0].selectionOwner = 'section:0:cell';
    },
  ]) {
    const foreign = freshSpec24().host;
    change(foreign);
    assert.ok(projectHwp5ChartContent(foreign, decoded).hwp5ChartTargets[0].error_name);
  }
});

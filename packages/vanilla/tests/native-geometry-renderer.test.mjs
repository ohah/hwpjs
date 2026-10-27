import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../../../web/preview/renderer.mjs';
function harness(t, evidenceReader) {
  const measurementEpoch = Object.freeze({});
  const frames = [],
    fonts = new EventTarget();
  let resize,
    ratio = 1,
    layouts = 0,
    measurements = 0;
  const ctx = new Proxy(
    {
      measureText: (text) => (
        measurements++,
        { width: text.length * 8, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 }
      ),
    },
    { get: (o, key) => o[key] ?? (() => {}) },
  );
  const canvas = {
    width: 300,
    height: 150,
    style: {},
    dataset: {},
    ownerDocument: { fonts },
    getContext: () => ctx,
    getBoundingClientRect: () => ({
      width: parseFloat(canvas.style.width),
      height: parseFloat(canvas.style.height),
    }),
  };
  const viewport = Object.assign(new EventTarget(), {
    clientWidth: 800,
    clientHeight: 600,
    scrollTop: 0,
    scrollLeft: 0,
  });
  const renderer = createRenderer(
    canvas,
    viewport,
    { style: {} },
    () => {
      layouts++;
    },
    {
      ...(evidenceReader
        ? {
            nativeGeometryEvidenceReader: evidenceReader,
            geometryMeasurementEpoch: () => measurementEpoch,
          }
        : {}),
      devicePixelRatio: () => ratio,
      requestFrame: (f) => (frames.push(f), frames.length),
      cancelFrame() {},
      ResizeObserver: class {
        constructor(f) {
          resize = f;
        }
        observe() {}
        disconnect() {}
      },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
    },
  );
  t.after(() => renderer.close());
  return {
    renderer,
    canvas,
    viewport,
    fonts,
    get layouts() {
      return layouts;
    },
    get measurements() {
      return measurements;
    },
    resize: () => resize(),
    ratio: (v) => (ratio = v),
    paint() {
      let n = 0;
      while (frames.length) {
        assert(++n < 30);
        frames.shift()();
      }
    },
  };
}

function frozen(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function scene(text = '본문 가나다 abc 123') {
  return frozen({
    format: 'hwp5',
    limited: false,
    paragraphs: [
      { section: 0, paragraph: 0, text: '\ufffc' + text, editable: true, label: '문단' },
      { section: 0, paragraph: 1, text: '다른 본문', editable: true, label: '문단' },
    ],
    columnDisplaySources: [
      {
        section: 0,
        current_paragraph: 0,
        current_unit: 0,
        source_node: 11,
        paragraph_node: 0,
        flags: 4100,
        count: 1,
        kind: 0,
        direction: 0,
        same_width: true,
        spacing: 0,
        columns: [],
        line_type: 0,
        line_width: 0,
        color: 0,
        extra_bytes: 0,
        display_unit: 0,
        display_end: 1,
      },
    ],
    sectionSources: [
      {
        section: 0,
        source_node: 4,
        flags: 0,
        column_gap: 1134,
        vertical_grid: 0,
        horizontal_grid: 0,
        tab_spacing: 8000,
        numbering_id: 1,
        page_start: 0,
        picture_start: 0,
        table_start: 0,
        equation_start: 0,
        language: 0,
        extra_bytes: 0,
        extra_nonzero: false,
        extra_raw: [],
        fileVersion: 83886080,
      },
    ],
    currentParagraphFlows: [0, 1].map((paragraph) => ({
      section: 0,
      paragraph,
      source_node: paragraph,
      parent_node: null,
      top_level: true,
      generated: false,
      break_flags: paragraph === 0 ? 3 : 0,
      section_break: paragraph === 0,
      multicolumn_break: paragraph === 0,
      page_break: false,
      column_break: false,
      host: 'body',
      list_node: null,
      memo_index: null,
      memo_node: null,
      empty_line_eligible: false,
    })),
    pageSources: [
      {
        section: 0,
        source_node: 5,
        width: 59528,
        height: 84188,
        left: 8504,
        right: 8504,
        top: 5668,
        bottom: 4252,
        header: 4252,
        footer: 4252,
        gutter: 0,
        flags: 0,
        orientation: 'narrowly',
        binding: 'one_side',
        extra_bytes: 0,
      },
    ],
  });
}
// 소비자 경계 단위용 등록표이며 실제 Native provenance 증거가 아닙니다.
function registry() {
  const records = new WeakMap(),
    scope = Object.freeze({}),
    resourceLease = Object.freeze({});
  return {
    read(e, c) {
      const r = records.get(e);
      return r?.content === c ? r.metadata : undefined;
    },
    issue(c, patch = {}) {
      const evidence = Object.freeze({});
      records.set(evidence, {
        content: c,
        metadata: Object.freeze({
          scope,
          resourceLease,
          kind: 'full-baseline',
          nativeEpoch: '1',
          nativeRevision: 0,
          owner: null,
          ...patch,
        }),
      });
      return evidence;
    },
  };
}
test('소비자 renderer의 등록 stamp hit가 전체 페이지 oracle와 일치', (t) => {
  const r = registry(),
    a = harness(t),
    b = harness(t, r.read),
    c = scene(),
    e = r.issue(c);
  a.renderer.show(c, { resourceDocument: 'one' });
  b.renderer.show(c, { resourceDocument: 'one', geometryEvidence: e });
  assert.equal(a.renderer.layout().state, 'paginated', JSON.stringify(a.renderer.layout()));
  assert.deepEqual(b.renderer.layout(), a.renderer.layout());
  const beforeA = a.measurements,
    beforeB = b.measurements;
  a.renderer.show(c, { resourceDocument: 'one' });
  b.renderer.show(c, { resourceDocument: 'one', geometryEvidence: e });
  assert.deepEqual(b.renderer.layout(), a.renderer.layout());
  assert(a.measurements > beforeA);
  assert.equal(b.measurements, beforeB);
});
test('등록 없는 renderer DTO는 full fallback으로 같은 페이지를 계산', (t) => {
  const r = registry(),
    a = harness(t),
    b = harness(t, r.read),
    c = scene();
  a.renderer.show(c, { resourceDocument: 'one' });
  b.renderer.show(c, { resourceDocument: 'one', geometryEvidence: { exclusive: true } });
  assert.equal(a.renderer.layout().state, 'paginated', JSON.stringify(a.renderer.layout()));
  assert.deepEqual(b.renderer.layout(), a.renderer.layout());
  assert.equal(b.measurements, a.measurements);
});
test('폰트 이벤트/폭/DPR 변경은 Native 표식이 같아도 oracle와 일치', (t) => {
  const r = registry(),
    a = harness(t),
    b = harness(t, r.read),
    c = scene(),
    e = r.issue(c);
  a.renderer.show(c, { resourceDocument: 'one' });
  b.renderer.show(c, { resourceDocument: 'one', geometryEvidence: e });
  for (const step of [
    () => {
      a.fonts.dispatchEvent(new Event('loadingdone'));
      b.fonts.dispatchEvent(new Event('loadingdone'));
    },
    () => {
      a.viewport.clientWidth = 600;
      b.viewport.clientWidth = 600;
      a.resize();
      b.resize();
    },
    () => {
      a.ratio(2);
      b.ratio(2);
      a.resize();
      b.resize();
    },
  ]) {
    step();
    assert.deepEqual(b.renderer.layout(), a.renderer.layout());
  }
});

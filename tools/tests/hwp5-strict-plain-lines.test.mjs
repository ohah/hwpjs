import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareStrictPlainLines } from '../../js/hwp5-strict-plain-lines.mjs';
import { createBrowserStrictLayoutSaver } from '../../js/hwp5-browser-strict-layout.mjs';
const paragraph = (text) => ({
  raw: [...text].map((c) => c.charCodeAt(0)).concat(13),
  font: 'OwnFont',
  size: 1000,
  bold: false,
  italic: false,
  spacing_percent: 160,
});
const snapshot = (...texts) => ({
  schema: 1,
  version: 0x05000300,
  width: 10000,
  height: 10000,
  paragraphs: texts.map(paragraph),
});
// Synthetic measurements: these checks never claim real browser/font evidence.
const measure = (text) => ({ width: text.length * 4, ascent: 10, descent: 2 });
test('strict plain lines full width typed geometry and measured baseline', () => {
  const actual = prepareStrictPlainLines(snapshot('A한글'), measure);
  assert.deepEqual(actual, [
    {
      paragraph: 0,
      segment: {
        start: 0,
        y: 0,
        height: 1000,
        text_height: 1000,
        baseline: 750,
        spacing: 600,
        x: 0,
        width: 10000,
        flags: 393219,
      },
    },
  ]);
});
test('strict plain lines hard breaks trailing empty and paragraph continuity', () => {
  const lines = prepareStrictPlainLines(snapshot('A\n', 'B'), measure);
  assert.deepEqual(
    lines.map((l) => [l.paragraph, l.segment.start, l.segment.y, l.segment.flags]),
    [
      [0, 0, 0, 393219],
      [0, 2, 1600, 458752],
      [1, 0, 3200, 393216],
    ],
  );
});
test('strict plain lines native section prefix stays in first raw line', () => {
  const s = snapshot('A');
  s.paragraphs[0].raw.unshift(2, 0x6364, 0x7365, 0, 0, 0, 0, 2, 2, 0x6c64, 0x636f, 0, 0, 0, 0, 2);
  assert.equal(prepareStrictPlainLines(s, measure)[0].segment.start, 0);
  s.paragraphs.push({ ...s.paragraphs[0] });
  assert.throws(() => prepareStrictPlainLines(s, measure), /UnsupportedStrictBody/);
});
test('strict plain lines refuses wrap overflow and line box beyond advance', () => {
  assert.throws(
    () => prepareStrictPlainLines({ ...snapshot('A'), width: 100 }, measure),
    /NeedsWrap/,
  );
  assert.throws(
    () => prepareStrictPlainLines({ ...snapshot('A'), height: 1599 }, measure),
    /PageOverflow/,
  );
  assert.throws(
    () => prepareStrictPlainLines(snapshot('A'), () => ({ width: 1, ascent: 100, descent: 1 })),
    /LargerLineBox/,
  );
});
test('strict plain lines does not invent font metrics or repair unsupported source', () => {
  for (const ascent of [undefined, NaN, Infinity, -1])
    assert.throws(
      () => prepareStrictPlainLines(snapshot('A'), () => ({ width: 1, ascent, descent: 1 })),
      /MissingActual/,
    );
  for (const text of ['😀', 'e\u0301', 'a\tb', '\u202e'])
    assert.throws(
      () => prepareStrictPlainLines(snapshot(text), measure),
      /UnsupportedStrictScript/,
    );
  assert.throws(
    () => prepareStrictPlainLines({ ...snapshot('A'), version: 0x05000000 }, measure),
    /UnsupportedLayout/,
  );
});
test('strict plain lines measurements visit text once without changing snapshot', () => {
  const s = snapshot('A'.repeat(50000), '한'.repeat(50000));
  s.width = 100000000;
  const before = JSON.stringify(s);
  let visited = 0,
    calls = 0;
  prepareStrictPlainLines(s, (text) => {
    visited += text.length;
    calls++;
    return { width: text.length, ascent: 10, descent: 2 };
  });
  assert.equal(visited, 100000);
  assert.equal(calls, 2);
  assert.equal(JSON.stringify(s), before);
});
test('browser saver rejects absent browser ownership before touching native', async () => {
  let prepared = 0;
  const save = createBrowserStrictLayoutSaver({
    check() {},
    prepare() {
      prepared++;
    },
    cancel() {},
    commit() {
      throw Error('unexpected');
    },
  });
  await assert.rejects(save(), /OwnedLoadedBrowserFontRequired/);
  assert.equal(prepared, 0);
});

// Realm stubs test only lifecycle ordering and rejection. Not browser evidence.
function browserRealm() {
  const oldDocument = globalThis.document,
    oldFace = globalThis.FontFace;
  class Face {
    status = 'loaded';
    family = 'OwnFont';
    style = 'normal';
    weight = '400';
    stretch = 'normal';
    unicodeRange = 'U+0-10FFFF';
    featureSettings = 'normal';
    variationSettings = 'normal';
  }
  const face = new Face();
  let resolve;
  const ready = new Promise((r) => {
    resolve = r;
  });
  const listeners = new Map();
  const fonts = new Set([face]);
  fonts.status = 'loaded';
  fonts.ready = ready;
  fonts.check = () => true;
  fonts.addEventListener = (name, fn) => {
    listeners.set(name, fn);
  };
  fonts.removeEventListener = (name, fn) => {
    if (listeners.get(name) === fn) listeners.delete(name);
  };
  const ctx = {
    font: '',
    fontKerning: 'auto',
    measureText: (text) => ({
      width: text.length * 4,
      fontBoundingBoxAscent: 10,
      fontBoundingBoxDescent: 2,
    }),
  };
  globalThis.FontFace = Face;
  globalThis.document = { fonts, createElement: () => ({ getContext: () => ctx }) };
  return {
    face,
    fonts,
    listeners,
    ctx,
    resolve,
    restore() {
      if (oldDocument === undefined) delete globalThis.document;
      else globalThis.document = oldDocument;
      if (oldFace === undefined) delete globalThis.FontFace;
      else globalThis.FontFace = oldFace;
    },
  };
}
test('browser lifecycle cannot commit after a font set replacement while suspended', async () => {
  const r = browserRealm();
  try {
    let commits = 0,
      cancels = 0;
    const save = createBrowserStrictLayoutSaver({
      check() {},
      prepare: () => snapshot('A'),
      commit() {
        commits++;
      },
      cancel() {
        cancels++;
      },
    });
    const result = save({ fontFace: r.face });
    r.fonts.add(new globalThis.FontFace());
    r.resolve();
    await assert.rejects(result, /AmbiguousOwnedFontFamily|FontEnvironmentChanged/);
    assert.equal(commits, 0);
    assert.equal(cancels, 1);
    assert.equal(r.listeners.size, 0);
  } finally {
    r.restore();
  }
});
test('browser lifecycle captures native owner before await and propagates stale owner refusal', async () => {
  const r = browserRealm();
  try {
    let current = 0,
      prepared,
      cancels = 0;
    const save = createBrowserStrictLayoutSaver({
      check() {},
      prepare() {
        prepared = current;
        return snapshot('A');
      },
      commit() {
        assert.equal(prepared, 0);
        if (current !== prepared) throw Error('LayoutSourceChanged');
      },
      cancel() {
        cancels++;
      },
    });
    const result = save({ fontFace: r.face });
    current = 1;
    r.resolve();
    await assert.rejects(result, /LayoutSourceChanged/);
    assert.equal(cancels, 1);
  } finally {
    r.restore();
  }
});
test('browser lifecycle font loading event invalidates even unchanged membership', async () => {
  const r = browserRealm();
  try {
    let commits = 0;
    const save = createBrowserStrictLayoutSaver({
      check() {},
      prepare: () => snapshot('A'),
      commit() {
        commits++;
      },
      cancel() {},
    });
    const result = save({ fontFace: r.face });
    r.listeners.get('loading')();
    r.resolve();
    await assert.rejects(result, /FontEnvironmentChanged/);
    assert.equal(commits, 0);
  } finally {
    r.restore();
  }
});
test('browser lifecycle missing actual font-box metrics never reaches commit', async () => {
  const r = browserRealm();
  try {
    let commits = 0;
    r.ctx.measureText = () => ({
      width: 1,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
    });
    const save = createBrowserStrictLayoutSaver({
      check() {},
      prepare: () => snapshot('A'),
      commit() {
        commits++;
      },
      cancel() {},
    });
    const result = save({ fontFace: r.face });
    r.resolve();
    await assert.rejects(result, /MissingActualFontMetrics/);
    assert.equal(commits, 0);
  } finally {
    r.restore();
  }
});
test('browser lifecycle concurrent save refuses without cancelling first owned snapshot', async () => {
  const r = browserRealm();
  try {
    let cancels = 0,
      commits = 0;
    const save = createBrowserStrictLayoutSaver({
      check() {},
      prepare: () => snapshot('A'),
      commit(lines) {
        commits++;
        assert.equal(lines[0].segment.baseline, 750);
        return { bytes: new Uint8Array([1]), layoutRequiresReflow: false };
      },
      cancel() {
        cancels++;
      },
    });
    const first = save({ fontFace: r.face });
    await assert.rejects(save({ fontFace: r.face }), /InProgress/);
    assert.equal(cancels, 0);
    r.resolve();
    assert.equal((await first).layoutRequiresReflow, false);
    assert.equal(commits, 1);
    assert.equal(cancels, 1);
  } finally {
    r.restore();
  }
});
test('browser lifecycle preparation failure releases lock and owned resources', async () => {
  const r = browserRealm();
  try {
    let attempts = 0,
      cancels = 0;
    const save = createBrowserStrictLayoutSaver({
      check() {},
      prepare() {
        attempts++;
        throw Error('UnsupportedStrictBody');
      },
      commit() {
        throw Error('unexpected');
      },
      cancel() {
        cancels++;
      },
    });
    await assert.rejects(save({ fontFace: r.face }), /UnsupportedStrictBody/);
    await assert.rejects(save({ fontFace: r.face }), /UnsupportedStrictBody/);
    assert.equal(attempts, 2);
    assert.equal(cancels, 2);
  } finally {
    r.restore();
  }
});

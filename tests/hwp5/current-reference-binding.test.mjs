import test from "node:test";
import assert from "node:assert/strict";
import { attachHwp5CurrentReferences } from "../../web/preview/hwp5-current-reference-content.mjs";

// Deliberately unrelated to display ordinals: these are native-issued handles.
const reference = (section, id, kind = "original") =>
  Object.freeze({
    scope: "native-session-73",
    epoch: "18446744073709551615",
    kind,
    section,
    id: String(id),
    row: 0,
    column: 0,
  });
const previewOf = (counts) => ({ sections: counts.map((count) => ({ paragraphs: Array(count) })) });
const contentOf = (pairs) => ({
  paragraphs: pairs.map(([section, paragraph]) => ({
    section,
    paragraph,
    currentReference: { stale: true },
  })),
});
function fixture(counts, { source = true } = {}) {
  const refs = counts.map((count, section) =>
    Array.from({ length: count }, (_, i) =>
      reference(section, 900000 - i, i % 2 ? "generated" : "original"),
    ),
  );
  const calls = [];
  const query = (kind, section, { first, count }) => {
    calls.push({ kind, section, first, count });
    return { total: counts[section], first, references: refs[section].slice(first, first + count) };
  };
  const editor = {
    supportsCurrentReferences: () => true,
    supportsCurrentSourceReferences: () => source,
    paragraphCount: (section) => counts[section],
    currentSourceReferences: (section, options) => query("source", section, options),
    currentReferences: (section, options) => query("full", section, options),
  };
  return { refs, calls, editor, preview: previewOf(counts) };
}
function assertUnbound(content, section) {
  for (const row of content.paragraphs.filter((row) => row.section === section)) {
    assert.equal(Object.hasOwn(row, "currentReference"), false);
  }
}
function assertMismatch(content, section = 0) {
  assert.deepEqual(content.currentReferenceErrors, [
    { section, error: "CurrentReferenceDisplayMismatch" },
  ]);
  assertUnbound(content, section);
}

test("source-only binding ignores the full stream containing created cells and preserves native handles", () => {
  const f = fixture([3]);
  f.editor.currentReferences = () => {
    throw new Error("full stream includes created cells");
  };
  const content = contentOf([
    [0, 2],
    [0, 0],
    [0, 1],
  ]);
  assert.strictEqual(attachHwp5CurrentReferences(f.editor, f.preview, content), content);
  assert.deepEqual(content.currentReferenceErrors, []);
  for (const row of content.paragraphs) {
    assert.strictEqual(row.currentReference, f.refs[0][row.paragraph]);
    assert.equal(row.currentReference.scope, "native-session-73");
    assert.equal(row.currentReference.epoch, "18446744073709551615");
    assert.notEqual(row.currentReference.id, String(row.paragraph));
  }
  assert.deepEqual(f.calls, [{ kind: "source", section: 0, first: 0, count: 3 }]);
});

test("display context across 1023/1024 queries only its occupied chunks once", () => {
  const f = fixture([4099, 5]);
  const content = contentOf([
    [0, 1023],
    [0, 1024],
    [0, 1025],
    [0, 1024],
  ]);
  attachHwp5CurrentReferences(f.editor, f.preview, content);
  assert.deepEqual(f.calls, [
    { kind: "source", section: 0, first: 0, count: 1024 },
    { kind: "source", section: 0, first: 1024, count: 1024 },
  ]);
  assert.deepEqual(content.currentReferenceErrors, []);
  for (const row of content.paragraphs)
    assert.strictEqual(row.currentReference, f.refs[0][row.paragraph]);
  assert.strictEqual(
    content.paragraphs[1].currentReference,
    content.paragraphs[3].currentReference,
  );
});

test("legacy ABI fallback binds section-local ordinals and clips the last chunk", () => {
  const f = fixture([1027, 2], { source: false });
  const content = contentOf([
    [0, 1026],
    [1, 1],
    [0, 1],
  ]);
  attachHwp5CurrentReferences(f.editor, f.preview, content);
  assert.deepEqual(f.calls, [
    { kind: "full", section: 0, first: 1024, count: 3 },
    { kind: "full", section: 0, first: 0, count: 1024 },
    { kind: "full", section: 1, first: 0, count: 2 },
  ]);
  assert.deepEqual(content.currentReferenceErrors, []);
  for (const row of content.paragraphs)
    assert.strictEqual(row.currentReference, f.refs[row.section][row.paragraph]);
  assert.notStrictEqual(
    content.paragraphs[1].currentReference,
    content.paragraphs[2].currentReference,
  );
});

test("absent current-reference ABI strips stale handles without any native query", () => {
  for (const available of [undefined, false]) {
    const content = contentOf([
      [0, 0],
      [1, 1],
    ]);
    const forbidden = () => assert.fail("unavailable ABI must not be queried");
    const editor = {
      paragraphCount: forbidden,
      currentReferences: forbidden,
      currentSourceReferences: forbidden,
      supportsCurrentSourceReferences: forbidden,
    };
    if (available === false) editor.supportsCurrentReferences = () => false;
    assert.strictEqual(attachHwp5CurrentReferences(editor, {}, content), content);
    assertUnbound(content, 0);
    assertUnbound(content, 1);
  }
});

test("native/preview paragraph-count disagreement refuses binding before window queries", () => {
  const f = fixture([2]);
  const content = contentOf([[0, 0]]);
  attachHwp5CurrentReferences(f.editor, previewOf([3]), content);
  assertMismatch(content);
  assert.deepEqual(f.calls, []);
});

test("a malformed later window leaves no partial section bindings", () => {
  const corruptions = [
    (window) => ({ ...window, total: window.total + 1 }),
    (window) => ({ ...window, first: 0 }),
    (window) => ({ ...window, references: window.references.slice(1) }),
    (window) => ({ ...window, references: [...window.references, reference(0, 17)] }),
    (window) => ({ ...window, references: [reference(1, 17), ...window.references.slice(1)] }),
    (window) => ({
      ...window,
      references: [reference(0, 17, "cell"), ...window.references.slice(1)],
    }),
  ];
  for (const [index, corrupt] of corruptions.entries()) {
    const f = fixture([1026]);
    const query = f.editor.currentSourceReferences;
    f.editor.currentSourceReferences = (section, options) => {
      const window = query(section, options);
      return options.first === 1024 ? corrupt(window) : window;
    };
    const content = contentOf([
      [0, 0],
      [0, 1025],
    ]);
    attachHwp5CurrentReferences(f.editor, f.preview, content);
    assertMismatch(content);
    assert.equal(f.calls.length, 2, `corruption ${index} must reach the later chunk`);
  }
});

test("a missing displayed binding rolls back its section while another section succeeds", () => {
  const f = fixture([2, 2]);
  const content = contentOf([
    [0, 0],
    [0, 2],
    [1, 0],
  ]);
  attachHwp5CurrentReferences(f.editor, f.preview, content);
  assertMismatch(content);
  assert.strictEqual(content.paragraphs[2].currentReference, f.refs[1][0]);
});

test("source-query failure is reported per section without falling back or leaving stale handles", () => {
  const f = fixture([2, 2]);
  const query = f.editor.currentSourceReferences;
  f.editor.currentSourceReferences = (section, options) => {
    if (section === 0) throw new Error("InvalidHwp5CurrentReference");
    return query(section, options);
  };
  f.editor.currentReferences = () => assert.fail("source failure must not switch ordinal domains");
  const content = contentOf([
    [0, 0],
    [1, 1],
  ]);
  attachHwp5CurrentReferences(f.editor, f.preview, content);
  assert.deepEqual(content.currentReferenceErrors, [
    { section: 0, error: "InvalidHwp5CurrentReference" },
  ]);
  assertUnbound(content, 0);
  assert.strictEqual(content.paragraphs[1].currentReference, f.refs[1][1]);
});

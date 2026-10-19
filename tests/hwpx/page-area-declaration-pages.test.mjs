import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bindPageAreaDeclarationPages as bind } from "../../web/preview/page-area-declaration-pages.mjs";
import { layoutPageContent } from "../../web/preview/page-content-layout.mjs";

function fixture() {
  const paragraph = { section: 0, paragraph: 2, text: "A😀B" };
  const declaration = { section: 0, paragraph: 2, sourceElement: 9, unit: 3, affinity: "right" };
  const content = { paragraphs: [paragraph], pageAreaDeclarations: [declaration], pageAreaDeclarationErrors: [] };
  const row = { ...paragraph, kind: "text", startUnit: 0, endUnit: 4, pageOrdinal: 0 };
  const layout = { state: "paginated", limited: false, pages: [{ ordinal: 0, section: 0 }], rows: [row] };
  return { content, layout };
}

test("declaration physical pages bind exact current rows without changing source data", () => {
  const { content, layout } = fixture(), before = structuredClone({ content, layout });
  assert.deepEqual(bind(content, layout), { state: "bound", declarations: [{ ...content.pageAreaDeclarations[0], pageOrdinal: 0 }] });
  for (const unit of [0, 1, 3, 4]) {
    content.pageAreaDeclarations[0].unit = unit;
    assert.equal(bind(content, layout).state, "bound");
  }
  content.pageAreaDeclarations[0].unit = 3;
  assert.deepEqual({ content, layout }, before);
  content.pageAreaDeclarations[0].unit = 2;
  assert.equal(bind(content, layout).error, "InvalidPageAreaDeclaration");
});

test("page boundary declaration never uses edit affinity to guess a physical page", () => {
  const { content, layout } = fixture();
  layout.pages.push({ ordinal: 1, section: 0 });
  layout.rows = [{ ...layout.rows[0], text: "A", endUnit: 1 },
    { ...layout.rows[0], text: "😀B", startUnit: 1, pageOrdinal: 1 }];
  content.pageAreaDeclarations[0].unit = 1;
  for (const affinity of ["left", "right"]) {
    content.pageAreaDeclarations[0].affinity = affinity;
    assert.equal(bind(content, layout).error, "AmbiguousPageAreaDeclarationPage");
  }
  layout.rows[1].pageOrdinal = 0;
  assert.equal(bind(content, layout).declarations[0].pageOrdinal, 0);
});

test("declaration binding refuses missing text, duplicate identity, wrong section and stale query errors", () => {
  const run = mutate => { const f = fixture(); mutate(f); return bind(f.content, f.layout); };
  assert.equal(run(f => f.layout.rows = []).error, "IncompletePageAreaDeclarationCoverage");
  assert.equal(run(f => f.content.pageAreaDeclarations.push(f.content.pageAreaDeclarations[0])).error, "AmbiguousPageAreaDeclaration");
  assert.equal(run(f => f.layout.pages[0].section = 1).error, "InvalidPageAreaDeclarationPage");
  assert.equal(run(f => f.content.pageAreaDeclarationErrors.push({ section: 0, error: "SourceBindingMismatch" })).error, "MissingPageAreaDeclarationLayout");
  assert.equal(run(f => f.layout.limited = true).error, "MissingPageAreaDeclarationLayout");
  assert.equal(run(f => f.layout.rows.push(null)).error, "MissingPageAreaDeclarationLayout");
  assert.equal(run(f => f.layout.pages.push(null)).error, "MissingPageAreaDeclarationLayout");
  for (const field of ["section", "paragraph", "sourceElement", "unit"]) {
    assert.equal(run(f => f.content.pageAreaDeclarations[0][field] = 0x100000000).error, "InvalidPageAreaDeclaration", field);
  }
  assert.equal(run(f => {
    f.layout.rows[0].pageOrdinal = 0x100000000;
    f.layout.pages[0].ordinal = 0x100000000;
  }).error, "InvalidPageAreaDeclarationPage");
});

test("request-local indexes retain duplicate ownership and strict numeric identity", () => {
  const { content, layout } = fixture();
  content.paragraphs.push({ ...content.paragraphs[0], section: "0" });
  layout.rows.push({ ...layout.rows[0], paragraph: "2" });
  layout.pages.push({ ...layout.pages[0], ordinal: "0" });
  assert.equal(bind(content, layout).state, "bound");
  content.paragraphs.push({ ...content.paragraphs[0] });
  assert.equal(bind(content, layout).error, "InvalidPageAreaDeclaration");
  content.paragraphs.pop();
  layout.pages.push({ ...layout.pages[0] });
  assert.equal(bind(content, layout).error, "InvalidPageAreaDeclarationPage");
  layout.pages.pop();
  layout.pages[0].ordinal = 1;
  layout.rows[0].pageOrdinal = 1;
  assert.equal(bind(content, layout).declarations[0].pageOrdinal, 1, "a subsequent layout never reuses prior page indexes");
});

test("unrelated paragraph rows and pages are indexed once rather than rescanned for every declaration", () => {
  const { content, layout } = fixture();
  const reads = { paragraph: 0, row: 0, page: 0 };
  const unrelated = key => ({ get section() { reads[key]++; return 99; } });
  content.paragraphs.push({ ...content.paragraphs[0], get section() { reads.paragraph++; return 99; } });
  layout.rows.push(Object.assign(unrelated("row"), { kind: "text", paragraph: 2 }));
  layout.pages.push(Object.assign(unrelated("page"), { ordinal: 0 }));
  content.pageAreaDeclarations = Array.from({ length: 100 }, (_, index) => ({ ...content.pageAreaDeclarations[0], sourceElement: index + 1 }));
  const result = bind(content, layout);
  assert.equal(result.state, "bound", result.error);
  assert.equal(result.declarations.length, 100);
  assert.deepEqual(reads, { paragraph: 1, row: 1, page: 1 });
});

test("actual headerfooter declaration coordinates bind to the composed body page", { skip: !process.env.HWPJS_TEST_WASM }, async t => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM), previousSelf = globalThis.self, previousFetch = globalThis.fetch, replies = [];
  globalThis.self = { postMessage: reply => replies.push(reply) };
  globalThis.fetch = async () => new Response(wasm);
  t.after(() => { globalThis.self = previousSelf; globalThis.fetch = previousFetch; });
  await import("../../web/preview/reader-worker.mjs?declaration-pages=" + Date.now());
  try {
    await self.onmessage({ data: { kind: "load", format: "hwpx", bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx") } });
    const reply = replies.shift(); assert.equal(reply.error, undefined);
    const layout = layoutPageContent(reply.content, text => ({ width: text.length * 8, height: 16 }));
    assert.equal(layout.state, "paginated", layout.error);
    const result = bind(reply.content, layout);
    assert.equal(result.state, "bound", result.error);
    assert.equal(result.declarations.length, 2);
    assert.deepEqual(result.declarations.map(row => row.pageOrdinal), [0, 0]);
  } finally { await self.onmessage({ data: { kind: "load", format: "close-audit", bytes: [] } }); }
});

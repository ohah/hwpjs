import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { decodeOleSites, decodeOleSource } from "../../js/hwpx-ole-source.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";
const encode = value => new TextEncoder().encode(JSON.stringify(value));

test("OLE source wire rejects broken ownership and shares strict shape scalar validation", () => {
  const site = { ole_node: 5, paragraph: 2, anchor_unit: 0, error_name: null };
  assert.deepEqual(decodeOleSites(encode([site])), [site]);
  assert.deepEqual(decodeOleSites(encode([])), []);
  for (const value of [null, {}, [null], [site, site], [{ ...site, paragraph: 0 }], [{ ...site, anchor_unit: null }],
    [{ ...site, ole_node: -1 }], [{ ...site, error_name: "MadeUpError" }]]) assert.throws(() => decodeOleSites(encode(value)), /InvalidOleSites/);
  const source = { geometry: { width: 0, height: null, width_relative: 4, height_relative: 2, treat_as_character: false,
    horizontal_offset: 0, vertical_offset: null }, position: { flags: [null, true, false, null], relations: [2, 2, 0, 2] },
    flow: { text_wrap: 1, text_flow: 0, z_order: null, outside_margins: [0, 0, null, null] },
    binary_item_id: "", object_type: "FUTURE", draw_aspect: null, has_moniker: null };
  assert.deepEqual(decodeOleSource(encode(source)), source);
  for (const mutate of [v => delete v.position, v => delete v.binary_item_id, v => v.has_moniker = 0,
    v => v.geometry.width = -1, v => v.geometry.treat_as_character = 1,
    v => v.position.relations[0] = 3, v => v.flow.text_flow = 4, v => v.flow.outside_margins = [],
    v => v.binary_item_id = "\ud800", v => v.binary_item_id = "가".repeat(1366)]) {
    const value = structuredClone(source); mutate(value); assert.throws(() => decodeOleSource(encode(value)), /InvalidOleSource/);
  }
  for (const bytes of [null, "[]", new Uint8Array([255])]) {
    assert.throws(() => decodeOleSource(bytes)); assert.throws(() => decodeOleSites(bytes));
  }
  const bytes = encode(source);
  for (let at = 0; at < bytes.length; at++) assert.throws(() => decodeOleSource(bytes.subarray(0, at)));
});

test("actual OLE API retains identity through input history and independently verified save", { skip: !process.env.HWPJS_TEST_WASM }, async () => {
  const input = readFileSync("reference/rhwp/samples/hwpx/143E433F503322BD33.hwpx");
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  let source;
  try {
    assert.throws(() => editor.oleSites(0), /EditorNotOpen/);
    editor.open(input); editor.enableHistory();
    const sites = editor.oleSites(0); assert.equal(sites.length, 1);
    assert.equal(sites[0].paragraph, 11); assert.equal(sites[0].anchor_unit, 1); assert.equal(sites[0].error_name, null);
    source = editor.oleSource(0, sites[0].ole_node);
    assert.equal(source.binary_item_id, "ole3"); assert.equal(source.geometry.width, 22677);
    const independent = JSON.parse(execFileSync("python3", ["-c", `import sys,json,zipfile,io,xml.etree.ElementTree as E
r=E.fromstring(zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).read('Contents/section0.xml'))
p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
nodes=list(r.iter());ole=[x for x in nodes if x.tag==p+'ole']
if len(ole)!=1:raise ValueError('ambiguous OLE')
o=ole[0];print(json.dumps(dict(node=nodes.index(o),binary=o.get('binaryItemIDRef'),width=int(o.find(p+'sz').get('width')))))`], { input, encoding: "utf8", timeout: 30000 }));
    assert.deepEqual(independent, { node: sites[0].ole_node, binary: source.binary_item_id, width: source.geometry.width });
    assert.throws(() => editor.oleSource(0, 0), /InvalidOleDisplayNode/);
    assert.throws(() => editor.oleSites(999), /InvalidSectionIndex/);
    assert.deepEqual(Buffer.from(editor.save()), input);
    const marker = "앞😀";
    editor.spliceAnchored(0, 11, 0, 0, marker);
    assert.equal(editor.oleSites(0)[0].anchor_unit, 4);
    assert.deepEqual(editor.oleSource(0, sites[0].ole_node), source);
    assert.equal(sites[0].anchor_unit, 1);
    const saved = editor.save();
    const payload = { before: input.toString("base64"), after: Buffer.from(saved).toString("base64"), section: 0, paragraph: 11, text: marker, mode: "anchored" };
    for (const flags of [[], ["-O"]]) {
      execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], { input: JSON.stringify(payload), timeout: 30000 });
      assert.throws(() => execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], { input: JSON.stringify({ ...payload, text: "wrong" }), timeout: 30000 }), e => e.status === 1 && /complete XML mismatch/.test(String(e.stderr)));
    }
    assert.equal(editor.undo(), true); assert.deepEqual(editor.oleSites(0), sites); assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true); assert.equal(editor.oleSites(0)[0].anchor_unit, 4);
    editor.open(saved); assert.equal(editor.oleSites(0)[0].anchor_unit, 4);
  } finally { editor.close(); }
  assert.equal(source.binary_item_id, "ole3");
  assert.throws(() => editor.oleSites(0), /EditorClosed/);
});

test("OLE optional API refuses old WASM without a fabricated empty inventory", { skip: !process.env.HWPJS_BASELINE_WASM }, async () => {
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_BASELINE_WASM));
  try { assert.throws(() => editor.oleSites(0), /HwpxOleSourceAbiUnavailable/); assert.throws(() => editor.oleSource(0, 1), /HwpxOleSourceAbiUnavailable/); }
  finally { editor.close(); }
});

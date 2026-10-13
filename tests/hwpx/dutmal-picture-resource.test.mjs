import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness } from "../canvas/worker-harness.mjs";
import { createPictureResources } from "../../web/preview/picture-resources.mjs";
import { pictureLayoutCoverage } from "../../web/preview/picture-layout-coverage.mjs";
import { pictureCoverageText } from "../../web/preview/picture-coverage-status.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("actual dutmal missing picture binding is a read refusal not a codec invocation", async t => {
  assert(process.env.HWPJS_TEST_WASM, "explicit current candidate required");
  const input = readFileSync("reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx");
  const source = JSON.parse(execFileSync("python3", ["-c", `import base64,io,json,sys,zipfile,xml.etree.ElementTree as E
with zipfile.ZipFile(io.BytesIO(base64.b64decode(json.load(sys.stdin)['bytes']))) as z:
 r=E.fromstring(z.read('Contents/section0.xml'))
 print(json.dumps({'refs':[n.get('binaryItemIDRef') for n in r.iter('{http://www.hancom.co.kr/hwpml/2011/core}img')],'png':base64.b64encode(z.read('BinData/image1.png')).decode()}))`], {
    input: JSON.stringify({ bytes: input.toString("base64") }), encoding: "utf8", timeout: 30000,
  }));
  assert.deepEqual(source.refs, ["image1", ""]);
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({ kind: "load", format: "hwpx", bytes: input });
  assert.equal(loaded.error, undefined);
  assert.deepEqual(loaded.content.pictures.map(p => p.pictureNode), [53, 98]);
  let decodes = 0;
  const resources = createPictureResources({
    read: async (section, pictureNode) => {
      const reply = await h.send({ kind: "picture-bytes", section, pictureNode }, false);
      if (reply.error) throw new Error(reply.error);
      assert.deepEqual(Buffer.from(reply.bytes), Buffer.from(source.png, "base64"));
      return reply.bytes;
    },
    decode: bytes => { decodes++; assert.equal(bytes.length, 21787); return { width: 196, height: 196, close() {} }; },
  });
  try {
    await resources.load(0, 53); await resources.load(0, 98);
    assert.equal(decodes, 1);
    assert.equal(resources.status(0, 98).error, "MissingPictureImage");
    const coverage = pictureLayoutCoverage(loaded.content, new Map(), { behind: [], front: loaded.content.pictures.map(picture => ({ picture })) }, (section, node) => resources.status(section, node));
    assert.equal(coverage.decoded, 1); assert.equal(coverage.failed, 1);
    assert.deepEqual(coverage.failures, [{ section: 0, pictureNode: 98, error: "MissingPictureImage" }]);
    assert.match(pictureCoverageText(coverage), /0:98 이미지 연결 없음/);
    assert.equal((await h.send({ kind: "enable" })).error, undefined);
    assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
  } finally { resources.close(); }
  t.diagnostic("Native bytes and independent XML/ZIP; codec is simulated, not another browser PNG decode proof");
});

test("picture failure details reject inconsistent counts and invalid identifiers", () => {
  const coverage = { total: 1, eligible: 1, pending: 0, decoded: 0, failed: 1, loading: 0,
    failures: [{ section: 0, pictureNode: 98, error: "MissingPictureImage" }] };
  for (const failures of [[], null, [{ section: -1, pictureNode: 98, error: "bad" }], [{ section: 0, pictureNode: 98, error: "" }], [{ section: 0, pictureNode: 98, error: "x".repeat(161) }]])
    assert.equal(pictureCoverageText({ ...coverage, failures }), "그림 상태 미확인");
  assert.equal(pictureCoverageText({ total: 0, eligible: 0, pending: 0, decoded: 0, failed: 0, loading: 0, failures: null }), "그림 상태 미확인");
});

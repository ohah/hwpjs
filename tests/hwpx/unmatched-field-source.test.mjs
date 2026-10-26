import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { createHwpxReader } from '../../js/hwpx.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';

const inventory = `import sys,io,json,zipfile,xml.etree.ElementTree as E
root=E.fromstring(zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).read('Contents/section0.xml'))
p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
ends={n.get('beginIDRef') for n in root.iter(p+'fieldEnd')}
print(json.dumps(sorted(n.get('id') for n in root.iter(p+'fieldBegin') if n.get('id') not in ends)))`;

for (const [name, ids] of [
  ['80168', ['1575661054']],
  ['86712', ['1505851682', '1505851683', '1505851685', '1505851896']],
])
  test(`unmatched source fields remain readable and byte-identical without implicit repair: ${name}`, async (t) => {
    const path = `reference/rhwp/samples/issue1891/${name}_regulatory_analysis.hwpx`;
    if (!existsSync(path)) {
      t.skip('optional reference fixture is absent');
      return;
    }
    const input = readFileSync(path),
      original = Buffer.from(input);
    assert.deepEqual(
      JSON.parse(execFileSync('python3', ['-c', inventory], { input, timeout: 30000 }).toString()),
      ids,
    );
    const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
    const editor = await createHwpxEditor(wasm),
      reader = await createHwpxReader(wasm);
    try {
      assert.ok(reader.readTextEvents(input).paragraphCount > 0);
      editor.open(input);
      const saved = Buffer.from(editor.save());
      assert.deepEqual(saved, original, 'missing field ends must not be silently invented');
      editor.open(saved);
      assert.deepEqual(Buffer.from(editor.save()), original);
      assert.deepEqual(input, original);
      assert.deepEqual(readFileSync(path), original);
    } finally {
      editor.close();
      reader.close();
    }
  });

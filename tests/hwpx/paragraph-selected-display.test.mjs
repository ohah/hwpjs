import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from '../../tools/oracle-process.mjs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';

// Independent ZIP/expanded-name traversal, without product selection helpers.
const oracle = (path) =>
  JSON.parse(
    execFileSync(
      'python3',
      [
        '-B',
        '-c',
        `
import json,sys,zipfile,xml.etree.ElementTree as E
h="{http://www.hancom.co.kr/hwpml/2011/head}"
p="{http://www.hancom.co.kr/hwpml/2011/paragraph}"
c="{http://www.hancom.co.kr/hwpml/2011/core}"
ep="{http://www.idpf.org/2007/ops}"
root=E.fromstring(zipfile.ZipFile(sys.argv[1]).read("Contents/header.xml"))
def children(node):
 for child in node:
  if child.tag!=p+"switch":
   yield child
   continue
  for branch in child:
   required=[branch.get(ns+"required-namespace") for ns in (p,ep)]
   chosen=branch.tag==p+"default" or (branch.tag==p+"case" and any(v is not None and len(v)>0 and not v.split() for v in required))
   if chosen:
    yield from children(branch)
    break
def one(node,tag):
 values=[e for e in children(node) if e.tag==tag]
 if len(values)>1: raise ValueError("duplicate selected child")
 return values[0] if values else None
def measure(node):
 if node is None: return None
 value=node.get("value")
 return dict(value=int(value) if value is not None else None,unit=node.get("unit"))
rows=[]
for node in root.iter(h+"paraPr"):
 align=one(node,h+"align"); spacing=one(node,h+"lineSpacing"); margin=one(node,h+"margin")
 rows.append(dict(id=int(node.get("id")),horizontal=None if align is None else align.get("horizontal"),
  spacing_type=None if spacing is None else spacing.get("type"),spacing=measure(spacing),
  margins=[None if margin is None else measure(one(margin,c+name)) for name in ("intent","left","right","prev","next")]))
print(json.dumps(sorted(rows,key=lambda row:row["id"])))
`,
        path,
      ],
      { encoding: 'utf8', timeout: 30000 },
    ),
  );

for (const path of [
  'reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx',
  'reference/rhwp/samples/hwpx/exam_social.hwpx',
])
  test('selected paragraph display matches independent header XML: ' + path, async (t) => {
    const input = readFileSync(path),
      before = Buffer.from(input);
    const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
    try {
      editor.open(input);
      const expected = oracle(path);
      assert.ok(expected.some((row) => row.margins.some((margin) => margin?.value < 0)));
      const actual = editor.paragraphShapes();
      assert.equal(actual.length, expected.length);
      for (const [index, row] of expected.entries())
        assert.deepEqual(actual[index], row, 'paragraph shape ' + row.id);
      t.diagnostic(JSON.stringify({ path, resources: expected.length }));
      assert.deepEqual(Buffer.from(editor.save()), before);
      assert.deepEqual(input, before);
    } finally {
      editor.close();
    }
  });

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { insertPrefix } from '../../tools/hwpx-prefix-edit-probe.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';

test('reference BOOKMARK field input retains section settings and trailing bookmark', async () => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit bookmark candidate required');
  const input = readFileSync(
    'reference/rhwp/samples/hwpx/opengov/36388711_사회보장제도 신설 협의요청서(청년오피스)_260624.hwpx',
  );
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    editor.open(input);
    editor.enableHistory();
    assert.equal(editor.canEdit(0, 1), false, 'whole paragraph remains field protected');
    const labels = editor.fieldLabels(0, 1);
    assert.equal(labels.length, 1);
    assert.equal(labels[0].start, 0);
    const text = '책갈피😀<&';
    insertPrefix(editor, 0, 1, text);
    const saved = Buffer.from(editor.save());
    const request = {
      before: input.toString('base64'),
      after: saved.toString('base64'),
      section: 0,
      paragraph: 1,
      text,
      mode: 'direct_text',
    };
    for (const flags of [[], ['-O']]) {
      const verify = (value) =>
        execFileSync('python3', [...flags, 'tools/hwpx-anchor-prefix-oracle.py'], {
          input: JSON.stringify(value),
          timeout: 30000,
        });
      verify(request);
      const bookmarkRequest = { ...request, mode: 'prefix', beginId: '1115723309' };
      execFileSync('python3', [...flags, 'tools/hwpx-bookmark-field-oracle.py'], {
        input: JSON.stringify(bookmarkRequest),
        timeout: 30000,
      });
      assert.throws(
        () =>
          execFileSync('python3', [...flags, 'tools/hwpx-bookmark-field-oracle.py'], {
            input: JSON.stringify({ ...bookmarkRequest, text: 'wrong' }),
            timeout: 30000,
          }),
        (error) => error.status === 1 && /Unexpected XML change/.test(String(error.stderr)),
      );
      assert.throws(
        () => verify({ ...request, text: 'wrong' }),
        (error) => error.status === 1 && /complete XML mismatch/.test(String(error.stderr)),
      );
    }
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    editor.open(saved);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    assert.equal(editor.fieldLabels(0, 1)[0].end, labels[0].end + text.length);
    const unsupported = Buffer.from(
      execFileSync(
        'python3',
        [
          '-c',
          `
import base64, io, json, sys, zipfile
source = zipfile.ZipFile(io.BytesIO(base64.b64decode(json.load(sys.stdin)["before"])))
output = io.BytesIO()
with zipfile.ZipFile(output, "w") as target:
    target.comment = source.comment
    for entry in source.infolist():
        data = source.read(entry.filename)
        if entry.filename == "Contents/section0.xml":
            if data.count(b'type="BOOKMARK"') != 1: raise ValueError("Unexpected BOOKMARK count")
            data = data.replace(b'type="BOOKMARK"', b'type="DATE"')
        target.writestr(entry, data)
print(base64.b64encode(output.getvalue()).decode())
`,
        ],
        {
          input: JSON.stringify({ before: input.toString('base64') }),
          encoding: 'utf8',
          timeout: 30000,
        },
      ).trim(),
      'base64',
    );
    editor.open(unsupported);
    editor.enableHistory();
    assert.equal(editor.canEdit(0, 1), false);
    assert.deepEqual(editor.fieldLabels(0, 1), []);
    assert.throws(
      () => editor.spliceFieldLabel(0, 1, labels[0].beginElement, 0, 0, 'bad'),
      /UnsupportedFieldLabel/,
    );
    assert.deepEqual(Buffer.from(editor.save()), unsupported);
  } finally {
    editor.close();
  }
});

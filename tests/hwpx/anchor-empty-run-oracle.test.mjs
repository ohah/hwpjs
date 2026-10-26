import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from '../../tools/oracle-process.mjs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { insertPrefix } from '../../tools/hwpx-prefix-edit-probe.mjs';

test('independent selected paragraph order shares branch rules without modifying source XML', () => {
  const program = String.raw`
import sys,hashlib,xml.etree.ElementTree as E
sys.path.insert(0,'tools')
from hwpx_text_snapshot_order import selected_paragraphs,update_ordered,PARA,CHART
source="<r xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='outer'><p:run><p:switch><p:case p:required-namespace='"+CHART+"'><p:p id='case'/></p:case><p:default><p:p id='default'/></p:default></p:switch></p:run></p:p><p:p id='after'><p:run><p:t>A<p:p id='inline'/>B</p:t></p:run></p:p></r>"
root=E.fromstring(source,parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True)));original=E.tostring(root)
switch=next(root.iter(PARA+'switch'));switch.insert(1,E.Comment('preserved branch comment'));original=E.tostring(root)
for mode,expected in [('raw',['outer','case','default','after']),('selected_default',['outer','default','after']),('selected_chart',['outer','case','after'])]:
 chosen=selected_paragraphs(root,mode)
 if [p.get('id') for p in chosen]!=expected:raise ValueError('Incorrect source paragraph order')
 counts=[0]*6;update_ordered(root,hashlib.sha256(),bytearray(),counts,mode)
 if counts[1]!=len(chosen) or E.tostring(root)!=original:raise ValueError('Order walker changed selection or XML')
for mutation in ['requirement','children','parent']:
 bad=E.fromstring(source);switch=next(bad.iter(PARA+'switch'))
 if mutation=='requirement':switch.find(PARA+'case').set(PARA+'required-namespace','urn:unmodeled')
 if mutation=='children':switch.remove(switch.find(PARA+'default'))
 if mutation=='parent':next(bad.iter(PARA+'run')).tag=PARA+'future'
 try:selected_paragraphs(bad)
 except AssertionError:pass
 else:raise ValueError('Accepted unmodeled source branch')
print('selected paragraph modes and three invalid branch forms verified')
`;
  for (const flags of [[], ['-O']])
    assert.match(
      execFileSync('python3', [...flags, '-c', program], { encoding: 'utf8', timeout: 10000 }),
      /selected paragraph modes and three invalid branch forms verified/,
    );
});

test('actual report anchor uses selected paragraph order and preserves inactive branch XML', async () => {
  assert(process.env.HWPJS_TEST_WASM, 'ExplicitSelectedParagraphCandidateRequired');
  const path = 'reference/rhwp/samples/issue2006/1790387_prep_final_report.hwpx',
    input = readFileSync(path);
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    editor.open(input);
    editor.enableHistory();
    assert.equal(editor.anchorText(0, 495), '\ufffc');
    const marker = '활성분기😀<&';
    editor.spliceAnchored(0, 495, 0, 0, marker);
    const saved = Buffer.from(editor.save());
    const request = {
      mode: 'anchored',
      before: input.toString('base64'),
      after: saved.toString('base64'),
      section: 0,
      paragraph: 495,
      text: marker,
    };
    for (const flags of [[], ['-O']]) {
      const verify = (data) =>
        execFileSync('python3', [...flags, 'tools/hwpx-anchor-prefix-oracle.py'], {
          input: JSON.stringify(data),
          encoding: 'utf8',
          timeout: 30000,
        });
      assert.equal(verify(request), '');
      assert.throws(
        () => verify({ ...request, paragraph: 496 }),
        (error) => error.status === 1 && /complete XML mismatch/.test(String(error.stderr)),
      );
    }
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    editor.open(saved);
    assert.equal(editor.anchorText(0, 495), marker + '\ufffc');
    assert.deepEqual(Buffer.from(editor.save()), saved);
    assert.deepEqual(readFileSync(path), input);
  } finally {
    editor.close();
  }
});

test('anchored oracle keeps the existing empty run before a differently styled table', () => {
  for (const flags of [[], ['-O']]) {
    const result = JSON.parse(
      execFileSync('python3', [...flags, 'tests/hwpx/anchor-empty-run-oracle.py'], {
        encoding: 'utf8',
        timeout: 30000,
      }),
    );
    assert.deepEqual(result, { accepted: 1, rejected: 4 });
  }
});

test('actual hwpx_sample2 empty source run preserves style XML history and reopen', async (t) => {
  const path = 'reference/rhwp/samples/hwpx_sample2.hwpx';
  if (!existsSync(path)) return t.skip('RHWP reference fixture is not present');
  assert(process.env.HWPJS_TEST_WASM, 'Explicit candidate required');
  const input = readFileSync(path),
    marker = '경로😀<&';
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    editor.open(input);
    editor.enableHistory();
    const original = editor.anchorText(0, 1);
    assert.equal(original, '\ufffc');
    insertPrefix(editor, 0, 1, marker);
    const saved = Buffer.from(editor.save());
    const request = {
      mode: 'anchored',
      before: input.toString('base64'),
      after: saved.toString('base64'),
      section: 0,
      paragraph: 1,
      text: marker,
    };
    const mutants = JSON.parse(
      execFileSync('python3', ['tests/hwpx/anchor-empty-run-oracle.py', '--mutants'], {
        input: JSON.stringify(request),
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 8 * 1024 * 1024,
      }),
    );
    for (const flags of [[], ['-O']]) {
      const verify = (value) =>
        execFileSync('python3', [...flags, 'tools/hwpx-anchor-prefix-oracle.py'], {
          input: JSON.stringify(value),
          encoding: 'utf8',
          timeout: 30000,
        });
      assert.equal(verify(request), '');
      for (const after of Object.values(mutants))
        assert.throws(
          () => verify({ ...request, after }),
          (error) => error.status === 1 && /complete XML mismatch/.test(String(error.stderr)),
        );
    }
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    editor.open(saved);
    assert.equal(editor.anchorText(0, 1), marker + original);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    for (const after of Object.values(mutants)) {
      editor.open(Buffer.from(after, 'base64'));
      assert.equal(
        editor.anchorText(0, 1),
        marker + original,
        'text-only checks cannot detect wrong owner/style',
      );
    }
    assert.deepEqual(readFileSync(path), input);
  } finally {
    editor.close();
  }
});

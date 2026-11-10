import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNewDocumentBytes } from '../../js/new-document.mjs';
import { createEditor } from '../../packages/core/src/editor/create-editor.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';
import {
  SPLICE_TEXT_COMMAND,
  APPLY_FORMATTING_PATCH_COMMAND,
} from '../../packages/core/src/commands/commands.ts';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const wasmPath = process.env.HWPJS_TEST_WASM;
assert(wasmPath && isAbsolute(wasmPath), 'Absolute HWPJS_TEST_WASM required');
const wasmBytes = readFileSync(wasmPath);
assert.match(process.env.HWPJS_TEST_WASM_SHA256 ?? '', /^[a-f0-9]{64}$/);
assert.equal(sha(wasmBytes), process.env.HWPJS_TEST_WASM_SHA256);
const module = await WebAssembly.compile(wasmBytes);
const evidenceRoot = process.env.HWPJS_TEST_EVIDENCE_DIR;
if (evidenceRoot) assert(isAbsolute(evidenceRoot));
function evidence(name, bytes) {
  if (evidenceRoot) writeFileSync(resolve(evidenceRoot, name), bytes, { flag: 'wx' });
}
evidence(
  'inputs.json',
  JSON.stringify(
    {
      sourceRoot,
      wasmPath,
      wasmSha256: sha(wasmBytes),
      testSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
    },
    null,
    2,
  ),
);

// Standard-library ZIP/XML inspection, independent of the product parser.
// Raw resource boundaries and compressed-member extraction reuse the tracked oracle.
const oraclePath = 'tools/formatting-evidence/hwpx_oracle.py';
const oracleBytes = readFileSync(resolve(sourceRoot, oraclePath));
assert.deepEqual(
  oracleBytes,
  execFileSync('git', ['-C', sourceRoot, 'show', `HEAD:${oraclePath}`]),
);
const python = String.raw`
import sys,json,base64,io,zipfile,xml.etree.ElementTree as E,importlib.util
spec=importlib.util.spec_from_file_location('independent_hwpx',sys.argv[1]);o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o)
raw=base64.b64decode(json.load(sys.stdin)['bytes']);H=o.HH;P=o.HP
with zipfile.ZipFile(io.BytesIO(raw)) as z:
 h=E.fromstring(z.read('Contents/header.xml'))
 chars={x.get('id'):{'size':int(x.get('height')),'bold':x.find(H+'bold')is not None,'italic':x.find(H+'italic')is not None,'textColor':x.get('textColor','').lower()}for x in h.iter(H+'charPr')}
 paras={x.get('id'):{'alignment':x.find(H+'align').get('horizontal'),'grid':x.get('snapToGrid')}for x in h.iter(H+'paraPr')}
 styles={x.get('id'):{'char':x.get('charPrIDRef'),'para':x.get('paraPrIDRef')}for x in h.iter(H+'style')}
 body=[]
 for name in z.namelist():
  if not(name.startswith('Contents/section')and name.endswith('.xml')):continue
  for p in E.fromstring(z.read(name)).findall(P+'p'):
   units=[];text=''
   for run in p.findall(P+'run'):
    t=''.join(x.text or ''for x in run.iter(P+'t'));text+=t;units.extend([chars[run.get('charPrIDRef')]]*(len(t.encode('utf-16-le'))//2))
   body.append({'text':text,'style':p.get('styleIDRef'),'paragraph':paras[p.get('paraPrIDRef')],'units':units,'xml':E.tostring(p,encoding='unicode')})
 entries={n:{'data':base64.b64encode(z.read(n)).decode(),'compressed':base64.b64encode(o.compressed_member(raw,z.getinfo(n))).decode(),'meta':{k:(list(v)if isinstance(v,tuple)else v.hex()if isinstance(v,bytes)else v)for k in o.METADATA for v in [getattr(z.getinfo(n),k)]}}for n in z.namelist()}
 resources={str(k):v.hex()for k,v in o.raw_resources(z.read('Contents/header.xml')).items()}
 print(json.dumps({'body':body,'chars':chars,'paras':paras,'styles':styles,'resources':resources,'entries':entries,'names':z.namelist(),'comment':z.comment.hex()}))
`;
function inspect(bytes) {
  return JSON.parse(
    execFileSync('python3', ['-I', '-B', '-c', python, resolve(sourceRoot, oraclePath)], {
      input: JSON.stringify({ bytes: bytes.toString('base64') }),
      maxBuffer: 16 * 1024 * 1024,
    }).toString(),
  );
}
function semantic(view) {
  return view.body.map(({ text, paragraph, units }) => ({ text, paragraph, units }));
}
function preserved(before, after, target) {
  assert.deepEqual(after.names, before.names);
  assert.equal(after.comment, before.comment);
  for (const name of before.names) {
    assert.deepEqual(after.entries[name].meta, before.entries[name].meta, name);
    if (!['Contents/header.xml', 'Contents/section0.xml'].includes(name))
      assert.deepEqual(after.entries[name], before.entries[name], name);
  }
  for (const [key, raw] of Object.entries(before.resources))
    assert.equal(after.resources[key], raw, key);
  assert.equal(after.body.length, before.body.length);
  for (let i = 0; i < before.body.length; i++) {
    assert.equal(after.body[i].text, before.body[i].text);
    if (i !== target) assert.deepEqual(after.body[i], before.body[i], `non-target paragraph ${i}`);
  }
}
function target(editor, paragraph = 2, startUnit = 0, endUnit = 4) {
  return {
    ...editor.getEditorState().token,
    coordinateSpace: 'display',
    format: 'hwpx',
    owner: 'section:0:body',
    section: 0,
    paragraph,
    startUnit,
    endUnit,
    affinity: 'forward',
  };
}
function committed(reply) {
  assert.equal(reply.status, 'committed-with-snapshot', JSON.stringify(reply));
  assert.equal(reply.changed, true);
}
async function session(generated = true) {
  const editor = createEditor({
    runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
  });
  const save = async () => Buffer.from((await editor.save({ allowStaleLayout: true })).bytes);
  const structure = async (kind, paragraph, atUnit) => {
    committed(
      await editor.requestExperimental(
        { kind, section: 0, paragraph, ...(kind === 'split' ? { atUnit, endUnit: atUnit } : {}) },
        { mutation: true, token: editor.getEditorState().token },
      ),
    );
  };
  try {
    await editor.load(await createNewDocumentBytes(module, 'hwpx'), { format: 'hwpx' });
    if (generated) {
      const p = editor.getEditorState().content.paragraphs.find((p) => p.paragraph === 0);
      committed(
        await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
          target: target(editor, 0, p.text.length, p.text.length),
          text: 'CONTROL',
        }),
      );
      await structure('split', 0, p.text.length + 7);
      committed(
        await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
          target: target(editor, 1, 0, 0),
          text: 'BODY😀AB',
        }),
      );
      await structure('split', 1, 4);
      assert.equal(
        editor.getEditorState().content.paragraphs.find((p) => p.paragraph === 2).text,
        '😀AB',
      );
    }
    return {
      editor,
      save,
      structure,
      patch: (patch, paragraph = 2) =>
        editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
          target: target(editor, paragraph),
          patch,
        }),
    };
  } catch (error) {
    await editor.dispose();
    throw error;
  }
}
const combined = {
  character: { size: 1900, bold: true, italic: true, textColor: 0x2468ac },
  paragraph: { alignment: 'CENTER' },
};
async function history(s, before, after) {
  assert.equal((await s.editor.undo()).changed, true);
  assert.deepEqual(await s.save(), before);
  assert.equal((await s.editor.redo()).changed, true);
  assert.deepEqual(await s.save(), after);
}

test('generated HWPX same-session query and combined patch, no-op and exact single undo/redo', async () => {
  const s = await session();
  try {
    // The first query and mutation precede any save/reopen.
    const query = await s.editor.queryFormatting(target(s.editor), {
      fields: ['character.size', 'paragraph.alignment'],
    });
    assert.equal(query.targets.length, 1);
    committed(await s.patch(combined));
    const after = await s.save();
    assert.equal((await s.editor.undo()).changed, true);
    const before = await s.save();
    assert.equal((await s.editor.redo()).changed, true);
    assert.deepEqual(await s.save(), after);
    const b = inspect(before),
      a = inspect(after);
    preserved(b, a, 2);
    assert.equal(a.body[2].paragraph.alignment, 'CENTER');
    for (const unit of a.body[2].units)
      assert.deepEqual(unit, { size: 1900, bold: true, italic: true, textColor: '#2468ac' });
    const noOp = await s.patch(combined);
    assert.equal(noOp.status, 'known-no-op');
    assert.deepEqual(await s.save(), after);
    await history(s, before, after);
    evidence('combined-before.hwpx', before);
    evidence('combined-after.hwpx', after);
    evidence('combined-oracle.json', JSON.stringify({ before: semantic(b), after: semantic(a) }));
  } finally {
    await s.editor.dispose();
  }
});

for (const scope of ['character', 'paragraph', 'all'])
  test(`generated HWPX style reset ${scope} preserves the other scope`, async () => {
    const s = await session();
    try {
      committed(await s.patch(combined));
      const before = await s.save(),
        b = inspect(before),
        style = b.styles[b.body[2].style];
      assert(style);
      committed(await s.patch({ reset: { basis: 'paragraph-style', scope } }));
      const after = await s.save(),
        a = inspect(after);
      preserved(b, a, 2);
      if (scope !== 'character') assert.deepEqual(a.body[2].paragraph, b.paras[style.para]);
      else assert.deepEqual(a.body[2].paragraph, b.body[2].paragraph);
      if (scope !== 'paragraph')
        for (const unit of a.body[2].units) assert.deepEqual(unit, b.chars[style.char]);
      else assert.deepEqual(a.body[2].units, b.body[2].units);
      const again = await s.patch({ reset: { basis: 'paragraph-style', scope } });
      assert.equal(again.status, 'known-no-op');
      assert.deepEqual(await s.save(), after);
      await history(s, before, after);
      evidence(`reset-${scope}-before.hwpx`, before);
      evidence(`reset-${scope}-after.hwpx`, after);
    } finally {
      await s.editor.dispose();
    }
  });

test('generated HWPX late scalar failure keeps all targets unchanged and preserves redo', async () => {
  const s = await session();
  try {
    const before = await s.save();
    committed(await s.patch(combined));
    const after = await s.save();
    assert.equal((await s.editor.undo()).changed, true);
    const first = await s.editor.queryFormatting(target(s.editor, 1), { fields: [] });
    const second = await s.editor.queryFormatting(target(s.editor), { fields: [] });
    const rejected = await s.editor.requestExperimental(
      {
        kind: 'formatting-patch',
        request: {
          schemaVersion: 1,
          binding: second.binding,
          targets: [
            first.targets[0],
            { ...second.targets[0], ranges: [{ startUnit: 1, endUnit: 2 }] },
          ],
          patch: combined,
        },
      },
      { mutation: true, token: s.editor.getEditorState().token },
    );
    assert.equal(rejected.status, 'rejected-unapplied');
    assert.match(rejected.error ?? '', /Surrogate|Scalar|InvalidFormattingRange/);
    assert.deepEqual(await s.save(), before);
    assert.equal((await s.editor.redo()).changed, true);
    assert.deepEqual(await s.save(), after);
  } finally {
    await s.editor.dispose();
  }
});

test('generated HWPX current query follows ordinal movement and rejects stale binding', async () => {
  const s = await session();
  try {
    const old = await s.editor.queryFormatting(target(s.editor), { fields: [] });
    await s.structure('split', 1, 2);
    assert.equal(
      s.editor.getEditorState().content.paragraphs.find((p) => p.paragraph === 3).text,
      '😀AB',
    );
    const before = await s.save();
    const stale = await s.editor.requestExperimental(
      {
        kind: 'formatting-patch',
        request: { schemaVersion: 1, binding: old.binding, targets: old.targets, patch: combined },
      },
      { mutation: true, token: s.editor.getEditorState().token },
    );
    assert.equal(stale.status, 'rejected-unapplied');
    assert.deepEqual(await s.save(), before);
    committed(await s.patch(combined, 3));
    const a = inspect(await s.save());
    assert.equal(a.body[3].paragraph.alignment, 'CENTER');
    await s.structure('merge', 1);
    assert.equal(
      s.editor.getEditorState().content.paragraphs.find((p) => p.paragraph === 2).text,
      '😀AB',
    );
    await s.editor.queryFormatting(target(s.editor), { fields: [] });
  } finally {
    await s.editor.dispose();
  }
});

test('original HWPX calibration remains independently writable', async () => {
  const s = await session(false);
  try {
    const row = s.editor.getEditorState().content.paragraphs.find((p) => p.paragraph === 0);
    committed(
      await s.editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
        target: target(s.editor, 0, row.text.length, row.text.length),
        text: 'CONTROL',
      }),
    );
    const t = target(s.editor, 0, row.text.length, row.text.length + 7);
    await s.editor.queryFormatting(t, { fields: [] });
    committed(
      await s.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
        target: t,
        patch: combined,
      }),
    );
    const view = inspect(await s.save());
    assert.equal(view.body[0].paragraph.alignment, 'CENTER');
    for (const u of view.body[0].units.slice(row.text.length)) assert.equal(u.size, 1900);
  } finally {
    await s.editor.dispose();
  }
});

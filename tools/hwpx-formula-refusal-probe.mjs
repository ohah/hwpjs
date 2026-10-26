import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { createHwpxEditor } from '../js/hwpx-editor.mjs';
import { execFileSync } from './oracle-process.mjs';

const args = process.argv.slice(2);
if (args.length !== 1 || !args[0].startsWith('--wasm=') || !isAbsolute(args[0].slice(7))) {
  throw new Error(
    'Usage: node tools/hwpx-formula-refusal-probe.mjs --wasm=/absolute/candidate/hwpjs.wasm',
  );
}
const wasm = readFileSync(args[0].slice(7));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const cases = [
  ['hwpx/aift.hwpx', 2],
  ['issue1891_external_bindata_link.hwpx', 0],
  ['issue3637/regulatory_impact_nested_table_escape.hwpx', 0],
  ['issue6298/copay_cap_tac_table_leading.hwpx', 0],
  ['tac-img-02.hwpx', 0],
];
console.log(
  JSON.stringify({
    kind: 'scope',
    wasmSha256: sha(wasm),
    files: cases.length,
    scope:
      'selected sections of five known formula refusal fixtures; queries and unchanged-save only',
  }),
);
const editor = await createHwpxEditor(wasm);
let refused = 0;
try {
  for (const [file, section] of cases) {
    let stage = 'read-fixture',
      input;
    const started = performance.now();
    try {
      input = readFileSync('reference/rhwp/samples/' + file);
      const inputSha256 = sha(input);
      stage = 'open';
      editor.open(input);
      console.log(
        JSON.stringify({ kind: 'stage', file, section, stage, status: 'ok', inputSha256 }),
      );
      stage = 'paragraphTextSnapshot';
      const paragraphs = editor.paragraphTextSnapshot(section).length;
      console.log(
        JSON.stringify({ kind: 'stage', file, section, stage, status: 'ok', paragraphs }),
      );
      stage = 'formulaCurrent';
      const formulas = editor.formulaCurrent(section);
      console.log(
        JSON.stringify({
          kind: 'stage',
          file,
          section,
          stage,
          status: 'ok',
          results: formulas.map((field) => field.values.last_result),
        }),
      );
      stage = 'save-after-query';
      const saved = editor.save();
      if (!Buffer.from(saved).equals(input)) {
        const code = `import base64,io,json,runpy,zipfile,xml.etree.ElementTree as E
d=json.load(__import__('sys').stdin)
a=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['before'])))
b=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['after'])))
diff=runpy.run_path('tools/hwpx-structure-formula-oracle.py')['difference']
def differences(left,right,path='section'):
 out=[]
 for key,a,b in [('tag',left.tag,right.tag),('attributes',left.attrib,right.attrib),('text',left.text or '',right.text or ''),('tail',left.tail or '',right.tail or '')]:
  if a!=b: out.append({'path':path,'kind':key,'before':a,'after':b})
 if len(left)!=len(right):out.append({'path':path,'kind':'child-count','before':len(left),'after':len(right)})
 else:
  for i,(a,b) in enumerate(zip(left,right)):out.extend(differences(a,b,path+'/'+str(i)+':'+str(a.tag).rsplit('}',1)[-1]))
 return out
out=[]
for name in a.namelist():
 if name not in b.namelist(): out.append({'part':name,'difference':'missing'});continue
 left,right=a.read(name),b.read(name)
 if left!=right:
  try: detail=diff(E.fromstring(left),E.fromstring(right)); all_changes=differences(E.fromstring(left),E.fromstring(right))
  except E.ParseError: detail='binary payload differs'
  out.append({'part':name,'difference':detail,'beforeBytes':len(left),'afterBytes':len(right),'changes':all_changes if detail!='binary payload differs' else []})
print(json.dumps({'inventoryEqual':a.namelist()==b.namelist(),'payloads':out},ensure_ascii=False))`;
        const difference = JSON.parse(
          execFileSync('python3', ['-c', code], {
            input: JSON.stringify({
              before: input.toString('base64'),
              after: Buffer.from(saved).toString('base64'),
            }),
            encoding: 'utf8',
            timeout: 30000,
          }),
        );
        console.log(JSON.stringify({ kind: 'save-difference', file, section, difference }));
        throw new Error('UnchangedSaveDiffers');
      }
      if (sha(input) !== inputSha256) throw new Error('InputBufferMutated');
      console.log(
        JSON.stringify({
          kind: 'stage',
          file,
          section,
          stage,
          status: 'byte-identical',
          elapsedMs: performance.now() - started,
        }),
      );
    } catch (error) {
      refused += 1;
      console.log(
        JSON.stringify({
          kind: 'refusal',
          file,
          section,
          stage,
          error: error.message,
          elapsedMs: performance.now() - started,
        }),
      );
    }
  }
} finally {
  editor.close();
}
console.log(
  JSON.stringify({
    kind: 'summary',
    files: cases.length,
    queriedAndUnchanged: cases.length - refused,
    refused,
  }),
);
if (refused) process.exitCode = 1;

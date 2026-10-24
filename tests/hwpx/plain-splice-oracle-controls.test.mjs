import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';

// Python owns ZIP/XML mutation controls; no WASM or product build is involved.
const controls = String.raw`
import base64, io, runpy, zipfile
o = runpy.run_path('tools/hwpx-plain-splice-oracle.py')
verify, parse, P = o['verify'], o['parse'], o['P']
part = 'Contents/section0.xml'
source = open('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx', 'rb').read()
with zipfile.ZipFile(io.BytesIO(source)) as z:
    xml = z.read(part)
root = parse(xml)
paragraph = next(root.iter(P+'p'))
if [c.tag for r in paragraph.findall(P+'run') for c in r] != [P+'secPr', P+'ctrl', P+'t']:
    raise ValueError('charshape source layout changed')
def package(tree):
    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(source)) as z, zipfile.ZipFile(out, 'w') as w:
        w.comment = z.comment
        for entry in z.infolist():
            w.writestr(entry, o['ET'].tostring(tree) if entry.filename == part else z.read(entry))
    return base64.b64encode(out.getvalue()).decode()
def changed():
    tree = parse(xml)
    next(tree.iter(P+'t')).text = '검증😀가'
    return tree
request = dict(before=base64.b64encode(source).decode(), after=package(changed()),
               part=part, index=0, start=0, end=0, text='검증😀',
               preserve_section_metadata=True, paragraph_order='selected_default')
positive = negative = 0
def accept(patch):
    global positive
    verify({**request, **patch})
    positive += 1
def reject(patch):
    global negative
    try:
        verify({**request, **patch})
    except (ValueError, AssertionError):
        negative += 1
    else:
        raise ValueError('Accepted mutation: '+str(patch.keys()))
accept({})
accept(dict(paragraph_order='raw'))
accept(dict(after=base64.b64encode(source).decode(), text='', start=0, end=0))
for patch in [dict(preserve_section_metadata=False), dict(preserve_section_metadata='true'),
              dict(preserve_section_metadata=1), dict(text='WRONG'), dict(index=1),
              dict(paragraph_order='document'), dict(index=True)]:
    reject(patch)
for kind in ['attribute', 'nested', 'delete', 'move', 'duplicate', 'tail', 'comment', 'pi', 'style', 'other-text']:
    tree = changed()
    para = next(tree.iter(P+'p'))
    run = para.find(P+'run')
    sec, ctrl = list(run)
    if kind == 'attribute': sec.set('spaceColumns', '999')
    elif kind == 'nested': next(sec.iter(P+'margin')).set('left','999')
    elif kind == 'delete': run.remove(sec)
    elif kind == 'move': run.remove(sec); para.findall(P+'run')[1].append(sec)
    elif kind == 'duplicate': run.append(parse(o['ET'].tostring(sec)))
    elif kind == 'tail': ctrl.tail = 'changed'
    elif kind == 'comment': sec.append(o['ET'].Comment('changed'))
    elif kind == 'pi': sec.append(o['ET'].ProcessingInstruction('changed','value'))
    elif kind == 'style': run.set('charPrIDRef','999')
    elif kind == 'other-text': list(tree.iter(P+'t'))[1].text = 'changed'
    reject(dict(after=package(tree)))
# Even unchanged protected controls in BOTH archives must be refused.
for name in ['fieldBegin','fieldEnd','autoNum','bookmark','footNote','unknown']:
    for mixed in [False, True]:
        before, after = parse(xml), changed()
        for tree in [before, after]:
            ctrl = next(tree.iter(P+'ctrl'))
            if not mixed: ctrl.clear()
            o['ET'].SubElement(ctrl, P+name)
        reject(dict(before=package(before), after=package(after)))
# Selected-default index must skip case paragraphs and select default in order.
template = '<s xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph"><p:p><p:run><p:switch><p:case p:required-namespace="http://www.hancom.co.kr/hwpml/2016/ooxmlchart"><p:p><p:run><p:t>CASE</p:t></p:run></p:p></p:case><p:default><p:p><p:run><p:t>DEFAULT</p:t></p:run></p:p></p:default></p:switch></p:run></p:p></s>'
before, after = parse(template), parse(template)
list(after.iter(P+'t'))[1].text = '검DEFAULT'
patch = dict(before=package(before),after=package(after),index=1,text='검')
accept(patch)
reject({**patch, 'paragraph_order':'raw'})
print('section metadata controls: %d positive, %d negative' % (positive, negative))
`;

for (const flags of [[], ['-O']]) {
  test(`section metadata whole-tree controls Python ${flags.join(' ') || 'normal'}`, () => {
    const result = spawnSync('nice', ['-n', '19', 'python3', ...flags, '-c', controls], {
      encoding: 'utf8', timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /section metadata controls: 4 positive, 30 negative/);
  });
}

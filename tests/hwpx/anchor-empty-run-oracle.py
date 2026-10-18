"""Independent source-owner witnesses and negative controls; no product parser."""
import base64
import copy
import importlib.util
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('oracle', 'tools/hwpx-anchor-prefix-oracle.py')
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)
NS = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'


def archive(xml):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as z:
        z.writestr('Contents/section0.xml', xml)
        z.writestr('untouched', b'unchanged')
    return base64.b64encode(output.getvalue()).decode()


def mutants(encoded):
    source = zipfile.ZipFile(io.BytesIO(base64.b64decode(encoded)))
    root = ET.fromstring(source.read('Contents/section0.xml'))
    paragraph = next(root.iter(NS + 'p'))
    runs = paragraph.findall(NS + 'run')
    owner = next(run for run in runs if run.find(NS + 't') is not None)
    anchor = next(run for run in runs if run.find(NS + 'tbl') is not None)
    result = {}
    for name in ('wrong_run', 'changed_style', 'changed_metadata'):
        changed = copy.deepcopy(root)
        current = next(changed.iter(NS + 'p')).findall(NS + 'run')
        changed_owner = current[runs.index(owner)]
        if name == 'wrong_run':
            text = changed_owner.find(NS + 't')
            changed_owner.remove(text)
            current[runs.index(anchor)].insert(0, text)
        elif name == 'changed_style':
            changed_owner.set('charPrIDRef', anchor.attrib['charPrIDRef'])
        else:
            current[0].set('charPrIDRef', '999999')
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w') as z:
            z.comment = source.comment
            for entry in source.infolist():
                payload = ET.tostring(changed, encoding='utf-8') if entry.filename == 'Contents/section0.xml' else source.read(entry.filename)
                z.writestr(copy.copy(entry), payload)
        result[name] = base64.b64encode(output.getvalue()).decode()
    return result


def self_test():
    start = '<hp:p xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">'
    metadata = '<hp:run charPrIDRef="1"><hp:secPr/><hp:ctrl><hp:colPr/></hp:ctrl></hp:run>'
    empty = '<hp:run charPrIDRef="7"/>'
    anchor = '<hp:run charPrIDRef="9"><hp:tbl id="42"/></hp:run>'
    before = archive(start + metadata + empty + anchor + '</hp:p>')
    after = archive(start + metadata + '<hp:run charPrIDRef="7"><hp:t>yes</hp:t></hp:run>' + anchor + '</hp:p>')
    request = dict(before=before, after=after, section=0, paragraph=1, text='yes', mode='anchored')
    oracle.verify(request)
    rejected = 0
    for mutant in mutants(after).values():
        try:
            oracle.verify(dict(request, after=mutant))
        except ValueError as error:
            if str(error) != 'complete XML mismatch':
                raise
            rejected += 1
        else:
            raise RuntimeError('mutant accepted')
    # An explicit but text-bearing run is not an unambiguous empty owner.
    ambiguous = archive(start + metadata + '<hp:run charPrIDRef="7"> </hp:run>' + anchor + '</hp:p>')
    try:
        oracle.verify(dict(request, before=ambiguous))
    except ValueError as error:
        if str(error) != 'ambiguous empty run':
            raise
        rejected += 1
    else:
        raise RuntimeError('ambiguous owner accepted')
    return dict(accepted=1, rejected=rejected)


if len(sys.argv) == 1:
    print(json.dumps(self_test()))
elif sys.argv[1:] == ['--mutants']:
    print(json.dumps(mutants(json.load(sys.stdin)['after'])))
else:
    raise ValueError('unknown witness mode')

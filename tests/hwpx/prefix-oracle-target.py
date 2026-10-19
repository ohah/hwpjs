import base64
import importlib.util
import io
import zipfile
import warnings

spec = importlib.util.spec_from_file_location('oracle', 'tools/hwpx-anchor-prefix-oracle.py')
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)

def archive(xml):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as z:
        z.writestr('Contents/section0.xml', xml)
    return base64.b64encode(output.getvalue()).decode()

prefix = '<hp:p xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"><hp:run charPrIDRef="0">'
for leaf in ('<hp:lineBreak/>', '<hp:lineBreak>hidden</hp:lineBreak>', '<hp:lineBreak><hp:tab/></hp:lineBreak>', '<x:lineBreak xmlns:x="urn:foreign"/>'):
    source = archive(prefix + '<hp:t>' + leaf + '</hp:t></hp:run></hp:p>')
    saved = archive(prefix + '<hp:t>' + leaf + 'yes</hp:t></hp:run></hp:p>')
    request = dict(before=source, after=saved, section=0, paragraph=1, text='yes', mode='after_leading_line_break')
    if leaf == '<hp:lineBreak/>':
        oracle.verify(request)
    else:
        try:
            oracle.verify(request)
        except ValueError as error:
            if str(error) != 'ambiguous leading line break':
                raise
        else:
            raise RuntimeError('invalid line break accepted')
before = archive(prefix + '</hp:run></hp:p>')
after = archive(prefix + '<hp:t>yes</hp:t></hp:run></hp:p>')
payload = dict(before=before, after=after, section=0, paragraph=1, text='yes', mode='plain_text')
oracle.verify(payload)
for patch, expected in [({'section': 1}, 'target section inventory'), ({'section': -1}, 'section index'), ({'paragraph': 0}, 'paragraph index'), ({'paragraph': -1}, 'paragraph index'), ({'paragraph': 2}, 'paragraph index'), ({'paragraph': True}, 'paragraph index'), ({'text': 'wrong'}, 'complete XML mismatch')]:
    try:
        oracle.verify(dict(payload, **patch))
    except ValueError as error:
        if str(error) != expected:
            raise RuntimeError('unexpected rejection') from error
    else:
        raise RuntimeError('invalid target accepted')

def two_sections(last_text):
    output = io.BytesIO()
    root = '<hp:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">'
    paragraph = '<hp:p><hp:run><hp:t>%s</hp:t></hp:run></hp:p>'
    with zipfile.ZipFile(output, 'w') as z:
        z.writestr('Contents/section0.xml', root + paragraph % 'one' + paragraph % 'two' + '</hp:sec>')
        z.writestr('Contents/section1.xml', root + paragraph % last_text + '</hp:sec>')
    return base64.b64encode(output.getvalue()).decode()

document = dict(before=two_sections('three'), after=two_sections('yesthree'),
                section=1, paragraph=3, paragraphScope='document', text='yes', mode='direct_text')
oracle.verify(document)
oracle.verify(dict(document, paragraphScope='section', paragraph=1))
for patch, expected in [({'paragraphScope': 'section'}, 'paragraph index'),
                        ({'paragraph': 1}, 'paragraph index'),
                        ({'paragraphScope': 'guess'}, 'paragraph scope'),
                        ({'paragraphScope': None}, 'paragraph scope'),
                        ({'text': 'wrong'}, 'complete XML mismatch')]:
    try:
        oracle.verify(dict(document, **patch))
    except ValueError as error:
        if str(error) != expected:
            raise RuntimeError('unexpected multi-section rejection') from error
    else:
        raise RuntimeError('invalid multi-section target accepted')

output = io.BytesIO()
with warnings.catch_warnings():
    warnings.simplefilter('ignore', UserWarning)
    with zipfile.ZipFile(output, 'w') as z:
        for _ in range(2):
            z.writestr('Contents/section0.xml', prefix + '</hp:run></hp:p>')
duplicate = base64.b64encode(output.getvalue()).decode()
try:
    oracle.verify(dict(payload, before=duplicate, after=duplicate))
except ValueError as error:
    if str(error) != 'target section inventory':
        raise RuntimeError('unexpected duplicate rejection') from error
else:
    raise RuntimeError('duplicate section accepted')

# Zero-width settings stay before the visible endnote anchor. Hidden text and
# foreign names must not acquire the metadata-only exemption.
body = '<hp:ctrl><hp:endNote/></hp:ctrl><hp:t>tail</hp:t>'
for name in ('newNum', 'pageNum', 'bookmark', 'pageHiding'):
    setting = '<hp:ctrl><hp:%s num="23"/></hp:ctrl>' % name
    source = archive(prefix + setting + body + '</hp:run></hp:p>')
    saved = archive(prefix + setting + '<hp:t>yes</hp:t>' + body + '</hp:run></hp:p>')
    request = dict(before=source, after=saved, section=0, paragraph=1, text='yes', mode='anchored')
    oracle.verify(request)
    mutant = archive(prefix + setting.replace('num="23"', 'num="24"') + '<hp:t>yes</hp:t>' + body + '</hp:run></hp:p>')
    try:
        oracle.verify(dict(request, after=mutant))
    except ValueError as error:
        if str(error) != 'complete XML mismatch':
            raise
    else:
        raise RuntimeError('metadata mutation accepted')
for setting in ('<hp:ctrl><hp:pageHiding>hidden</hp:pageHiding></hp:ctrl>',
                '<hp:ctrl><hp:pageHiding><hp:tab/></hp:pageHiding></hp:ctrl>',
                '<hp:ctrl>hidden<hp:pageHiding/></hp:ctrl>',
                '<hp:ctrl><hp:pageHiding/>hidden</hp:ctrl>',
                '<hp:ctrl><x:pageHiding xmlns:x="urn:foreign"/></hp:ctrl>',
                '<hp:ctrl><hp:newNum>hidden</hp:newNum></hp:ctrl>',
                '<hp:ctrl>hidden<hp:newNum/></hp:ctrl>',
                '<hp:ctrl><hp:newNum/>hidden</hp:ctrl>',
                '<hp:ctrl><x:newNum xmlns:x="urn:foreign"/></hp:ctrl>'):
    source = archive(prefix + setting + body + '</hp:run></hp:p>')
    saved = archive(prefix + setting + '<hp:t>yes</hp:t>' + body + '</hp:run></hp:p>')
    try:
        oracle.verify(dict(before=source, after=saved, section=0, paragraph=1, text='yes', mode='anchored'))
    except ValueError as error:
        if str(error) != 'complete XML mismatch':
            raise
    else:
        raise RuntimeError('non-metadata content silently skipped')

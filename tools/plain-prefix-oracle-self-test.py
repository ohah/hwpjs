"""Source-only empty-run affinity cases; no product parser or writer imports."""
import base64
import importlib.util
import io
from pathlib import Path
import zipfile

spec = importlib.util.spec_from_file_location('prefix_oracle', Path(__file__).with_name('hwpx-anchor-prefix-oracle.py'))
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)
counts = {'positive':0, 'negative':0}


def archive(body, other=b'keep'):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as target:
        target.writestr('Contents/section0.xml', "<s xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>" + body + '</p:p></s>')
        target.writestr('Contents/header.xml', other)
    return base64.b64encode(output.getvalue()).decode()


def verify(before, after, mode='plain_text', other=b'keep'):
    oracle.verify({'before':archive(before), 'after':archive(after, other), 'section':0, 'paragraph':1, 'text':'X<&', 'mode':mode})
    counts['positive'] += 1


def rejected(before, after, mode='plain_text', other=b'keep'):
    try:
        verify(before, after, mode, other)
    except ValueError:
        counts['negative'] += 1
        return
    raise ValueError('Oracle accepted incorrect source owner or unrelated delta')


empty = "<p:run charPrIDRef='4'/>"
inserted = "<p:run charPrIDRef='4'><p:t>X&lt;&amp;</p:t></p:run>"
text = "<p:run charPrIDRef='1'><p:t>body</p:t></p:run>"
changed_text = "<p:run charPrIDRef='1'><p:t>X&lt;&amp;body</p:t></p:run>"
metadata = "<p:run><p:secPr/><p:ctrl><p:colPr/></p:ctrl></p:run>"
second = "<p:run charPrIDRef='9'/>"
changed_second = "<p:run charPrIDRef='9'><p:t>X&lt;&amp;</p:t></p:run>"

for before, after in (
    (empty + text, inserted + text),
    (metadata + empty + text, metadata + inserted + text),
    (empty, inserted),
    (text + empty, changed_text + empty),
    (empty + second + text, inserted + second + text),
):
    verify(before, after)
    rejected(before, after, other=b'changed')
    rejected(before, after.replace('X&lt;&amp;', 'wrong', 1))

rejected(empty + text, empty + changed_text)
rejected(empty + second + text, empty + changed_second + text)
rejected(empty + text, inserted.replace("'4'", "'3'") + text)
rejected(empty + text, inserted + text.replace('body', 'corrupt'))
verify(empty + text, empty + changed_text, 'direct_text')
rejected(empty + text, inserted + text, 'direct_text')
if counts != {'positive':6, 'negative':15}:
    raise ValueError('Missing oracle self-test coverage: ' + str(counts))
print('plain prefix oracle: ' + str(counts))

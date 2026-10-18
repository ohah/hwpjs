"""Test-only mutations of the observed title/BOOKMARK fixture."""
import base64
import io
import json
import sys
import zipfile

data = json.load(sys.stdin)
replacements = {
    'unknown-field': (b'type="BOOKMARK"', b'type="DATE"'),
    'unknown-control': (b'<hp:titleMark', b'<hp:unknownMark'),
    'malformed-title': (b'<hp:titleMark ignore="1"/>', b'<hp:titleMark ignore="1"><hp:t>hidden</hp:t></hp:titleMark>'),
    'unknown-run-control': (b'<hp:ctrl><hp:fieldBegin', b'<hp:ctrl><hp:unknown/></hp:ctrl><hp:ctrl><hp:fieldBegin'),
}
old, new = replacements[data['mode']]
out = io.BytesIO()
with zipfile.ZipFile(io.BytesIO(base64.b64decode(data['before'], validate=True))) as source:
    with zipfile.ZipFile(out, 'w') as target:
        target.comment = source.comment
        for entry in source.infolist():
            payload = source.read(entry.filename)
            if entry.filename == 'Contents/section0.xml':
                if payload.count(old) != 1:
                    raise ValueError('Unique observed mutation required')
                payload = payload.replace(old, new)
            target.writestr(entry, payload)
print(base64.b64encode(out.getvalue()).decode())

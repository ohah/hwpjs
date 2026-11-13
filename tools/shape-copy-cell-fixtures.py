"""Own authored test inputs; stdlib ZIP container, raw XML patch only."""
import argparse
import hashlib
import io
import json
import re
import zipfile
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--input', required=True)
p.add_argument('--out', required=True)
p.add_argument('--seed')
a = p.parse_args()
for name in [a.input, a.out, a.seed]:
    if name and any(x in name.lower() for x in ['hwpers', 'title-column-roundtrip']):
        raise ValueError('ProtectedBeforeAccess')
out = Path(a.out)
out.mkdir(exist_ok=True)

def write(source, kind):
    target = io.BytesIO()
    changed = []
    with zipfile.ZipFile(source) as z, zipfile.ZipFile(target, 'w') as w:
        for info in z.infolist():
            raw = z.read(info.filename)
            data = raw
            if info.filename == 'Contents/header.xml':
                text = raw.decode()
                if kind == 'opaque':
                    def opaque(m):
                        if re.search(r'<(?:\w+:)?fillBrush\b', m[2]):
                            return m[0]
                        return m[1] + m[2] + '<hc:fillBrush><hc:winBrush faceColor="#EFEEDD" alpha="0"/></hc:fillBrush>' + m[3]
                    text, count = re.subn(r'(<hh:borderFill\b[^>]*>)([\s\S]*?)(</hh:borderFill>)', opaque, text)
                    if not count:
                        raise ValueError('MissingBorderFills')
                elif kind.startswith('unknown-'):
                    matches = [m for m in re.finditer(r'<(?:\w+:)?borderFill\b[^>]*>[\s\S]*?</(?:\w+:)?borderFill>', text) if re.search(r'\bid="0"', m[0].split('>')[0])]
                    if len(matches) != 1:
                        raise ValueError('ExpectedSourceStyleZero')
                    m = matches[0]
                    value = m[0]
                    if kind == 'unknown-fill-alpha':
                        value, count = re.subn('alpha="0"', 'alpha="37"', value)
                    else:
                        tag = 'leftBorder' if kind == 'unknown-border' else 'diagonal'
                        value, count = re.subn(r'(<(?:\w+:)?' + tag + r'\b[^>]*\btype=)"[^"]*"', r'\1"UNRECOGNIZED_LINE"', value, count=1)
                    if count != 1:
                        raise ValueError('ExpectedSingleUnknownMutation')
                    text = text[:m.start()] + value + text[m.end():]
                data = text.encode()
            if re.fullmatch(r'Contents/section\d+\.xml', info.filename) and kind in ['protected', 'mixed-protected']:
                count = [0]
                def protect(m):
                    ordinal = count[0]
                    count[0] += 1
                    # Authored adjacent target row1,col1: fourth physical tc.
                    if kind == 'mixed-protected' and ordinal != 3:
                        return m[0]
                    tag = m[0]
                    return re.sub(r'\bprotect="[^"]*"', 'protect="1"', tag) if 'protect=' in tag else tag[:-1] + ' protect="1">'
                data = re.sub(r'<hp:tc\b[^>]*>', protect, raw.decode()).encode()
                if not count[0]:
                    raise ValueError('MissingCells')
            if data != raw:
                changed.append(info.filename)
            w.writestr(info, data)
    if not changed:
        raise ValueError('NoAuthoredChange:' + kind)
    path = out / (kind + '.hwpx')
    with path.open('xb') as f:
        f.write(target.getvalue())
    return {'kind': kind, 'path': str(path.resolve()), 'sha256': hashlib.sha256(target.getvalue()).hexdigest(), 'bytes': len(target.getvalue()), 'changedParts': changed}

if a.seed:
    rows = [write(a.seed, k) for k in ['unknown-border', 'unknown-fill-alpha', 'unknown-diagonal']]
else:
    opaque = write(a.input, 'opaque')
    rows = [opaque, write(a.input, 'protected'), write(opaque['path'], 'mixed-protected')]
print(json.dumps(rows))

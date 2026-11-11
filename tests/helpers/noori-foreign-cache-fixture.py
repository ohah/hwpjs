"""Owned Noori ZIP variant; opaque cache wrapper is outside the edited table."""
import re,sys,zipfile
from pathlib import Path
before,after=sys.argv[1:]
with zipfile.ZipFile(before) as source:
    raw=source.read('Contents/section0.xml')
    match=re.search(rb'<hp:linesegarray\b.*?</hp:linesegarray>',raw)
    if match is None: raise ValueError('ExpectedNooriKnownLineCache')
    wrapper=b'<opaque:stash xmlns:opaque="urn:noori-opaque"><hp:p id="404" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>opaque-only</hp:t></hp:run>'+match.group()+b'</hp:p></opaque:stash>'
    at=raw.rindex(b'</')
    with zipfile.ZipFile(after,'w') as output:
        for entry in source.infolist(): output.writestr(entry,raw[:at]+wrapper+raw[at:] if entry.filename=='Contents/section0.xml' else source.read(entry.filename))

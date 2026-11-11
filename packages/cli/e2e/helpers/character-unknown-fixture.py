"""Authored semantic unknowns in a constructor-created HWPX; no external corpus."""
import pathlib,sys,zipfile
with zipfile.ZipFile(sys.argv[1])as source,zipfile.ZipFile(sys.argv[2],'w')as target:
    for item in source.infolist():
        data=source.read(item)
        if item.filename=='Contents/header.xml':
            if b'textColor="#000000"'not in data or b'latin="0"'not in data:raise ValueError('Unexpected constructor template')
            data=data.replace(b'textColor="#000000"',b'textColor="alien-color"',1).replace(b'latin="0"',b'latin="999"',1)
        target.writestr(item,data)

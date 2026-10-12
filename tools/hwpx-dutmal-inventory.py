"""Independent ZIP/XML census, not an editor or format-completeness audit."""
import argparse
import json
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET


def census(root):
    ns = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
    files = controls = 0
    errors = []
    for path in sorted(root.rglob('*')):
        if not path.is_file() or path.suffix.lower() not in ('.hwp', '.hwpx'):
            continue
        if not zipfile.is_zipfile(path):
            continue
        files += 1
        try:
            with zipfile.ZipFile(path) as pack:
                for part in pack.namelist():
                    if not part.startswith('Contents/section') or not part.endswith('.xml'):
                        continue
                    items = list(ET.fromstring(pack.read(part)).iter(ns + 'dutmal'))
                    if items:
                        controls += len(items)
                        print(json.dumps({'kind': 'file', 'path': str(path), 'part': part,
                                          'count': len(items), 'texts': [
                                              [item.findtext(ns + 'mainText'), item.findtext(ns + 'subText')]
                                              for item in items]}, ensure_ascii=False))
        except (zipfile.BadZipFile, ET.ParseError, RuntimeError, OSError) as error:
            errors.append({'path': str(path), 'error': str(error)})
    if not files:
        raise ValueError('EmptyZipInventory')
    print(json.dumps({'kind': 'summary', 'zipFiles': files, 'dutmalControls': controls,
                      'parseErrors': errors, 'scope': 'ZIP paths and exact paragraph namespace dutmal only'}, ensure_ascii=False))
    return 1 if errors else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    args = parser.parse_args()
    if not args.root.is_dir():
        parser.error('root must be an existing directory')
    raise SystemExit(census(args.root))

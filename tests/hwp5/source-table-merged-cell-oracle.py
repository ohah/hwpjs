"""Independent CFB/record golden oracle for authored merged H5 inputs."""
from pathlib import Path
import importlib.util, struct, json, sys, zlib
spec = importlib.util.spec_from_file_location('cfb_read', Path(__file__).parent / 'helpers' / 'merged-cell-cfb.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
cases = {'offset': (5, 3, [3, 3, 2, 1, 2], [(0, 0, 1, 1, 15000, 8000, 0, False), (0, 1, 1, 1, 15000, 8000, 1, False), (0, 2, 1, 1, 15000, 8000, 2, False), (1, 0, 2, 1, 15000, 8000, 3, False), (1, 1, 1, 1, 15000, 5334, 4, False), (1, 2, 1, 1, 15000, 5334, 4, True), (2, 1, 2, 1, 15000, 5333, 4, True), (2, 2, 2, 1, 15000, 5333, 4, True), (3, 0, 2, 1, 15000, 8000, 5, False), (4, 1, 1, 1, 15000, 5333, 4, True), (4, 2, 1, 1, 15000, 5333, 4, True)]), 'full': (2, 2, [2, 2], [(0, 0, 1, 1, 15000, 8000, 0, False), (0, 1, 1, 1, 15000, 8000, 0, True), (1, 0, 1, 1, 15000, 8000, 0, True), (1, 1, 1, 1, 15000, 8000, 0, True)]), 'vertical': (4, 3, [3, 2, 1, 2], [(0, 0, 1, 1, 7500, 5334, 0, False), (0, 1, 1, 1, 7500, 5334, 0, True), (0, 2, 2, 1, 15000, 8000, 1, False), (1, 0, 2, 1, 7500, 5333, 0, True), (1, 1, 2, 1, 7500, 5333, 0, True), (2, 2, 2, 1, 15000, 8000, 2, False), (3, 0, 1, 1, 7500, 5333, 0, True), (3, 1, 1, 1, 7500, 5333, 0, True)]), 'horizontal': (3, 4, [3, 3, 2], [(0, 0, 1, 1, 10000, 4000, 0, False), (0, 1, 1, 2, 10000, 4000, 0, True), (0, 3, 1, 1, 10000, 4000, 0, True), (1, 0, 1, 1, 10000, 4000, 0, True), (1, 1, 1, 2, 10000, 4000, 0, True), (1, 3, 1, 1, 10000, 4000, 0, True), (2, 0, 1, 2, 15000, 8000, 1, False), (2, 2, 1, 2, 15000, 8000, 2, False)]), 'unselected-span': (3, 3, [3, 2, 1], [(0, 0, 3, 1, 15000, 16000, 0, False), (0, 1, 1, 1, 7500, 4000, 1, False), (0, 2, 1, 1, 7500, 4000, 1, True), (1, 1, 1, 1, 7500, 4000, 1, True), (1, 2, 1, 1, 7500, 4000, 1, True), (2, 1, 1, 2, 15000, 8000, 2, False)])}

def verify(kind, before_path, after_path):
    (a, b) = (r.CFB(before_path), r.CFB(after_path))
    return verify_objects(kind, a, b)

def verify_objects(kind, a, b):
    if not (a.metadata == b.metadata and a.paths.keys() == b.paths.keys()):
        raise AssertionError()
    for p in a.paths:
        if p != '/BodyText/Section0':
            if not a.paths[p] == b.paths[p]:
                raise AssertionError(p)
    (ar, ai, ae, at, _, _, old) = r.table(a.section())
    (br, bi, be, bt, nr, nc, new) = r.table(b.section())
    (rows, columns, row_counts, expected) = cases[kind]
    if not (nr, nc) == (rows, columns):
        raise AssertionError()
    if not [r.u16(bt, 18 + i * 2) for i in range(nr)] == row_counts:
        raise AssertionError()
    if not (at[:4] == bt[:4] and at[8:18] == bt[8:18] and (at[18 + 2 * r.u16(at, 4):] == bt[18 + 2 * nr:])):
        raise AssertionError()
    if not b''.join((x['raw'] for x in ar[:ai])) == b''.join((x['raw'] for x in br[:bi])):
        raise AssertionError()
    if not b''.join((x['raw'] for x in ar[ae:])) == b''.join((x['raw'] for x in br[be:])):
        raise AssertionError()
    if not len(new) == len(expected):
        raise AssertionError()
    source_ids = set()
    for (path, raw) in a.paths.items():
        if not path.startswith('/BodyText/Section'):
            continue
        if r.u32(a.paths['/FileHeader'], 36) & 1:
            raw = zlib.decompress(raw, -15)
        source_ids.update((r.u32(record['payload'], 18) for record in r.records(raw) if record['tag'] == 66))
    occupied = set()
    retained = []
    fresh = set()
    for (cell, (row, column, rs, cs, width, height, source, blank)) in zip(new, expected):
        if not tuple((cell[k] for k in ['row', 'column', 'rs', 'cs', 'width', 'height'])) == (row, column, rs, cs, width, height):
            raise AssertionError()
        if not (0 <= row < nr and 0 <= column < nc and (row + rs <= nr) and (column + cs <= nc)):
            raise AssertionError()
        for y in range(row, row + rs):
            for x in range(column, column + cs):
                if not (y, x) not in occupied:
                    raise AssertionError()
                occupied.add((y, x))
        prior = old[source]
        if not (cell['list'][4:8] == prior['list'][4:8] and cell['list'][24:] == prior['list'][24:]):
            raise AssertionError()
        if not blank:
            if not cell['paragraphs'] == prior['paragraphs']:
                raise AssertionError()
            retained.append(source)
            if not cell['list'][:4] == prior['list'][:4]:
                raise AssertionError()
        else:
            if not r.u32(cell['list'], 0) == 1:
                raise AssertionError()
            rr = cell['records']
            if not [entry['tag'] for entry in rr] == [66, 67, 68]:
                raise AssertionError()
            first = prior['records'][0]['payload']
            last = [entry['payload'] for entry in prior['records'] if entry['tag'] == 66][-1]
            header = bytearray(first)
            struct.pack_into('<I', header, 0, r.u32(last, 0) & 2147483648 | 1)
            struct.pack_into('<H', header, 12, 1)
            struct.pack_into('<H', header, 14, 0)
            instance = r.u32(rr[0]['payload'], 18)
            if not (instance and instance not in source_ids and (instance not in fresh)):
                raise AssertionError()
            fresh.add(instance)
            struct.pack_into('<I', header, 18, instance)
            if not bytes(header) == rr[0]['payload']:
                raise AssertionError()
            if not (rr[1]['payload'] == b'\r\x00' and rr[2]['payload'] == next((entry['payload'] for entry in prior['records'] if entry['tag'] == 68))[:8]):
                raise AssertionError()
    if not (len(occupied) == nr * nc and sorted(retained) == list(range(len(old)))):
        raise AssertionError()
    return dict(case=kind, grid=[nr, nc], physicalCells=len(new), originalPhysicalOwners=len(old), freshParagraphs=len(fresh), completeGrid=True, rawParagraphsAndStyles='exact', unselectedStreamsAndMetadata='exact', controlPrefix='exact')
if __name__ == '__main__':
    print(json.dumps(verify(*sys.argv[1:]), indent=2))

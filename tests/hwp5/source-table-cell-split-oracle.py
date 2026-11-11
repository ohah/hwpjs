"""Independent MS-CFB + official HWP5 framing/cell oracle; standard library only.
Inputs are constructor-authored exports. No project parser or coordinate helper.
"""
from pathlib import Path
import struct, zlib, json, hashlib, sys
END = 4294967294
FREE = 4294967295

def require(condition, message):
    if not condition:
        raise ValueError(message)
u16 = lambda b, p: struct.unpack_from('<H', b, p)[0]
u32 = lambda b, p: struct.unpack_from('<I', b, p)[0]
u64 = lambda b, p: struct.unpack_from('<Q', b, p)[0]

class CFB:

    def __init__(self, path):
        self.data = Path(path).read_bytes()
        h = self.data[:512]
        require(h[:8] == bytes.fromhex('d0cf11e0a1b11ae1'), 'CFB oracle condition at line 13')
        self.sector = 1 << u16(h, 30)
        require(self.sector in [512, 4096], 'CFB oracle condition at line 14')
        require(u16(h, 32) == 6, 'CFB oracle condition at line 14')
        self.limit = len(self.data) // self.sector - 1
        fats = list(struct.unpack_from('<109I', h, 76))
        next_difat = u32(h, 68)
        for _ in range(u32(h, 72)):
            part = self.block(next_difat)
            fats.extend(struct.unpack('<' + 'I' * (len(part) // 4 - 1), part[:-4]))
            next_difat = u32(part, len(part) - 4)
        fats = [n for n in fats if n < self.limit]
        require(len(fats) == u32(h, 44), 'CFB oracle condition at line 19')
        self.fat = []
        for n in fats:
            self.fat.extend(struct.unpack('<' + 'I' * (self.sector // 4), self.block(n)))
        raw = self.chain(u32(h, 48), self.fat, self.block)
        self.entries = []
        for p in range(0, len(raw), 128):
            b = raw[p:p + 128]
            kind = b[66]
            if not kind:
                self.entries.append(None)
                continue
            n = u16(b, 64)
            require(2 <= n <= 64 and n % 2 == 0, 'CFB oracle condition at line 27')
            self.entries.append(dict(name=b[:n - 2].decode('utf-16le'), kind=kind, left=u32(b, 68), right=u32(b, 72), child=u32(b, 76), clsid=b[80:96].hex(), state=u32(b, 96), created=u64(b, 100), modified=u64(b, 108), start=u32(b, 116), size=u64(b, 120)))
        root = self.entries[0]
        require(root['kind'] == 5, 'CFB oracle condition at line 29')
        self.mini = self.chain(root['start'], self.fat, self.block)[:root['size']]
        rawmini = self.chain(u32(h, 60), self.fat, self.block) if u32(h, 64) else b''
        self.minifat = list(struct.unpack('<' + 'I' * (len(rawmini) // 4), rawmini))
        self.cutoff = u32(h, 56)
        self.paths = {}
        self.metadata = {}
        seen = set()

        def siblings(index, parent):
            if index == FREE:
                return
            require(index < len(self.entries) and index not in seen, 'CFB oracle condition at line 36')
            seen.add(index)
            entry = self.entries[index]
            require(entry is not None, 'CFB oracle condition at line 37')
            siblings(entry['left'], parent)
            path = parent + '/' + entry['name']
            require(path not in self.paths, 'CFB oracle condition at line 39')
            self.metadata[path] = {k: entry[k] for k in ['name', 'kind', 'clsid', 'state', 'created', 'modified']}
            if entry['kind'] == 1:
                siblings(entry['child'], path)
            else:
                require(entry['kind'] == 2, 'CFB oracle condition at line 43')
                value = self.chain(entry['start'], self.minifat, lambda n: self.mini[n * 64:(n + 1) * 64]) if entry['size'] < self.cutoff else self.chain(entry['start'], self.fat, self.block)
                require(len(value) >= entry['size'], 'CFB oracle condition at line 45')
                self.paths[path] = value[:entry['size']]
            siblings(entry['right'], parent)
        siblings(root['child'], '')
        self.metadata['/'] = {k: root[k] for k in ['kind', 'clsid', 'state', 'created', 'modified']}

    def block(self, n):
        require(0 <= n < self.limit, 'CFB oracle condition at line 50')
        return self.data[(n + 1) * self.sector:(n + 2) * self.sector]

    @staticmethod
    def chain(start, fat, read):
        seen = set()
        out = []
        while start != END:
            require(start != FREE and start < len(fat) and (start not in seen), 'CFB oracle condition at line 56')
            seen.add(start)
            out.append(read(start))
            start = fat[start]
        return b''.join(out)

    def section(self):
        b = self.paths['/BodyText/Section0']
        flags = u32(self.paths['/FileHeader'], 36)
        return zlib.decompress(b, -15) if flags & 1 else b

def records(data):
    out = []
    p = 0
    while p < len(data):
        begin = p
        h = u32(data, p)
        p += 4
        size = h >> 20
        if size == 4095:
            size = u32(data, p)
            p += 4
        require(size <= len(data) - p, 'CFB oracle condition at line 68')
        out.append(dict(tag=h & 1023, level=h >> 10 & 1023, payload=data[p:p + size], raw=data[begin:p + size]))
        p += size
    return out

def table(data):
    rs = records(data)
    indexes = [i for (i, r) in enumerate(rs) if r['tag'] == 77]
    require(len(indexes) == 1, 'CFB oracle condition at line 73')
    i = indexes[0]
    header = rs[i]['payload']
    rows = u16(header, 4)
    columns = u16(header, 6)
    cells = []
    j = i + 1
    while j < len(rs) and rs[j]['level'] >= rs[i]['level']:
        require(rs[j]['tag'] == 72 and rs[j]['level'] == rs[i]['level'], 'CFB oracle condition at line 77')
        begin = j
        j += 1
        while j < len(rs) and (not (rs[j]['tag'] == 72 and rs[j]['level'] == rs[i]['level'])) and (rs[j]['level'] >= rs[i]['level']):
            j += 1
        payload = rs[begin]['payload']
        base = 8
        (c, r, cs, rr, w, h) = struct.unpack_from('<4H2I', payload, base)
        cells.append(dict(row=r, column=c, rs=rr, cs=cs, width=w, height=h, list=payload, records=rs[begin + 1:j], paragraphs=b''.join((x['raw'] for x in rs[begin + 1:j]))))
    return (rs, i, j, header, rows, columns, cells)

def verify(before_path, after_path, selected_row=0, selected_column=0):
    return verify_objects(CFB(before_path), CFB(after_path), selected_row, selected_column)

def verify_objects(a, b, selected_row=0, selected_column=0):
    require(selected_row in (0, 1) and selected_column in (0, 1), "Invalid oracle corner")
    require(a.metadata == b.metadata, 'CFB oracle condition at line 89')
    require(a.paths.keys() == b.paths.keys(), 'CFB oracle condition at line 90')
    for p in a.paths:
        if p != '/BodyText/Section0':
            require(a.paths[p] == b.paths[p], p)
    (ar, ai, ae, at, rows, cols, old) = table(a.section())
    (br, bi, be, bt, newrows, newcols, new) = table(b.section())
    require((rows, cols) == (2, 2) and (newrows, newcols) == (3, 4), 'CFB oracle condition at line 94')
    require([u16(bt, 18 + i * 2) for i in range(newrows)] == ([4, 3, 2] if selected_row == 0 else [2, 4, 3]), 'CFB oracle condition at line 95')
    require(at[:4] == bt[:4] and at[8:18] == bt[8:18] and (at[22:] == bt[24:]), 'CFB oracle condition at line 96')
    require(b''.join((x['raw'] for x in ar[:ai])) == b''.join((x['raw'] for x in br[:bi])), 'CFB oracle condition at line 97')
    require(b''.join((x['raw'] for x in ar[ae:])) == b''.join((x['raw'] for x in br[be:])), 'CFB oracle condition at line 98')
    expected = []
    # Independent 2x2 -> 3x4 topology; dimensions come from immutable input cells.
    for source in range(4):
        r, c = divmod(source, 2)
        prior = old[source]
        require((prior['row'], prior['column'], prior['rs'], prior['cs']) == (r, c, 1, 1), 'Unexpected source cell topology')
        width, height = prior['width'], prior['height']
        require(width >= 3 and height >= 2, 'Invalid source dimensions')
        if (r, c) == (selected_row, selected_column):
            for subrow in range(2):
                for subcolumn in range(3):
                    expected.append((r + subrow, c + subcolumn, 1, 1, width // 3 + int(subcolumn < width % 3), height // 2 + int(subrow < height % 2), source, subrow != 0 or subcolumn != 0))
        else:
            expected.append((r + int(r > selected_row), c + 2 * int(c > selected_column),
                             2 if r == selected_row else 1, 3 if c == selected_column else 1,
                             width, height, source, False))
    expected.sort(key=lambda row: (row[0], row[1]))
    require(len(new) == len(expected), 'CFB oracle condition at line 100')
    all_ids = set()
    original_ids = set()
    for (path, content) in a.paths.items():
        if not path.startswith('/BodyText/Section'):
            continue
        decoded = zlib.decompress(content, -15) if u32(a.paths['/FileHeader'], 36) & 1 else content
        original_ids.update((u32(r['payload'], 18) for r in records(decoded) if r['tag'] == 66))
    for (cell, (row, col, rs, cs, w, h, source, blank)) in zip(new, expected):
        require(tuple((cell[k] for k in ['row', 'column', 'rs', 'cs', 'width', 'height'])) == (row, col, rs, cs, w, h), 'CFB oracle condition at line 106')
        prior = old[source]
        require(cell['list'][:2] == (b'\x01\x00' if blank else prior['list'][:2]), 'Wrong paragraph count')
        require(cell['list'][2:8] == prior['list'][2:8] and cell['list'][24:] == prior['list'][24:], 'CFB oracle condition at line 108')
        if not blank:
            require(cell['paragraphs'] == prior['paragraphs'], 'CFB oracle condition at line 109')
        else:
            rr = cell['records']
            require([r['tag'] for r in rr] == [66, 67, 68], 'CFB oracle condition at line 111')
            require(u32(rr[0]['payload'], 0) & 2147483647 == 1, 'CFB oracle condition at line 112')
            require(rr[0]['payload'][8:12] == prior['records'][0]['payload'][8:12], 'CFB oracle condition at line 113')
            require(rr[1]['payload'] == b'\r\x00', 'CFB oracle condition at line 114')
            require(rr[2]['payload'] == next((r['payload'] for r in prior['records'] if r['tag'] == 68))[:8], 'CFB oracle condition at line 115')
            instance = u32(rr[0]['payload'], 18)
            require(instance and instance not in original_ids, 'CFB oracle condition at line 116')
        for rr in cell['records']:
            if rr['tag'] == 66:
                ident = u32(rr['payload'], 18)
                require(ident not in all_ids, 'CFB oracle condition at line 119')
                all_ids.add(ident)
    return dict(streams=len(a.paths), physicalCells=len(new), sourceParagraphs=len(old), newParagraphs=len(new) - len(old), recordOracle='passed', metadata='preserved', allNonTargetStreams='exact')
if __name__ == '__main__':
    result = verify(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0, int(sys.argv[4]) if len(sys.argv) > 4 else 0)
    print(json.dumps(result, ensure_ascii=False, indent=2))

"""Independent MS-CFB + official HWP5 framing/cell oracle; standard library only.
Inputs are constructor-authored exports. No project parser or coordinate helper.
"""
from pathlib import Path
import struct, zlib, json, hashlib, sys
END = 4294967294
FREE = 4294967295
u16 = lambda b, p: struct.unpack_from('<H', b, p)[0]
u32 = lambda b, p: struct.unpack_from('<I', b, p)[0]
u64 = lambda b, p: struct.unpack_from('<Q', b, p)[0]

class CFB:

    def __init__(self, path):
        self.data = Path(path).read_bytes()
        h = self.data[:512]
        if not h[:8] == bytes.fromhex('d0cf11e0a1b11ae1'):
            raise AssertionError()
        self.sector = 1 << u16(h, 30)
        if not self.sector in [512, 4096]:
            raise AssertionError()
        if not u16(h, 32) == 6:
            raise AssertionError()
        self.limit = len(self.data) // self.sector - 1
        fats = list(struct.unpack_from('<109I', h, 76))
        next_difat = u32(h, 68)
        for _ in range(u32(h, 72)):
            part = self.block(next_difat)
            fats.extend(struct.unpack('<' + 'I' * (len(part) // 4 - 1), part[:-4]))
            next_difat = u32(part, len(part) - 4)
        fats = [n for n in fats if n < self.limit]
        if not len(fats) == u32(h, 44):
            raise AssertionError()
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
            if not (2 <= n <= 64 and n % 2 == 0):
                raise AssertionError()
            self.entries.append(dict(name=b[:n - 2].decode('utf-16le'), kind=kind, left=u32(b, 68), right=u32(b, 72), child=u32(b, 76), clsid=b[80:96].hex(), state=u32(b, 96), created=u64(b, 100), modified=u64(b, 108), start=u32(b, 116), size=u64(b, 120)))
        root = self.entries[0]
        if not root['kind'] == 5:
            raise AssertionError()
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
            if not (index < len(self.entries) and index not in seen):
                raise AssertionError()
            seen.add(index)
            entry = self.entries[index]
            if not entry is not None:
                raise AssertionError()
            siblings(entry['left'], parent)
            path = parent + '/' + entry['name']
            if not path not in self.paths:
                raise AssertionError()
            self.metadata[path] = {k: entry[k] for k in ['name', 'kind', 'clsid', 'state', 'created', 'modified']}
            if entry['kind'] == 1:
                siblings(entry['child'], path)
            else:
                if not entry['kind'] == 2:
                    raise AssertionError()
                value = self.chain(entry['start'], self.minifat, lambda n: self.mini[n * 64:(n + 1) * 64]) if entry['size'] < self.cutoff else self.chain(entry['start'], self.fat, self.block)
                if not len(value) >= entry['size']:
                    raise AssertionError()
                self.paths[path] = value[:entry['size']]
            siblings(entry['right'], parent)
        siblings(root['child'], '')
        self.metadata['/'] = {k: root[k] for k in ['kind', 'clsid', 'state', 'created', 'modified']}

    def block(self, n):
        if not 0 <= n < self.limit:
            raise AssertionError()
        return self.data[(n + 1) * self.sector:(n + 2) * self.sector]

    @staticmethod
    def chain(start, fat, read):
        seen = set()
        out = []
        while start != END:
            if not (start != FREE and start < len(fat) and (start not in seen)):
                raise AssertionError()
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
        if not size <= len(data) - p:
            raise AssertionError()
        out.append(dict(tag=h & 1023, level=h >> 10 & 1023, payload=data[p:p + size], raw=data[begin:p + size]))
        p += size
    return out

def table(data):
    rs = records(data)
    indexes = [i for (i, r) in enumerate(rs) if r['tag'] == 77]
    if not len(indexes) == 1:
        raise AssertionError()
    i = indexes[0]
    header = rs[i]['payload']
    rows = u16(header, 4)
    columns = u16(header, 6)
    cells = []
    j = i + 1
    while j < len(rs) and rs[j]['level'] >= rs[i]['level']:
        if not (rs[j]['tag'] == 72 and rs[j]['level'] == rs[i]['level']):
            raise AssertionError()
        begin = j
        j += 1
        while j < len(rs) and (not (rs[j]['tag'] == 72 and rs[j]['level'] == rs[i]['level'])) and (rs[j]['level'] >= rs[i]['level']):
            j += 1
        payload = rs[begin]['payload']
        base = 8
        (c, r, cs, rr, w, h) = struct.unpack_from('<4H2I', payload, base)
        cells.append(dict(row=r, column=c, rs=rr, cs=cs, width=w, height=h, list=payload, records=rs[begin + 1:j], paragraphs=b''.join((x['raw'] for x in rs[begin + 1:j]))))
    return (rs, i, j, header, rows, columns, cells)

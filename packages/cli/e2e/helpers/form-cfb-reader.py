"""Bounded independent CFB/record oracle. Python standard library only.
Field offsets are from official HWP5 revision1.3 and compound storage framing.
No product parser, serializer, legacy reader or JS SDK is imported.
"""

def require(condition, message):
    if not condition:
        raise ValueError(message)
from pathlib import Path
import struct, zlib
U = lambda b, o=0: struct.unpack_from('<I', b, o)[0]
Q = lambda b, o=0: struct.unpack_from('<Q', b, o)[0]
END = 4294967294
FREE = 4294967295

class Compound:

    def __init__(self, path):
        self.data = Path(path).read_bytes()
        b = self.data
        require(b[:8] == bytes.fromhex('d0cf11e0a1b11ae1') and b[28:30] == b'\xfe\xff', 'Independent check failed at line 13')
        self.ss = 1 << struct.unpack_from('<H', b, 30)[0]
        self.ms = 1 << struct.unpack_from('<H', b, 32)[0]
        require(self.ss in (512, 4096) and self.ms == 64 and (len(b) < 64 * 1024 * 1024), 'Independent check failed at line 15')
        self.n = len(b) // self.ss - 1
        difat = list(struct.unpack_from('<109I', b, 76))
        sec = U(b, 68)
        seen = set()
        for _ in range(U(b, 72)):
            require(sec < self.n and sec not in seen, 'Independent check failed at line 19')
            seen.add(sec)
            words = list(struct.unpack('<%dI' % (self.ss // 4), self.sector(sec)))
            difat += words[:-1]
            sec = words[-1]
        fats = [x for x in difat if x != FREE]
        require(len(fats) == U(b, 44), 'Independent check failed at line 20')
        self.fat = []
        for f in fats:
            self.fat += list(struct.unpack('<%dI' % (self.ss // 4), self.sector(f)))
        raw = self.chain(U(b, 48), self.fat, self.sector)
        self.entries = []
        for off in range(0, len(raw), 128):
            e = raw[off:off + 128]
            typ = e[66]
            n = struct.unpack_from('<H', e, 64)[0]
            if typ == 0:
                self.entries.append(None)
                continue
            require(2 <= n <= 64, 'Independent check failed at line 27')
            self.entries.append(dict(name=e[:n - 2].decode('utf-16le'), type=typ, left=U(e, 68), right=U(e, 72), child=U(e, 76), metadata=e[80:116], start=U(e, 116), size=Q(e, 120)))
        root = self.entries[0]
        require(root['type'] == 5, 'Independent check failed at line 29')
        self.mini = self.chain(root['start'], self.fat, self.sector)[:root['size']] if root['size'] else b''
        mf = self.chain(U(b, 60), self.fat, self.sector) if U(b, 64) else b''
        self.mfat = list(struct.unpack('<%dI' % (len(mf) // 4), mf)) if mf else []
        self.streams = {}
        self.metadata = {}
        visited = set()

        def visit(i, prefix):
            if i == FREE:
                return
            require(i < len(self.entries) and i not in visited, 'Independent check failed at line 35')
            visited.add(i)
            e = self.entries[i]
            require(e is not None, 'Independent check failed at line 35')
            visit(e['left'], prefix)
            name = prefix + '/' + e['name']
            self.metadata[name] = (e['type'], e['metadata'])
            if e['type'] == 1:
                visit(e['child'], name)
            elif e['type'] == 2:
                if e['size'] == 0:
                    data = b''
                elif e['size'] < U(b, 56):
                    data = self.chain(e['start'], self.mfat, lambda n: self.mini[n * self.ms:(n + 1) * self.ms])
                else:
                    data = self.chain(e['start'], self.fat, self.sector)
                require(len(data) >= e['size'], 'Independent check failed at line 42')
                self.streams[name] = data[:e['size']]
            else:
                raise AssertionError('Unexpected directory kind')
            visit(e['right'], prefix)
        visit(root['child'], '')
        self.metadata['/'] = (5, root['metadata'])

    def sector(self, n):
        require(n < self.n, 'Independent check failed at line 47')
        return self.data[(n + 1) * self.ss:(n + 2) * self.ss]

    def chain(self, start, fat, get):
        out = []
        seen = set()
        n = start
        while n != END:
            require(0 <= n < len(fat) and n not in seen and (len(seen) < 1000000), 'Independent check failed at line 51')
            seen.add(n)
            out.append(get(n))
            n = fat[n]
        return b''.join(out)

    def decoded(self, name):
        data = self.streams[name]
        return zlib.decompress(data, -15) if U(self.streams['/FileHeader'], 36) & 1 else data

    def records(self, name):
        return records(self.decoded(name))

def records(data):
    out = []
    off = 0
    while off < len(data):
        start = off
        word = U(data, off)
        off += 4
        n = word >> 20
        if n == 4095:
            n = U(data, off)
            off += 4
        require(off + n <= len(data), 'Independent check failed at line 62')
        out.append(dict(tag=word & 1023, level=word >> 10 & 1023, payload=data[off:off + n], raw=data[start:off + n], offset=start))
        off += n
    require(off == len(data), 'Independent check failed at line 63')
    return out

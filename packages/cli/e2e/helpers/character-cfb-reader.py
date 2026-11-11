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

def info(c):
    rs = c.records('/DocInfo')
    maps = [r for r in rs if r['tag'] == 17]
    require(len(maps) == 1, 'Independent check failed at line 66')
    counts = struct.unpack('<%di' % (len(maps[0]['payload']) // 4), maps[0]['payload'])
    bullet = [r for r in rs if r['tag'] == 24]
    para = [r for r in rs if r['tag'] == 25]
    chars = [r for r in rs if r['tag'] == 21]
    require(counts[12] == len(bullet) and counts[13] == len(para) and (counts[9] == len(chars)), 'Independent check failed at line 69')
    return (rs, bullet, para, counts)

def decode_bullet(b):
    p = b['payload']
    require(len(p) >= 14, 'Independent check failed at line 73')
    (attrs, width, offset, char, marker) = struct.unpack_from('<IhhIH', p)
    return dict(marker=marker, alignment=['LEFT', 'CENTER', 'RIGHT'][attrs & 3], useInstanceWidth=bool(attrs & 4), autoIndent=bool(attrs & 8), widthAdjust=width, textOffsetType='HWPUNIT' if attrs & 16 else 'PERCENT', textOffset=offset, charShapeId=char)

def invariant(before, after, allowed):
    require(before.metadata == after.metadata, 'CFB directory metadata changed')
    require(before.streams.keys() == after.streams.keys(), 'Independent check failed at line 7')
    for k in before.streams:
        if k not in allowed:
            require(before.streams[k] == after.streams[k], k)

def same_body(a, b, paragraph=None, new_shape=None):
    old = a.records('/BodyText/Section0')
    new = b.records('/BodyText/Section0')
    target = -1

    def normalized(rows, change=False):
        out = []
        p = -1
        for r in rows:
            if r['tag'] == 69:
                continue
            payload = bytearray(r['payload'])
            if r['tag'] == 66:
                p += 1
                if change and p == paragraph:
                    require(struct.unpack_from('<H', payload, 8)[0] == new_shape, 'Independent check failed at line 22')
                    struct.pack_into('<H', payload, 8, struct.unpack_from('<H', [r for r in old if r['tag'] == 66][p]['payload'], 8)[0])
                payload[16:18] = b'\x00\x00'
            out.append((r['tag'], r['level'], bytes(payload)))
        return out
    require(normalized(old) == normalized(new, True), 'body difference outside reference/cache')
    return ([r for r in old if r['tag'] == 66], [r for r in new if r['tag'] == 66])

def resource_add(before, after, bullet_add, shape_add, paragraph=None, bullet_id=None):
    a = Compound(before)
    b = Compound(after)
    invariant(a, b, {'/DocInfo', '/BodyText/Section0'} if paragraph is not None else {'/DocInfo'})
    (ar, ab, ap, ac) = info(a)
    (br, bb, bp, bc) = info(b)
    require(len(bb) == len(ab) + bullet_add and len(bp) == len(ap) + shape_add, 'Independent check failed at line 33')
    for (x, y) in zip(ab, bb):
        require(x['raw'] == y['raw'], 'original BULLET changed')
    for (x, y) in zip(ap, bp):
        require(x['raw'] == y['raw'], 'original PARA_SHAPE changed')
    keep = lambda rows: [r for r in rows if r['tag'] not in (17, 24, 25)]
    require([r['raw'] for r in keep(ar)] == [r['raw'] for r in keep(br)], 'Independent check failed at line 37')
    am = next((r['payload'] for r in ar if r['tag'] == 17))
    bm = bytearray(next((r['payload'] for r in br if r['tag'] == 17)))
    struct.pack_into('<i', bm, 48, ac[12])
    struct.pack_into('<i', bm, 52, ac[13])
    require(am == bm, 'unrelated mapping metadata changed')
    if paragraph is not None:
        new_shape = len(bp) - 1
        (old_headers, new_headers) = same_body(a, b, paragraph, new_shape)
        old_id = struct.unpack_from('<H', old_headers[paragraph]['payload'], 8)[0]
        expected = bytearray(ap[old_id]['payload'])
        flags = U(expected)
        struct.pack_into('<I', expected, 0, flags & ~(31 << 23) | (3 << 23 if bullet_id is not None else 0))
        struct.pack_into('<H', expected, 30, bullet_id or 0)
        version = int.from_bytes(a.streams['/FileHeader'][32:36], 'little')
        if version >= 83951616 and len(expected) >= 58:
            struct.pack_into('<I', expected, 54, 0)
        require(bytes(expected) == bp[-1]['payload'], 'new paragraph shape differs beyond bullet fields')
        require([r['payload'][18:22] for r in old_headers] == [r['payload'][18:22] for r in new_headers], 'Independent check failed at line 47')
    return bb


def verify(plan):
    before, after = plan['before'], plan['after']
    identity = plan.get('id')
    definition = plan.get('definition')
    if plan['mode'] == 'resource-add':
        rows = resource_add(before, after, plan['bulletAdd'], plan['shapeAdd'], plan.get('paragraph'), identity)
        if definition is not None:
            require(identity is not None and 1 <= identity <= len(rows), 'Invalid expected resource ID')
            require(decode_bullet(rows[identity - 1]) == definition, 'Wrong definition')
    else:
        require(plan['mode'] == 'definition-update', 'Invalid oracle mode')
        left, right = Compound(before), Compound(after)
        invariant(left, right, {'/DocInfo'})
        old_records, old_bullets, _, old_counts = info(left)
        new_records, new_bullets, _, new_counts = info(right)
        require(old_counts == new_counts and len(old_records) == len(new_records), 'Resource inventory changed')
        require(identity is not None and 1 <= identity <= len(old_bullets), 'Invalid expected resource ID')
        require(decode_bullet(new_bullets[identity - 1]) == definition, 'Wrong definition')
        ordinal = 0
        for old, new in zip(old_records, new_records):
            if old['tag'] == 24:
                ordinal += 1
                if ordinal == identity:
                    require(len(old['payload']) == len(new['payload']), 'BULLET payload size changed')
                    require(old['raw'][:-len(old['payload'])] == new['raw'][:-len(new['payload'])], 'BULLET record header changed')
                    require(old['payload'][14:] == new['payload'][14:], 'Opaque BULLET payload changed')
                    require(U(old['payload']) & ~31 == U(new['payload']) & ~31, 'Unrelated BULLET flags changed')
                    continue
            require(old['raw'] == new['raw'], 'Unrelated DocInfo record changed')
    return {'verified': True, 'mode': plan['mode'], 'id': identity}

if __name__ == '__main__':
    import sys, json
    require(len(sys.argv) == 2, 'Expected one oracle plan')
    print(json.dumps(verify(json.loads(Path(sys.argv[1]).read_text()))))

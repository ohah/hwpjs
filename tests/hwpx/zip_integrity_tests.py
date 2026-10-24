"""Physical ZIP integrity regression tests; no Native/WASM, fixtures or corpus."""
import io
from pathlib import Path
import random
import struct
import sys
import unittest
import zipfile
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import hwpx_zip_integrity as integrity


def archive(raw=b'payload', *, method=0, compressed=None, declared=None, crc=None,
            name=b'member', local_name=None, flags=0, descriptor=True, extra=b''):
    if compressed is None:
        compressor = zlib.compressobj(wbits=-15)
        compressed = raw if method == 0 else compressor.compress(raw) + compressor.flush()
    size = len(raw) if declared is None else declared
    crc = zlib.crc32(raw) if crc is None else crc
    lname = name if local_name is None else local_name
    local = struct.pack('<4s5H3I2H', b'PK\x03\x04',20,flags,method,0,33,
                        0 if flags & 8 else crc, 0 if flags & 8 else len(compressed),
                        0 if flags & 8 else size,len(lname),len(extra)) + lname + extra + compressed
    if flags & 8 and descriptor:
        local += b'PK\x07\x08' + struct.pack('<3I',crc,len(compressed),size)
    central = struct.pack('<4s6H3I5H2I',b'PK\x01\x02',20,20,flags,method,0,33,
                          crc,len(compressed),size,len(name),0,0,0,0,0,0) + name
    return local + central + struct.pack('<4s4H2IH',b'PK\x05\x06',0,0,1,1,len(central),len(local),0)


def open_checked(data, budget=16*1024*1024):
    return integrity.open_zip(data, max_input=16*1024*1024, max_expanded=budget)


class ZipIntegrityTests(unittest.TestCase):
    def test_positive_codecs_empty_chunk_edges_and_incompressible(self):
        rng = random.Random(41)
        for size in (0,1,65535,65536,65537,131072,2*1024*1024):
            for raw in (b'A'*size, bytes(rng.randrange(256) for _ in range(min(size,131072)))):
                for method in (0,8):
                    with self.subTest(size=len(raw), method=method), open_checked(archive(raw,method=method)) as z:
                        self.assertEqual(z.read('member'),raw)

    def test_physical_tail_is_not_hidden_by_zipfile(self):
        prefix=b'<xml/>';raw=prefix+b'UNDECLARED-TAIL'
        for method in (0,8):
            data=archive(raw,method=method,declared=len(prefix),crc=zlib.crc32(prefix))
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                self.assertEqual(z.read('member'),prefix)
                self.assertIsNone(z.testzip())  # Demonstrate the original blind spot.
            with self.assertRaises(ValueError):open_checked(data)

    def test_nul_central_local_and_different_raw_names(self):
        for kwargs in ({'name':b'member\0hidden'}, {'local_name':b'member\0hidden'},
                       {'local_name':b'changed'}, {'flags':0x800,'name':b'\xff'}):
            with self.subTest(kwargs=kwargs), self.assertRaises((ValueError,UnicodeError)):
                open_checked(archive(**kwargs))

    def test_valid_utf8_and_cp437_names(self):
        for flags,name in ((0x800,'한글'.encode()),(0,b'caf\x82')):
            with open_checked(archive(name=name,flags=flags)) as z:
                self.assertEqual(z.read(z.namelist()[0]),b'payload')

    def test_local_metadata_binding(self):
        for offset,fmt,value in ((6,'H',1),(8,'H',8),(14,'I',123),(18,'I',2),(22,'I',2),(26,'H',65535)):
            data=bytearray(archive());struct.pack_into('<'+fmt,data,offset,value)
            with self.subTest(offset=offset), self.assertRaises(ValueError):open_checked(bytes(data))

    def test_stream_eof_crc_and_compressed_remainder(self):
        compressed=zlib.compress(b'payload')[2:-4]
        for blob in (compressed[:-1],compressed+b'X',compressed+compressed):
            with self.subTest(blob=blob), self.assertRaises(ValueError):
                open_checked(archive(method=8,compressed=blob))
        for method in (0,8):
            with self.assertRaises(ValueError):open_checked(archive(method=method,crc=123))
            with self.assertRaises(ValueError):open_checked(archive(method=method,declared=100))

    def test_actual_expansion_guard_and_global_budget(self):
        compressed=zlib.compress(b'A'*1024*1024)[2:-4]
        with self.assertRaisesRegex(ValueError,'actual expansion'):
            open_checked(archive(method=8,compressed=compressed,declared=1,crc=zlib.crc32(b'A')))
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as z:
            z.writestr('a',b'123');z.writestr('b',b'456')
        with self.assertRaisesRegex(ValueError,'expansion limit'):open_checked(out.getvalue(),budget=5)
        with open_checked(out.getvalue(),budget=6) as z:self.assertEqual(z.read('b'),b'456')

    def test_data_descriptors_valid_and_missing_or_wrong(self):
        for method in (0,8):
            data=archive(method=method,flags=8)
            with open_checked(data) as z:self.assertEqual(z.read('member'),b'payload')
            with self.assertRaises(ValueError):open_checked(archive(method=method,flags=8,descriptor=False))
            data=bytearray(data);at=data.index(b'PK\x07\x08');data[at+4]^=1
            with self.assertRaises(ValueError):open_checked(bytes(data))

    def test_explicit_codec_and_zip64_rejection(self):
        for method in (12,14,99):
            with self.assertRaisesRegex(ValueError,'codec'):open_checked(archive(method=method))
        data=bytearray(archive());struct.pack_into('<I',data,22,0xffffffff)
        with self.assertRaisesRegex(ValueError,'ZIP64'):open_checked(bytes(data))

    def test_non_target_member_checked_before_return(self):
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as z:
            z.writestr('Contents/section0.xml',b'<xml/>');z.writestr('other',b'guard')
        data=bytearray(out.getvalue())
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            info=z.getinfo('other');data[info.header_offset+30+len(b'other')]^=1
        with self.assertRaises(ValueError):open_checked(bytes(data))


if __name__=='__main__':unittest.main(verbosity=2)

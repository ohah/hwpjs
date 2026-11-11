"""Independent controlled plain-paragraph insert and inherited-format oracle."""
from pathlib import Path
import importlib.util
import json
import struct
import sys

spec = importlib.util.spec_from_file_location('bullet_cfb_oracle', Path(__file__).with_name('paragraph-bullet-definition-oracle.py'))
cfb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cfb)
require = cfb.require


def verify(before, after, paragraph, offset, text):
    left, right = cfb.Compound(before), cfb.Compound(after)
    require(left.metadata == right.metadata, 'CFB metadata changed')
    require(left.streams.keys() == right.streams.keys(), 'CFB inventory changed')
    section = '/BodyText/Section0'
    for name in left.streams:
        if name != section:
            require(left.streams[name] == right.streams[name], 'Non-target stream changed: ' + name)
    old, new = left.records(section), right.records(section)
    added = text.encode('utf-16le')
    require(added and len(added) % 2 == 0 and offset >= 0, 'Invalid expected insertion')
    def normalize(rows, changed):
        result = []
        current = -1
        selected = []
        for row in rows:
            if row['tag'] == 66:
                current += 1
            if row['tag'] == 69:
                continue
            data = bytearray(row['payload'])
            if row['tag'] == 66:
                data[16:18] = b'\0\0'
                if current == paragraph and changed:
                    count = cfb.U(data)
                    require(count & 0x7fffffff >= len(added) // 2 + 1, 'Invalid output character count')
                    struct.pack_into('<I', data, 0, (count & 0x80000000) | ((count & 0x7fffffff) - len(added) // 2))
            if current == paragraph:
                selected.append(row)
                if row['tag'] == 67:
                    continue
            result.append((row['tag'], row['level'], bytes(data)))
        return result, selected
    old_normal, old_selected = normalize(old, False)
    new_normal, new_selected = normalize(new, True)
    require(old_normal == new_normal, 'Formatting or other paragraph changed')
    require(old_selected and new_selected, 'Missing target paragraph')
    old_text = [r['payload'] for r in old_selected if r['tag'] == 67]
    new_text = [r['payload'] for r in new_selected if r['tag'] == 67]
    require(len(old_text) <= 1 and len(new_text) == 1, 'Unexpected text record count')
    if not old_text:
        require(cfb.U(old_selected[0]['payload']) & 0x7fffffff == 1, 'Missing required source text')
        old_text = [b'\r\0']
    original = old_text[0]
    require(offset * 2 <= len(original) - 2, 'Insertion outside paragraph text')
    require(new_text[0] == original[:offset * 2] + added + original[offset * 2:], 'Wrong inserted text or location')
    return {'verified': True, 'paragraph': paragraph, 'insertedUnits': len(added) // 2, 'formatAndOtherStreams': 'preserved'}


if __name__ == '__main__':
    require(len(sys.argv) == 6, 'Expected before, after, paragraph, UTF16 offset and text')
    print(json.dumps(verify(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5])))

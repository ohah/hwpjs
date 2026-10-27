def require(condition, message='검증 조건 불일치'):
    if not condition:
        raise ValueError(message)
from pathlib import Path
import hashlib, json, re, io, zlib, olefile, sys
import argparse
ap = argparse.ArgumentParser()
ap.add_argument('--execution', required=True)
ap.add_argument('--output', required=True)
args = ap.parse_args()
root = Path(__file__).resolve().parents[1]
D = Path(args.execution).resolve()
shipping = Path(args.output).resolve()
require(D.is_relative_to(root / 'zig-out/verification') and shipping.is_relative_to(root / 'zig-out/verification'), '검증 조건 불일치')
O = D
out = D / 'output'
s = (D / 'stderr.log').read_text()
H = lambda b: hashlib.sha256(b).hexdigest()
raw = (D / 'legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp').read_bytes()
inputsha = H(raw)

def streams(b):
    with olefile.OleFileIO(io.BytesIO(b)) as f:
        return {'/'.join(k): f.openstream(k).read() for k in f.listdir(streams=True, storages=False)}

def records(b):
    p = 0
    rows = []
    while p < len(b):
        require(p + 4 <= len(b), '검증 조건 불일치')
        h = int.from_bytes(b[p:p + 4], 'little')
        p += 4
        n = h >> 20
        if n == 4095:
            require(p + 4 <= len(b), '검증 조건 불일치')
            n = int.from_bytes(b[p:p + 4], 'little')
            p += 4
        require(p + n <= len(b), '검증 조건 불일치')
        rows.append({'tag': h & 1023, 'level': h >> 10 & 1023, 'bytes': n, 'sha256': H(b[p:p + n])})
        p += n
    return rows
original = streams(raw)
reports = []
blobs = {}
caseblobs = {}
for (key, sha, size) in re.findall('GEN_BLOB\\|([^|\\n]+)\\|([0-9a-f]{64})\\|(\\d+)', s):
    p = out / (sha + '.hwp')
    b = p.read_bytes()
    require(H(b) == sha and len(b) == int(size), '검증 조건 불일치')
    current = streams(b)
    require(set(original) == set(current), (key, 'stream목록변경'))
    changed = [k for k in original if original[k] != current[k]]
    allowed = {'BodyText/Section0', 'DocInfo', 'PrvText'}
    require(set(changed) <= allowed, (key, changed))
    details = {}
    for name in ['BodyText/Section0', 'DocInfo']:
        compressed = bool(int.from_bytes(current['FileHeader'][36:40], 'little') & 1)
        decoded = zlib.decompress(current[name], -15) if compressed else current[name]
        r = records(decoded)
        details[name] = {'decodedBytes': len(decoded), 'recordCount': len(r), 'decodedSHA256': H(decoded)}
    reports.append({'logicalState': key, 'sha256': sha, 'bytes': len(b), 'changedStreams': changed, 'unaffectedExactStreams': sorted(set(original) - set(changed)), 'validatedRecordStreams': details})
    caseblobs[key] = {'sha256': sha, 'bytes': len(b)}
    blobs[sha] = b
require(len(caseblobs) == 13, len(caseblobs))
cases = []
for (kind, sec, para, node, w, h) in re.findall('GEN_REQUEST\\|run\\|([^|\\n]+)\\|(\\d+)\\|(\\d+)\\|(\\d+)\\|(\\d+)\\|(\\d+)', s):
    cases.append({'method': 'run', 'kind': kind, 'section': int(sec), 'paragraph': int(para), 'node': int(node), 'width': int(w), 'height': int(h), 'states': [caseblobs[f'run.{kind}.{i}'] for i in range(3)]})
cases.append({'method': 'current20', 'states': [caseblobs['current20']]})
(arch, os_, abi, bits, cost) = re.findall('GEN_TARGET\\|([^|\\n]+)\\|([^|\\n]+)\\|([^|\\n]+)\\|(\\d+)\\|(\\d+)', s)[0]
cases.append({'method': 'payloadCost'})
for kind in ['noop_external', 'changed_external', 'failed_batch']:
    cases.append({'method': 'refusal', 'kind': kind, 'states': [caseblobs['refusal.' + kind]]})
(error, cap) = re.findall('GEN_ERROR\\|refusal.payload\\|([^|\\n]+)\\|(\\d+)\\|revision0\\|originalExact', s)[0]
require(cap == cost, '검증 조건 불일치')
cases.append({'method': 'refusal', 'kind': 'payload', 'errorName': error})
require(len(cases) == 9, '검증 조건 불일치')
catalog = {'schemaVersion': 1, 'oldCommit': 'ac196c0720a438871af26228051bcd3e738e15c6', 'oldClosureSHA256': '5c5f50fda6ac137ef04e28c7f65f3b33882ba91b9b091bb61fa1ff2ee487505b', 'inputSHA256': inputsha, 'targets': [{'arch': arch, 'os': os_, 'abi': abi, 'pointerBits': int(bits), 'payloadCost': int(cost)}], 'cases': cases}
shipping.mkdir(parents=True, exist_ok=True)
for (sha, b) in blobs.items():
    (shipping / (sha + '.hwp')).write_bytes(b)
(shipping / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
(O / 'INDEPENDENT-CFB-ORACLE.json').write_text(json.dumps({'library': 'olefile', 'version': olefile.__version__, 'logicalStates': len(reports), 'uniqueBlobs': len(blobs), 'reports': reports, 'scope': '독립 CFB stream목록·비대상 stream exact·변경stream레코드 framing/DEFLATE 검증. 모든 서식 의미의 독립구현 검증은 아님.'}, ensure_ascii=False, indent=2) + '\n')
print('catalog', H((shipping / 'catalog.json').read_bytes()), 'logical13/unique', len(blobs), 'request9', 'target', arch, os_, abi, bits, cost)

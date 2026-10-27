def require(condition, message='검증 조건 불일치'):
    if not condition:
        raise ValueError(message)
'old Git의 명시 source만 재구성하는 개발 도구. 정규 테스트에서는 실행하지 않는다.'
from pathlib import Path
import argparse, hashlib, json, os, re, shutil, signal, subprocess, time
ap = argparse.ArgumentParser()
ap.add_argument('--output', required=True)
ap.add_argument('--run', action='store_true')
args = ap.parse_args()
root = Path(__file__).resolve().parents[1]
meta = root / 'tools/fixtures'
out = Path(args.output).resolve()
require(out.is_relative_to(root / 'zig-out/verification') and (not out.exists()), '새 verification 출력만 허용')
out.mkdir(parents=True)
H = lambda b: hashlib.sha256(b).hexdigest()
policy = json.loads((meta / 'hwp5-history-reference-source.json').read_text())
patch = (meta / 'hwp5-history-reference-old-helper.patch').read_text()
require(H(patch.encode()) == policy['patchSHA256'], '검증 조건 불일치')
pins = []

def safe(logical):
    if not logical.startswith('src/') or '..' in Path(logical).parts or re.search('title-column-roundtrip|hwpers_test4_complex_table|(^|/)legacy(/|$)', logical):
        raise ValueError('보호 또는 비선택 경로 거부')
for row in policy['files']:
    logical = row['path']
    safe(logical)
    if row['sameGitBytes']:
        b = subprocess.check_output(['git', '-C', str(root), 'show', policy['baseCommit'] + ':' + logical])
    else:
        require(logical == 'src/original_hwp5_v2_compare.zig' and (not row['gitBlobExists']), '검증 조건 불일치')
        b = ''.join((x[1:] for x in patch.splitlines(True) if x.startswith('+') and (not x.startswith('+++')))).encode()
    require(H(b) == row['old455SHA256'], logical)
    p = out / 'source' / logical
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b)
    pins.append({'path': str(p), 'sha256': H(b)})
gen = meta / 'generate-hwp5-history-reference.zig'
require(H(gen.read_bytes()) == policy['producerSHA256'], '생성 entry SHA 불일치')
p = out / 'source/src/generate_old_reference.zig'
p.write_bytes(gen.read_bytes())
pins.append({'path': str(p), 'sha256': H(p.read_bytes())})
f = root / 'legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp'
b = f.read_bytes()
require(H(b) == 'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f', '검증 조건 불일치')
p = out / 'legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp'
p.parent.mkdir(parents=True)
p.write_bytes(b)
pins.append({'path': str(p), 'sha256': H(b)})
for name in ['cache', 'global-cache', 'tmp', 'output']:
    (out / name).mkdir()
(out / 'INPUT-PIN.json').write_text(json.dumps({'commit': policy['baseCommit'], 'files': pins, 'currentEngineUsed': False}, ensure_ascii=False, indent=2))
print('선택 입력 준비 완료:', out, flush=True)
if not args.run:
    raise SystemExit(0)
zig = shutil.which('zig')
require(zig, '명시 설치 Zig가 필요합니다')
version = subprocess.check_output([zig, 'version'], text=True).strip()
require(version.startswith('0.17.'), version)
sb = out / 'guard.sb'
sb.write_text('(version 1)\n(allow default)\n(deny file-write*)\n(allow file-write* (subpath "' + str(out) + '") (literal "/dev/null"))\n(deny file-write* (subpath "' + str(out / 'source') + '"))\n(deny file-read* file-read-metadata (regex #"(^|/)hwpers_test4_complex_table[.]hwp$"))\n(deny file-read* file-read-metadata (regex #"(^|/)tests/hwpx/title-column-roundtrip[.]test[.]mjs$"))\n(deny file-read* file-read-metadata (subpath "' + str(root / 'legacy/hwpers') + '"))\n')

def resources():
    text = subprocess.check_output(['memory_pressure', '-Q'], text=True)
    m = re.search('System-wide memory free percentage:\\s*(\\d+)%', text)
    if not m:
        raise ValueError('memory_pressure 파싱 실패')
    return {'appleFreePercent': int(m[1]), 'diskFree': shutil.disk_usage(out).free, 'cacheBytes': sum((int(subprocess.check_output(['du', '-sk', str(out / x)], text=True).split()[0]) * 1024 for x in ['cache', 'global-cache', 'tmp']))}

def group(pid):
    rows = []
    for line in subprocess.check_output(['ps', '-axo', 'pid=,ppid=,rss=,command='], text=True).splitlines():
        x = line.split(None, 3)
        if len(x) == 4:
            rows.append({'pid': int(x[0]), 'ppid': int(x[1]), 'rss': int(x[2]) * 1024, 'command': x[3]})
    ids = {pid}
    for _ in range(20):
        n = ids | {x['pid'] for x in rows if x['ppid'] in ids}
        if n == ids:
            break
        ids = n
    return [x for x in rows if x['pid'] in ids]
before = resources()
require(before['appleFreePercent'] >= 35 and before['diskFree'] >= 16 * 2 ** 30, '검증 조건 불일치')
command = ['/usr/bin/sandbox-exec', '-f', str(sb), 'nice', '-n', '19', zig, 'test', '-j1', '-O', 'ReleaseSafe', str(out / 'source/src/generate_old_reference.zig'), '--test-filter', 'old455 golden:', '--cache-dir', str(out / 'cache'), '--global-cache-dir', str(out / 'global-cache')]
process = None
guard = None
peak = 0
start = time.time()
try:
    with (out / 'stderr.log').open('wb') as log:
        process = subprocess.Popen(command, cwd=out, stdout=log, stderr=subprocess.STDOUT, start_new_session=True, env=dict(os.environ, TMPDIR=str(out / 'tmp')))
        (out / 'START.json').write_text(json.dumps({'pid': process.pid, 'command': command, 'version': version, 'resourceBefore': before}, ensure_ascii=False, indent=2))
        while process.poll() is None:
            try:
                r = resources()
                rss = sum((x['rss'] for x in group(process.pid)))
                peak = max(peak, rss)
                bad = rss > 3 * 2 ** 30 or r['appleFreePercent'] < 35 or r['diskFree'] < 16 * 2 ** 30 or (r['cacheBytes'] - before['cacheBytes'] > 2 ** 30)
            except Exception as e:
                r = {'parseError': str(e)}
                bad = True
            if bad:
                guard = r
                os.killpg(process.pid, signal.SIGINT)
                break
            time.sleep(5)
        code = process.wait()
finally:
    if process and process.poll() is None:
        os.killpg(process.pid, signal.SIGINT)
        process.wait()
result = {'exit': code, 'guard': guard, 'seconds': time.time() - start, 'peakRSS': peak, 'sourceDrift': [x['path'] for x in pins if H(Path(x['path']).read_bytes()) != x['sha256']], 'ownedRemaining': group(process.pid), 'stderrSHA256': H((out / 'stderr.log').read_bytes())}
(out / 'EXIT.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
print(json.dumps(result, ensure_ascii=False))
raise SystemExit(code if not guard else 1)

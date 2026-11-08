import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { inflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

// 메인이 동결한 후보와 명시 WASM만 실행한다. 구 SDK·라이브 root로 대체하지 않는다.
const absolute = (name) => {
  const value = process.env[name];
  assert.ok(value && path.isAbsolute(value), `${name}: absolute path required`);
  return fs.realpathSync(value);
};
const sourceRoot = absolute('HWPJS_TEST_SOURCE_ROOT');
assert.match(sourceRoot, /\/zig-out\/verification\//);
const entry = (relative) => {
  const file = fs.realpathSync(path.join(sourceRoot, relative));
  assert.ok(file.startsWith(sourceRoot + path.sep), 'CandidateModuleEscaped');
  return file;
};
const evidence = process.env.HWPJS_TEST_EVIDENCE_DIR;
assert.ok(evidence && path.isAbsolute(evidence) && evidence.includes('/zig-out/verification/'));
fs.mkdirSync(evidence);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const put = (name, bytes) => fs.writeFileSync(path.join(evidence, name), bytes, { flag: 'wx' });
const wasmPath = absolute('HWPJS_TEST_WASM');
const wasm = fs.readFileSync(wasmPath);
assert.match(process.env.HWPJS_TEST_WASM_SHA256 ?? '', /^[a-f0-9]{64}$/);
assert.equal(hash(wasm), process.env.HWPJS_TEST_WASM_SHA256);
const oldWasmPath = absolute('HWPJS_TEST_OLD_WASM');
assert.equal(
  hash(fs.readFileSync(oldWasmPath)),
  '82031994b4b7f066c28c725495954eebc67bb25570869c06528ea328e0155ccc',
);
const replacements = ['PNG', 'JPEG'].map((kind) => {
  const original = absolute(`HWPJS_TEST_${kind}`),
    bytes = fs.readFileSync(original);
  const expected = process.env[`HWPJS_TEST_${kind}_SHA256`];
  assert.match(expected ?? '', /^[a-f0-9]{64}$/);
  assert.equal(hash(bytes), expected);
  const file = path.join(evidence, `replacement.${kind === 'PNG' ? 'png' : 'jpg'}`);
  put(path.basename(file), bytes);
  return { kind, original, file, bytes, sha256: expected };
});
const fixtures = [
  {
    format: 'hwp5',
    original: absolute('HWPJS_TEST_NOORI'),
    sha256: 'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f',
    ext: 'hwp',
  },
  {
    format: 'hwpx',
    original: absolute('HWPJS_TEST_NOORI_HWPX'),
    sha256: '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab',
    ext: 'hwpx',
  },
];
for (const f of fixtures) {
  f.bytes = fs.readFileSync(f.original);
  assert.equal(hash(f.bytes), f.sha256);
  f.file = path.join(evidence, `original.${f.ext}`);
  put(path.basename(f.file), f.bytes);
}
const { openDocument, read } = await import(pathToFileURL(entry('packages/cli/src/engine.ts')));
const { createDocumentImages } = await import(
  pathToFileURL(entry('packages/cli/src/document-images.ts'))
);
const { parseObjectReference } = await import(
  pathToFileURL(entry('packages/cli/src/object-reference.ts'))
);
const { replaceDocumentImage } = await import(
  pathToFileURL(entry('packages/cli/src/replace-image.ts'))
);
const oracleRoot = absolute('HWPJS_TEST_ORACLE_ROOT');
assert.match(oracleRoot, /\/zig-out\/verification\//);
const oracle = path.join(oracleRoot, 'legacy/cfb.js');
assert.match(process.env.HWPJS_TEST_CFB_SHA256 ?? '', /^[a-f0-9]{64}$/);
assert.equal(hash(fs.readFileSync(oracle)), process.env.HWPJS_TEST_CFB_SHA256);
const context = {
  module: { exports: {} },
  Buffer,
  process,
  require: createRequire(pathToFileURL(oracle)),
};
runInNewContext(fs.readFileSync(oracle, 'utf8'), context);
const cfb = context.module.exports;
const ledger = [];

function imageBlocks(model) {
  const todo = [];
  for (const s of model.sections) {
    todo.push(...s.body);
    for (const kind of ['header', 'footer'])
      for (const d of s[kind].definitions) todo.push(...d.blocks);
  }
  for (const row of model.unplaced) todo.push(row.block);
  const seen = new Set(),
    images = [];
  while (todo.length) {
    const block = todo.pop();
    assert.ok(block && !seen.has(block));
    seen.add(block);
    assert.ok(seen.size <= 100000);
    if (block.type === 'image') images.push(block);
    if (block.type === 'table') for (const cell of block.cells) todo.push(...cell.blocks);
  }
  return images;
}
async function inventory(f, bytes = f.bytes) {
  const sha256 = hash(bytes),
    document = await openDocument({ bytes, wasm, expectedSha256: sha256 });
  let images;
  try {
    images = createDocumentImages({
      sdk: document.sdk,
      format: f.format,
      sourceSha256: sha256,
      sectionCount: document.sectionCount,
    });
    const list = images.list(),
      rows = [];
    for (const item of list.images) {
      const value = images.read(item.id, { sourceSha256: sha256 });
      rows.push({ ...item, payloadSHA256: hash(value.bytes), bytes: value.bytes });
    }
    return rows;
  } finally {
    images?.close();
    await document.close();
  }
}
function readStreams(bytes) {
  const parsed = cfb.parse(bytes);
  return new Map(
    parsed.FileIndex.flatMap((value, i) =>
      value.type === 2
        ? [[parsed.FullPaths[i].slice(parsed.FullPaths[0].length), Buffer.from(value.content)]]
        : [],
    ),
  );
}
function records(bytes) {
  const rows = [];
  for (let at = 0; at < bytes.length;) {
    const start = at;
    assert.ok(at + 4 <= bytes.length);
    const header = bytes.readUInt32LE(at);
    at += 4;
    let length = header >>> 20;
    if (length === 4095) {
      assert.ok(at + 4 <= bytes.length);
      length = bytes.readUInt32LE(at);
      at += 4;
    }
    assert.ok(length <= bytes.length - at);
    rows.push({
      tag: header & 1023,
      level: (header >>> 10) & 1023,
      payload: bytes.subarray(at, at + length),
      raw: bytes.subarray(start, at + length),
    });
    at += length;
  }
  return rows;
}
function h5Oracle(f, output, replacement) {
  const before = readStreams(f.bytes),
    after = readStreams(Buffer.from(output));
  for (const [name, bytes] of before) {
    assert.ok(after.has(name));
    if (name !== 'DocInfo' && name !== 'BodyText/Section0')
      assert.deepEqual(after.get(name), bytes, name);
  }
  const added = [...after.keys()].filter((name) => !before.has(name));
  assert.equal(added.length, 1);
  assert.match(added[0], /^BinData\//);
  const compressed = (before.get('FileHeader').readUInt32LE(36) & 1) !== 0;
  const decode = (bytes) =>
    compressed ? inflateRawSync(bytes, { maxOutputLength: 32 * 1024 * 1024 }) : bytes;
  const oldRows = records(decode(before.get('BodyText/Section0'))),
    newRows = records(decode(after.get('BodyText/Section0')));
  assert.equal(oldRows.length, newRows.length);
  const changed = [];
  oldRows.forEach((a, index) => {
    const b = newRows[index];
    assert.equal(a.tag, b.tag);
    assert.equal(a.level, b.level);
    if (!a.raw.equals(b.raw)) changed.push(index);
  });
  assert.deepEqual(changed, [f.selected.source.recordNode]);
  const a = oldRows[changed[0]],
    b = newRows[changed[0]];
  assert.equal(a.tag, 85);
  assert.equal(a.payload.length, b.payload.length);
  assert.equal(a.payload.readUInt16LE(71), f.selected.source.resourceOrdinal);
  assert.notEqual(b.payload.readUInt16LE(71), a.payload.readUInt16LE(71));
  assert.deepEqual(a.payload.subarray(0, 71), b.payload.subarray(0, 71));
  assert.deepEqual(a.payload.subarray(73), b.payload.subarray(73));
  const oldInfo = records(decode(before.get('DocInfo'))),
    newInfo = records(decode(after.get('DocInfo')));
  const oldBin = oldInfo.filter((r) => r.tag === 18),
    newBin = newInfo.filter((r) => r.tag === 18);
  assert.equal(newBin.length, oldBin.length + 1);
  const resource = newBin.at(-1).payload;
  const compression = (resource.readUInt16LE(0) >>> 4) & 3;
  assert.ok(compression <= 2);
  assert.equal(resource.readUInt16LE(2), b.payload.readUInt16LE(71));
  const image = after.get(added[0]);
  const imageBytes =
    compression === 1 || (compression === 0 && compressed)
      ? inflateRawSync(image, { maxOutputLength: 64 * 1024 * 1024 })
      : image;
  assert.deepEqual(imageBytes, replacement.bytes);
  assert.deepEqual(
    newBin.slice(0, oldBin.length).map((r) => r.raw),
    oldBin.map((r) => r.raw),
  );
  const oldOther = oldInfo.filter((r) => r.tag !== 18),
    newOther = newInfo.filter((r) => r.tag !== 18);
  assert.equal(oldOther.length, newOther.length);
  oldOther.forEach((a, i) => {
    const b = newOther[i];
    assert.equal(a.tag, b.tag);
    assert.equal(a.level, b.level);
    if (a.tag === 17) {
      assert.equal(b.payload.readUInt32LE(0), a.payload.readUInt32LE(0) + 1);
      assert.deepEqual(a.payload.subarray(4), b.payload.subarray(4));
    } else assert.deepEqual(a.raw, b.raw);
  });
  return {
    changedPictureRecord: changed[0],
    originalStreamsRetained: before.size,
    addedResource: added[0],
    originalResourceBytesPreserved: true,
  };
}
const HX_ORACLE = `import sys,json,hashlib,posixpath,zipfile,xml.etree.ElementTree as E
H=lambda b:hashlib.sha256(b).hexdigest()
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}';C='{http://www.hancom.co.kr/hwpml/2011/core}';O='{http://www.idpf.org/2007/opf/}'
with zipfile.ZipFile(sys.argv[1]) as a,zipfile.ZipFile(sys.argv[2]) as b:
 if a.testzip() is not None or b.testzip() is not None:raise ValueError('ZipCRCFailure')
 old={n:a.read(n) for n in a.namelist()};new={n:b.read(n) for n in b.namelist()}
 section='Contents/section0.xml';manifest='Contents/content.hpf'
 def items(data):return {x.get('id'):dict(x.attrib) for x in E.fromstring(data).find(O+'manifest')}
 oi=items(old[manifest]);ni=items(new[manifest])
 if not all(ni.get(k)==v for k,v in oi.items()) or len(ni)!=len(oi)+1:raise ValueError('ManifestPreservationFailure')
 new_id=next(k for k in ni if k not in oi);item=ni[new_id]
 def href(item,parts):
  p=item['href'];q=p if p in parts else posixpath.normpath('Contents/'+p)
  if q not in parts:raise ValueError('MissingResource')
  return q
 added=href(item,new)
 if set(new)-set(old)!={added} or any(old[n]!=new[n] for n in old if n not in [section,manifest]):raise ValueError('ResourcePreservationFailure')
 replacement=open(sys.argv[4],'rb').read()
 if new[added]!=replacement:raise ValueError('ReplacementBytesMismatch')
 on=list(E.fromstring(old[section]).iter());nn=list(E.fromstring(new[section]).iter());target=int(sys.argv[3])
 if len(on)!=len(nn) or on[target].tag!=P+'pic':raise ValueError('PictureSiteMismatch')
 owned=set(on[target].iter());changes=[]
 for i,(x,y) in enumerate(zip(on,nn)):
  if x.tag!=y.tag or x.text!=y.text or x.tail!=y.tail:raise ValueError('UnrelatedXmlChanged')
  if x.attrib!=y.attrib:
   if x not in owned or x.tag!=C+'img':raise ValueError('UnrelatedXmlAttributesChanged')
   xa=dict(x.attrib);ya=dict(y.attrib);xa.pop('binaryItemIDRef');ref=ya.pop('binaryItemIDRef')
   if xa!=ya or ref!=new_id:raise ValueError('PictureGeometryChanged')
   changes.append(i)
 if len(changes)!=1:raise ValueError('ExpectedSinglePictureReferenceChange')
 print(json.dumps({'passed':True,'selectedPictureNode':target,'changedImageNode':changes[0],'addedResource':added,'allOriginalResourcesPreserved':True,'newImageSHA256':H(new[added])}))`;
function hxOracle(f, outputFile, replacement) {
  const r = spawnSync(
    'python3',
    [
      '-I',
      '-B',
      '-c',
      HX_ORACLE,
      f.file,
      outputFile,
      String(f.selected.source.pictureNode),
      replacement.file,
    ],
    { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 },
  );
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
async function verifyOutput(f, bytes, replacement, label) {
  const output = path.join(evidence, `${label}.${f.ext}`);
  put(path.basename(output), bytes);
  const proof =
    f.format === 'hwp5' ? h5Oracle(f, bytes, replacement) : hxOracle(f, output, replacement);
  const after = await inventory(f, bytes);
  assert.equal(after.length, f.images.length);
  const changed = [];
  for (const before of f.images) {
    const item = after.find((row) => row.id === before.id);
    assert.ok(item);
    if (item.payloadSHA256 !== before.payloadSHA256) changed.push(item.id);
    if (item.id === f.selected.id) assert.equal(item.payloadSHA256, replacement.sha256);
    else assert.equal(item.payloadSHA256, before.payloadSHA256);
  }
  assert.deepEqual(changed, [f.selected.id]);
  put(label + '-oracle.json', JSON.stringify(proof, null, 2));
  return output;
}
function invokeCLI(label, args, success = true) {
  const r = spawnSync(
    process.execPath,
    ['--max-old-space-size=512', entry('packages/cli/src/bin.ts'), ...args],
    { cwd: sourceRoot, timeout: 15000, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
  );
  put(label + '.stdout', r.stdout ?? '');
  put(label + '.stderr', r.stderr ?? '');
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  if (success) assert.equal(r.status, 0, r.stderr);
  else assert.notEqual(r.status, 0);
  return r;
}
// 양성 참조는 모델이 발급한 값만 사용한다. 음성에서만 SHA와 kind를 변형한다.
for (const f of fixtures) {
  f.images = await inventory(f);
  assert.equal(f.images.length, 4);
  f.selected = f.images[0];
  const model = (await read({ bytes: f.bytes, wasm })).model;
  const block = imageBlocks(model).find((b) => b.imageId === f.selected.id);
  assert.ok(block && typeof block.reference === 'string');
  f.reference = block.reference;
  const parsed = parseObjectReference(f.reference, { sourceSha256: f.sha256, format: f.format });
  assert.equal(parsed.kind, 'image');
  assert.equal(parsed.node, f.selected.source.pictureNode);
  if (f.format === 'hwp5') {
    assert.equal(parsed.node, block.sourceInfo.componentNode);
    assert.equal(f.selected.source.recordNode, 14);
    assert.notEqual(parsed.node, f.selected.source.recordNode);
    assert.equal(f.selected.source.recordNode, block.sourceInfo.recordNode);
    assert.ok(Number.isInteger(f.selected.source.ownerNode));
  }
  put(
    `issued-${f.format}.json`,
    JSON.stringify(
      {
        reference: f.reference,
        selected: { ...f.selected, bytes: undefined },
        sourceInfo: block.sourceInfo,
        referencesPerResource: f.images.filter((i) => i.resourceKey === f.selected.resourceKey)
          .length,
      },
      null,
      2,
    ),
  );
}
for (const f of fixtures) {
  test(
    `${f.format} 서비스 PNG와 JPEG 교체는 발급 참조를 실제 record로 결속하고 COW 저장한다`,
    { timeout: 30000 },
    async () => {
      for (const replacement of replacements) {
        assert.notEqual(replacement.sha256, f.selected.payloadSHA256);
        const result = await replaceDocumentImage({
          bytes: f.bytes,
          wasm,
          reference: f.reference,
          imageBytes: replacement.bytes,
        });
        assert.equal(result.format, f.format);
        assert.equal(result.sourceSha256, f.sha256);
        assert.equal(result.imageSha256, replacement.sha256);
        assert.equal(result.previewStale, true);
        await verifyOutput(f, result.bytes, replacement, `service-${f.format}-${replacement.kind}`);
        ledger.push({
          kind: 'service',
          format: f.format,
          image: replacement.kind,
          imageSHA256: result.imageSha256,
        });
      }
    },
  );
  test(
    `${f.format} CLI 교체 후 images와 새 참조 extract에서 새 이미지 SHA를 확인한다`,
    { timeout: 30000 },
    async () => {
      const replacement = replacements[0],
        out = path.join(evidence, `cli-${f.format}.${f.ext}`);
      invokeCLI(`cli-replace-${f.format}`, [
        'replace-image',
        f.file,
        '--ref',
        f.reference,
        '--image',
        replacement.file,
        '--output',
        out,
        '--wasm',
        wasmPath,
      ]);
      const bytes = fs.readFileSync(out);
      await verifyOutput(f, bytes, replacement, `cli-proof-${f.format}`);
      invokeCLI(`cli-images-${f.format}`, ['images', out, '--wasm', wasmPath]);
      const model = (await read({ bytes, wasm })).model;
      const reference = imageBlocks(model).find((b) => b.imageId === f.selected.id)?.reference;
      assert.equal(typeof reference, 'string');
      assert.notEqual(reference, f.reference);
      const directory = path.join(evidence, `extracted-${f.format}`);
      invokeCLI(`cli-extract-${f.format}`, [
        'extract-images',
        out,
        '--ref',
        reference,
        '--output',
        directory,
        '--wasm',
        wasmPath,
      ]);
      const values = fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => fs.readFileSync(path.join(directory, d.name)));
      assert.equal(values.filter((b) => hash(b) === replacement.sha256).length, 1);
      ledger.push({ kind: 'cli', format: f.format, extractedSHA256: replacement.sha256 });
    },
  );
  test(
    `${f.format} stale·kind·손상·예산·old820·기존 출력 거부는 원문과 기존 파일을 보존한다`,
    { timeout: 30000 },
    async () => {
      const replacement = replacements[0],
        invalid = path.join(evidence, `invalid-${f.format}.png`);
      put(path.basename(invalid), replacement.bytes.subarray(0, 24));
      const existing = path.join(evidence, `existing-${f.format}.${f.ext}`);
      put(path.basename(existing), 'KEEP');
      const huge = path.join(evidence, `oversized-${f.format}.png`);
      const fd = fs.openSync(huge, 'wx');
      fs.ftruncateSync(fd, 64 * 1024 * 1024 + 1);
      fs.closeSync(fd);
      const cases = [
        { name: 'stale', reference: f.reference.replace(f.sha256, '0'.repeat(64)) },
        { name: 'kind', reference: f.reference.replace('/image/', '/table/') },
        { name: 'damaged', image: invalid },
        { name: 'budget', image: huge },
        { name: 'old820', wasm: oldWasmPath },
        { name: 'existing', output: existing },
      ];
      for (const value of cases) {
        const out =
          value.output ?? path.join(evidence, `refused-${f.format}-${value.name}.${f.ext}`);
        invokeCLI(
          `refused-${f.format}-${value.name}`,
          [
            'replace-image',
            f.file,
            '--ref',
            value.reference ?? f.reference,
            '--image',
            value.image ?? replacement.file,
            '--output',
            out,
            '--wasm',
            value.wasm ?? wasmPath,
          ],
          false,
        );
        if (value.output) assert.equal(fs.readFileSync(existing, 'utf8'), 'KEEP');
        else assert.equal(fs.existsSync(out), false);
      }
      await assert.rejects(
        replaceDocumentImage({
          bytes: f.bytes,
          wasm: fs.readFileSync(oldWasmPath),
          reference: f.reference,
          imageBytes: replacement.bytes,
        }),
        /Unavailable|Unsupported/,
      );
      ledger.push({
        kind: 'refusals',
        format: f.format,
        cases: cases.map((x) => x.name),
        outputPublished: false,
      });
    },
  );
}
test(
  'MCP 13도구 중 replace_document_image가 양 형식 실제 교체와 잘못된 참조 거부를 수행한다',
  { timeout: 30000 },
  async () => {
    const require = createRequire(pathToFileURL(entry('packages/cli/package.json')));
    const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')));
    const { StdioClientTransport } = await import(
      pathToFileURL(require.resolve('@modelcontextprotocol/client/stdio'))
    );
    const client = new Client({ name: 'picture-replacement-native-oracle', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--max-old-space-size=512', entry('packages/cli/src/mcp-bin.ts'), '--wasm', wasmPath],
      cwd: sourceRoot,
      stderr: 'pipe',
    });
    let stderr = '';
    transport.stderr?.on('data', (b) => {
      stderr += b.toString();
    });
    let pid;
    try {
      await client.connect(transport);
      pid = transport.pid;
      const tools = (await client.listTools()).tools;
      assert.equal(tools.length, 13);
      assert.ok(tools.some((t) => t.name === 'replace_document_image'));
      for (const f of fixtures) {
        const replacement = replacements[0],
          out = path.join(evidence, `mcp-${f.format}.${f.ext}`);
        const input = {
          inputPath: f.file,
          outputPath: out,
          reference: f.reference,
          imagePath: replacement.file,
        };
        const result = await client.callTool({ name: 'replace_document_image', arguments: input });
        put(`mcp-${f.format}.json`, JSON.stringify(result, null, 2));
        assert.notEqual(result.isError, true);
        await verifyOutput(f, fs.readFileSync(out), replacement, `mcp-proof-${f.format}`);
        const refused = path.join(evidence, `mcp-refused-${f.format}.${f.ext}`);
        const negative = await client.callTool({
          name: 'replace_document_image',
          arguments: {
            ...input,
            outputPath: refused,
            reference: f.reference.replace(f.sha256, '0'.repeat(64)),
          },
        });
        put(`mcp-refused-${f.format}.json`, JSON.stringify(negative, null, 2));
        assert.equal(negative.isError, true);
        assert.equal(fs.existsSync(refused), false);
        ledger.push({
          kind: 'mcp',
          format: f.format,
          outputValidated: true,
          staleOutputPublished: false,
        });
      }
    } finally {
      await client.close();
      await transport.close();
      put('mcp.stderr', stderr);
    }
    assert.equal(stderr, '');
    if (Number.isInteger(pid)) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  },
);
after(() => {
  for (const f of fixtures) {
    assert.equal(hash(fs.readFileSync(f.original)), f.sha256);
    assert.equal(hash(fs.readFileSync(f.file)), f.sha256);
  }
  for (const image of replacements)
    assert.equal(hash(fs.readFileSync(image.original)), image.sha256);
  assert.equal(hash(fs.readFileSync(wasmPath)), process.env.HWPJS_TEST_WASM_SHA256);
  put(
    'ACTUAL-LEDGER.json',
    JSON.stringify(
      {
        ledger,
        sourceRoot,
        wasmSHA256: hash(wasm),
        fixtureHashesUnchanged: true,
        limits:
          '원본 리소스 보존은 검증하되 실제 공유 소비자가 없는 Noori에서 공유 소비자 분기를 실증했다고 주장하지 않음',
      },
      null,
      2,
    ),
  );
});

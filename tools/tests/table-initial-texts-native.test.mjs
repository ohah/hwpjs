import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// 실행 공급자는 명시한 격리 후보뿐이다. 환경 부재를 skip이나 root SDK로 대체하지 않는다.
const absolute = (name) => {
  const value = process.env[name];
  assert.ok(value && path.isAbsolute(value), `${name}: absolute path required`);
  return fs.realpathSync(value);
};
const sourceRoot = absolute('HWPJS_TEST_SOURCE_ROOT');
assert.match(sourceRoot, /\/zig-out\/verification\//);
const wasmPath = absolute('HWPJS_TEST_WASM');
const evidence = process.env.HWPJS_TEST_EVIDENCE_DIR;
assert.ok(evidence && path.isAbsolute(evidence) && evidence.includes('/zig-out/verification/'));
fs.mkdirSync(evidence);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const wasm = fs.readFileSync(wasmPath);
assert.match(process.env.HWPJS_TEST_WASM_SHA256 ?? '', /^[a-f0-9]{64}$/);
assert.equal(hash(wasm), process.env.HWPJS_TEST_WASM_SHA256);
const fixtures = [
  {
    format: 'hwp5',
    file: absolute('HWPJS_TEST_NOORI'),
    sha: 'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f',
    paragraph: 2,
    ext: 'hwp',
  },
  {
    format: 'hwpx',
    file: absolute('HWPJS_TEST_NOORI_HWPX'),
    sha: '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab',
    paragraph: 3,
    ext: 'hwpx',
  },
];
for (const f of fixtures) {
  f.bytes = fs.readFileSync(f.file);
  assert.equal(hash(f.bytes), f.sha);
}
const modulePath = (relative) => {
  const resolved = fs.realpathSync(path.join(sourceRoot, relative));
  assert.ok(resolved.startsWith(sourceRoot + path.sep), 'SourceEscapedCandidate');
  return resolved;
};
const { createExperimentalHwp5Editor } = await import(
  pathToFileURL(modulePath('js/hwp5-editor.mjs'))
);
const { createHwpxEditor } = await import(pathToFileURL(modulePath('js/hwpx-editor.mjs')));
const { createMemory } = await import(pathToFileURL(modulePath('js/wasm-memory.mjs')));
const { hwp5TableCreationRequest } = await import(
  pathToFileURL(modulePath('web/preview/hwp5-table-creation-command.mjs'))
);
const oracleFile = path.join(absolute('HWPJS_TEST_ORACLE_ROOT'), 'legacy/cfb.js');
const context = {
  module: { exports: {} },
  Buffer,
  process,
  require: createRequire(pathToFileURL(oracleFile)),
};
runInNewContext(fs.readFileSync(oracleFile, 'utf8'), context);
const cfb = context.module.exports;
const texts = [
  ['한글🙂', '<&>'],
  ['둘째 🚀', ''],
];
const flat = texts.flat();
const ledger = [];
const put = (name, bytes) => fs.writeFileSync(path.join(evidence, name), bytes, { flag: 'wx' });

function streams(bytes) {
  const parsed = cfb.parse(bytes);
  return new Map(
    parsed.FileIndex.flatMap((entry, index) =>
      entry.type === 2
        ? [[parsed.FullPaths[index].slice(parsed.FullPaths[0].length), Buffer.from(entry.content)]]
        : [],
    ),
  );
}
function records(bytes) {
  const out = [];
  for (let at = 0; at < bytes.length;) {
    const start = at;
    assert.ok(at + 4 <= bytes.length);
    const word = bytes.readUInt32LE(at);
    at += 4;
    let size = word >>> 20;
    if (size === 4095) {
      assert.ok(at + 4 <= bytes.length);
      size = bytes.readUInt32LE(at);
      at += 4;
    }
    assert.ok(size <= bytes.length - at);
    out.push({
      tag: word & 1023,
      level: (word >>> 10) & 1023,
      payload: bytes.subarray(at, at + size),
      raw: bytes.subarray(start, at + size),
    });
    at += size;
  }
  return out;
}
function h5Tables(bytes) {
  const allStreams = streams(bytes);
  const encoded = allStreams.get('BodyText/Section0');
  assert.ok(encoded);
  const compressed = (allStreams.get('FileHeader').readUInt32LE(36) & 1) !== 0;
  const rows = records(
    compressed ? inflateRawSync(encoded, { maxOutputLength: 32 * 1024 * 1024 }) : encoded,
  );
  const tables = [];
  for (let i = 0; i < rows.length; i++) {
    const ctrl = rows[i];
    if (ctrl.tag !== 71 || !ctrl.payload.subarray(0, 4).equals(Buffer.from([32, 108, 98, 116])))
      continue;
    let end = i + 1;
    while (end < rows.length && rows[end].level > ctrl.level) end++;
    const own = rows.slice(i + 1, end);
    const definition = own.find((r) => r.tag === 77 && r.level === ctrl.level + 1);
    assert.ok(definition);
    const lists = own.flatMap((r, j) => (r.tag === 72 && r.level === ctrl.level + 1 ? [j] : []));
    const cells = lists.map((j, index) => {
      const slice = own.slice(j + 1, lists[index + 1] ?? own.length);
      const header = slice.find((r) => r.tag === 66 && r.level === own[j].level);
      const text = header && slice.find((r) => r.tag === 67 && r.level === header.level + 1);
      return {
        list: own[j].payload,
        header: header?.payload,
        bytes: text?.payload,
        text: text?.payload.toString('utf16le').replace(/\r$/, '') ?? null,
      };
    });
    tables.push({
      rows: definition.payload.readUInt16LE(4),
      columns: definition.payload.readUInt16LE(6),
      cells,
      raw: Buffer.concat(rows.slice(i, end).map((r) => r.raw)),
    });
  }
  let ordinal = -1;
  const hosts = [];
  for (let index = 0; index < rows.length; index++) {
    const header = rows[index];
    if (header.tag !== 66) continue;
    ordinal++;
    if (header.level !== 0) continue;
    let end = index + 1;
    while (end < rows.length && rows[end].level > 0) end++;
    const text = rows.slice(index + 1, end).find((r) => r.tag === 67 && r.level === 1);
    if (text) hosts.push({ paragraph: ordinal, text: text.payload.toString('utf16le') });
  }
  return { tables, allStreams, hosts };
}
const XML_ORACLE = `import sys,json,zipfile,xml.etree.ElementTree as E
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
with zipfile.ZipFile(sys.argv[1]) as z:
 if z.testzip() is not None: raise ValueError('ZipCRCFailure')
 root=E.fromstring(z.read('Contents/section0.xml'))
 tables=[]
 for t in root.iter(P+'tbl'):
  cells=[]
  for tr in t.findall(P+'tr'):
   for tc in tr.findall(P+'tc'):
    a=tc.find(P+'cellAddr');s=tc.find(P+'cellSpan');sub=tc.find(P+'subList')
    cells.append({'row':int(a.get('rowAddr')),'column':int(a.get('colAddr')),'rowSpan':int(s.get('rowSpan')),'columnSpan':int(s.get('colSpan')),'text':''.join(x.text or '' for x in sub.iter(P+'t'))})
  tables.append({'rows':int(t.get('rowCnt')),'columns':int(t.get('colCnt')),'cells':cells})
 direct=set(root.findall(P+'p'))
 hosts=[{'paragraph':i+1,'text':''.join(t.text or '' for r in p.findall(P+'run') for t in r.findall(P+'t'))} for i,p in enumerate(root.iter(P+'p')) if p in direct]
 print(json.dumps({'tables':tables,'hosts':hosts}))`;
function xmlView(file) {
  const r = spawnSync('python3', ['-I', '-B', '-c', XML_ORACLE, file], {
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
const xmlTables = (file) => xmlView(file).tables;
function verifySaved(f, bytes, label, inserted = true) {
  const file = path.join(evidence, `${label}.${f.ext}`);
  put(`${label}.${f.ext}`, bytes);
  if (f.format === 'hwp5') {
    const baseline = h5Tables(f.bytes),
      actual = h5Tables(Buffer.from(bytes));
    assert.equal(actual.tables.length, baseline.tables.length + Number(inserted));
    for (const [name, value] of baseline.allStreams)
      if (name.startsWith('BinData/') || name === 'DocInfo')
        assert.deepEqual(actual.allStreams.get(name), value, name);
    if (inserted) {
      const matches = actual.tables.filter(
        (t) => JSON.stringify(t.cells.map((c) => c.text)) === JSON.stringify(flat),
      );
      assert.equal(matches.length, 1);
      const selected = matches[0];
      assert.equal(selected.rows, 2);
      assert.equal(selected.columns, 2);
      selected.cells.forEach((c, index) => {
        assert.deepEqual(c.bytes, Buffer.from(flat[index] + '\r', 'utf16le'));
        assert.equal(c.header.readUInt32LE(0) & 0x7fffffff, flat[index].length + 1);
        const offset = c.list.length - 26;
        assert.ok(offset === 6 || offset === 8);
        assert.equal(c.list.readUInt16LE(offset), index % 2);
        assert.equal(c.list.readUInt16LE(offset + 2), Math.floor(index / 2));
        assert.equal(c.list.readUInt16LE(offset + 4), 1);
        assert.equal(c.list.readUInt16LE(offset + 6), 1);
      });
      assert.deepEqual(
        actual.tables.filter((t) => t !== selected).map((t) => t.raw),
        baseline.tables.map((t) => t.raw),
      );
    }
  } else {
    const actual = xmlTables(file),
      baseline = xmlTables(f.file);
    assert.equal(actual.length, baseline.length + Number(inserted));
    if (inserted) {
      const matches = actual.filter(
        (t) => JSON.stringify(t.cells.map((c) => c.text)) === JSON.stringify(flat),
      );
      assert.equal(matches.length, 1);
      const t = matches[0];
      assert.equal(t.rows, 2);
      assert.equal(t.columns, 2);
      t.cells.forEach((c, i) =>
        assert.deepEqual(c, {
          row: Math.floor(i / 2),
          column: i % 2,
          rowSpan: 1,
          columnSpan: 1,
          text: flat[i],
        }),
      );
      assert.deepEqual(
        actual.filter((t) => t !== matches[0]),
        baseline,
      );
    }
  }
  return file;
}
async function open(f, input = f.bytes) {
  if (f.format === 'hwp5') return createExperimentalHwp5Editor(wasm, input);
  const sdk = await createHwpxEditor(wasm);
  sdk.open(input);
  return sdk;
}
function options(sdk) {
  const resources = Object.fromEntries(
    Object.entries(sdk.tableCreationResources()).map(([k, v]) => {
      assert.ok(v.length);
      return [k, v[0]];
    }),
  );
  return { rows: 2, columns: 2, width: 12000, rowHeight: 2000, resources, cellTexts: texts };
}
function request(f, opts) {
  const { cellTexts, ...base } = opts;
  const value = hwp5TableCreationRequest({
    section: 0,
    paragraph: f.paragraph,
    unit: 0,
    options: base,
  });
  return { ...value, cell_texts: cellTexts };
}
const created = (sdk, f) =>
  sdk.createdTables(0).map((row) => (f.format === 'hwp5' ? row.table : row));
const save = (sdk, f) =>
  f.format === 'hwp5' ? sdk.save({ allowStaleLayout: true }).bytes : sdk.save();
async function verifyReopen(f, bytes) {
  const sdk = await open(f, bytes);
  try {
    const groups = new Map();
    for (const cell of sdk.tableBindings(0)) {
      const rows = groups.get(cell.tableNode) ?? [];
      rows.push(cell);
      groups.set(cell.tableNode, rows);
    }
    const matches = [...groups.values()].filter(
      (cells) =>
        cells.length === 4 &&
        cells.every((c) => c.rows === 2 && c.columns === 2) &&
        cells.every((c) => {
          const value =
            f.format === 'hwp5'
              ? sdk.text(0, c.paragraph).replace(/\r$/, '')
              : sdk.anchorText(0, c.paragraph);
          return value === texts[c.row]?.[c.column];
        }),
    );
    assert.equal(matches.length, 1, 'SavedNativeReopenFourCells');
  } finally {
    sdk.close();
  }
}
function operation(f, opts, cellTexts = texts) {
  return {
    kind: 'table-insert',
    coordinates: 'current-transaction',
    section: 0,
    paragraph: f.paragraph,
    unit: 0,
    ...opts,
    cellTexts,
  };
}
function child(label, args, expected = 0) {
  const r = spawnSync(
    process.execPath,
    ['--max-old-space-size=512', modulePath('packages/cli/src/bin.ts'), ...args],
    { cwd: sourceRoot, encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024 },
  );
  put(label + '.stdout', r.stdout ?? '');
  put(label + '.stderr', r.stderr ?? '');
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  if (expected === 0) assert.equal(r.status, 0, r.stderr);
  else assert.notEqual(r.status, 0);
  return r;
}
// 저장 결과의 기존 부모 표까지 변경하지 않도록 실제 최상위 일반 문단을 선택한다.
const hostsSelected = [];
for (const f of fixtures) {
  const hosts = f.format === 'hwp5' ? h5Tables(f.bytes).hosts : xmlView(f.file).hosts;
  const source = hosts.find(
    (h) => h.text.length > 1 && [...h.text].every((c) => c.charCodeAt(0) >= 32 || c === '\r'),
  );
  assert.ok(source, 'NoIndependentPlainTopLevelHost');
  const sdk = await open(f);
  try {
    const observed =
      f.format === 'hwp5' ? sdk.text(0, source.paragraph) : sdk.anchorText(0, source.paragraph);
    assert.equal(observed, source.text, 'NativeHostOrdinalDoesNotMatchIndependentSource');
  } finally {
    sdk.close();
  }
  f.paragraph = source.paragraph;
  hostsSelected.push({ format: f.format, ...source });
}
put('HOST-SELECTION.json', JSON.stringify(hostsSelected, null, 2));

for (const f of fixtures) {
  test(
    `${f.format} 실제 SDK 초기 네 셀은 한 번 삽입과 undo/redo 한 회로 저장·복원된다`,
    { timeout: 20000 },
    async () => {
      const sdk = await open(f);
      try {
        assert.equal(sdk.supportsTableInitialTexts(), true);
        sdk.enableHistory({ maxEntries: 8, maxCheckpointBytes: 8 * 1024 * 1024 });
        const before = sdk.historyRevisions(),
          initial = created(sdk, f);
        const opts = options(sdk);
        assert.equal(initial.length, 0);
        const bad = {
          ...opts,
          cellTexts: [
            ['정상', '🙂'],
            ['<&>', '\0'],
          ],
        };
        assert.throws(() =>
          f.format === 'hwp5'
            ? sdk.insertTable(request(f, bad))
            : sdk.insertTable(0, f.paragraph, 0, bad),
        );
        assert.deepEqual(sdk.historyRevisions(), before);
        assert.equal(created(sdk, f).length, 0);
        const identity =
          f.format === 'hwp5'
            ? sdk.insertTable(request(f, opts))
            : sdk.insertTable(0, f.paragraph, 0, opts);
        assert.equal(created(sdk, f).length, 1);
        assert.deepEqual(
          created(sdk, f)[0].cells.map((c) => c.text),
          flat,
        );
        assert.equal(sdk.historyRevisions().length, before.length + 1);
        const output = save(sdk, f);
        verifySaved(f, output, 'sdk-' + f.format);
        await verifyReopen(f, output);
        assert.equal(sdk.undo(), true);
        assert.equal(created(sdk, f).length, 0);
        verifySaved(f, save(sdk, f), 'undo-' + f.format, false);
        assert.equal(sdk.undo(), false);
        assert.equal(sdk.redo(), true);
        assert.deepEqual(
          created(sdk, f)[0].cells.map((c) => c.text),
          flat,
        );
        verifySaved(f, save(sdk, f), 'redo-' + f.format);
        ledger.push({
          kind: 'sdk',
          format: f.format,
          identity,
          historyEvents: 1,
          independentSavedCells: 4,
          reopened: true,
        });
      } finally {
        sdk.close();
      }
    },
  );
  test(
    `${f.format} 실제 Native ABI의 잘못된 후행 셀도 표·이력을 게시하지 않는다`,
    { timeout: 15000 },
    async () => {
      const sdk = await open(f);
      let opts;
      try {
        opts = options(sdk);
      } finally {
        sdk.close();
      }
      const {
        instance: { exports: api },
      } = await WebAssembly.instantiate(wasm, {});
      const memory = createMemory(api);
      const prefix = f.format + '_edit';
      const callOutput = (fn) => {
        assert.equal(fn(), 1, memory.error().message);
        try {
          return memory.copy(api[prefix + '_output_ptr'](), api[prefix + '_output_len']());
        } finally {
          api[prefix + '_output_free']();
        }
      };
      try {
        memory.withBytes(f.bytes, (p, n) => assert.equal(api[prefix + '_open'](p, n), 1));
        assert.equal(api[prefix + '_history_enable'](8, 8 * 1024 * 1024), 1);
        const revision = api[prefix + '_history_revision']();
        const before = callOutput(() => api[prefix + '_save'](...(f.format === 'hwp5' ? [1] : [])));
        const payload =
          f.format === 'hwp5'
            ? request(f, opts)
            : {
                version: 1,
                section: 0,
                paragraph: f.paragraph,
                unit: 0,
                rows: 2,
                columns: 2,
                width: opts.width,
                row_height: opts.rowHeight,
                resources: opts.resources,
                cell_texts: texts,
              };
        payload.cell_texts = [
          ['정상', '🙂'],
          ['<&>', '\0'],
        ];
        memory.withBytes(new TextEncoder().encode(JSON.stringify(payload)), (p, n) =>
          assert.equal(api[prefix + '_insert_table_with_texts'](p, n), 0),
        );
        assert.equal(api[prefix + '_history_revision'](), revision);
        const after = callOutput(() => api[prefix + '_save'](...(f.format === 'hwp5' ? [1] : [])));
        assert.deepEqual(after, before);
        ledger.push({
          kind: 'raw-native-invalid',
          format: f.format,
          revisionUnchanged: true,
          savedBytesUnchanged: true,
        });
      } finally {
        api[prefix + '_output_free']();
        api[prefix + '_close']();
      }
    },
  );
  test(
    `${f.format} CLI apply의 cellTexts가 실제 공통 서비스를 거쳐 저장된다`,
    { timeout: 20000 },
    async () => {
      const sdk = await open(f);
      let opts;
      try {
        opts = options(sdk);
      } finally {
        sdk.close();
      }
      const out = path.join(evidence, `cli-${f.format}.${f.ext}`),
        badOut = path.join(evidence, `cli-invalid-${f.format}.${f.ext}`);
      const common = [
        'apply',
        f.file,
        '--expect-sha256',
        f.sha,
        '--wasm',
        wasmPath,
        ...(f.format === 'hwp5' ? ['--allow-stale-layout'] : []),
      ];
      child('cli-' + f.format, [
        ...common,
        '--operations',
        JSON.stringify([operation(f, opts)]),
        '--output',
        out,
      ]);
      const bytes = fs.readFileSync(out);
      verifySaved(f, bytes, 'cli-oracle-' + f.format);
      await verifyReopen(f, bytes);
      child(
        'cli-invalid-' + f.format,
        [
          ...common,
          '--operations',
          JSON.stringify([
            operation(f, opts, [
              ['정상', '🙂'],
              ['<&>', '\0'],
            ]),
          ]),
          '--output',
          badOut,
        ],
        1,
      );
      assert.equal(fs.existsSync(badOut), false);
      ledger.push({ kind: 'cli', format: f.format, saved: true, invalidOutputExists: false });
    },
  );
}
test(
  'MCP apply는 양 형식 실제 공통 Native 서비스와 후행 셀 거부를 확인한다',
  { timeout: 25000 },
  async () => {
    const require = createRequire(pathToFileURL(modulePath('packages/cli/package.json')));
    const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')));
    const { StdioClientTransport } = await import(
      pathToFileURL(require.resolve('@modelcontextprotocol/client/stdio'))
    );
    const client = new Client({ name: 'table-initial-native-oracle', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        '--max-old-space-size=512',
        modulePath('packages/cli/src/mcp-bin.ts'),
        '--wasm',
        wasmPath,
      ],
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
      for (const f of fixtures) {
        const sdk = await open(f);
        let opts;
        try {
          opts = options(sdk);
        } finally {
          sdk.close();
        }
        const outputPath = path.join(evidence, `mcp-${f.format}.${f.ext}`),
          badOut = path.join(evidence, `mcp-invalid-${f.format}.${f.ext}`);
        const arguments_ = {
          inputPath: f.file,
          outputPath,
          expectedSha256: f.sha,
          operations: [operation(f, opts)],
          allowStaleLayout: f.format === 'hwp5',
        };
        const positive = await client.callTool({
          name: 'apply_document_changes',
          arguments: arguments_,
        });
        put(`mcp-${f.format}.json`, JSON.stringify(positive, null, 2));
        assert.notEqual(positive.isError, true);
        const bytes = fs.readFileSync(outputPath);
        verifySaved(f, bytes, 'mcp-oracle-' + f.format);
        await verifyReopen(f, bytes);
        const negative = await client.callTool({
          name: 'apply_document_changes',
          arguments: {
            ...arguments_,
            outputPath: badOut,
            operations: [
              operation(f, opts, [
                ['정상', '🙂'],
                ['<&>', '\0'],
              ]),
            ],
          },
        });
        put(`mcp-invalid-${f.format}.json`, JSON.stringify(negative, null, 2));
        assert.equal(negative.isError, true);
        assert.equal(fs.existsSync(badOut), false);
        ledger.push({ kind: 'mcp', format: f.format, saved: true, invalidOutputExists: false });
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
  for (const f of fixtures) assert.equal(hash(fs.readFileSync(f.file)), f.sha);
  assert.equal(hash(fs.readFileSync(wasmPath)), process.env.HWPJS_TEST_WASM_SHA256);
  put(
    'ACTUAL-LEDGER.json',
    JSON.stringify(
      { ledger, fixtureHashesUnchanged: true, wasmSHA256: hash(wasm), sourceRoot },
      null,
      2,
    ),
  );
});

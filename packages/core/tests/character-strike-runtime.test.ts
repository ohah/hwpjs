import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import {
  createEditor,
  getSelectionFormatting,
  SET_CHARACTER_STRIKE_COMMAND,
  type HeadlessEditor,
  type SelectionTarget,
} from '../src/index.ts';
import { createReaderRuntimeFactory } from '../src/runtime.ts';

type Format = 'hwp5' | 'hwpx';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
let compiled: Promise<WebAssembly.Module> | undefined;
// WASM/기존 두 fixture가 없는 checkout은 이유를 출력하고 skip합니다. 다른 엔진으로 대체하지 않습니다.
async function setup(t: TestContext, format: Format) {
  const path = process.env.HWPJS_TEST_WASM;
  if (!path) {
    t.skip('명시적 HWPJS_TEST_WASM 필요');
    return;
  }
  let wasm: Uint8Array, bytes: Uint8Array;
  try {
    wasm = await readFile(path);
    bytes = await readFile(
      root +
        'legacy/rust/crates/hwp-core/tests/fixtures/charshape.' +
        (format === 'hwp5' ? 'hwp' : 'hwpx'),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      t.skip('지정 WASM 또는 기존 charshape fixture가 checkout에 없음');
      return;
    }
    throw error;
  }
  if (process.env.HWPJS_TEST_WASM_SHA256)
    assert.equal(hash(wasm), process.env.HWPJS_TEST_WASM_SHA256);
  compiled ??= WebAssembly.compile(wasm);
  const trace: string[] = [],
    factory = createReaderRuntimeFactory({ wasmModule: await compiled });
  const editor = createEditor({
    runtimeFactory: async () => {
      const runtime = await factory();
      return {
        request: (m, c) => {
          trace.push(m.kind);
          return runtime.request(m, c);
        },
        dispose: () => runtime.dispose(),
      };
    },
  });
  return { editor, trace, bytes, wasm };
}
function target(e: HeadlessEditor, start = 0, end = 1): SelectionTarget {
  const s = e.getEditorState(),
    content = s.content as {
      format: Format;
      paragraphs: { section: number; paragraph: number; selectionOwner: string }[];
    };
  const row = content.paragraphs.find((p) => p.section === 0 && p.paragraph === 2);
  assert(row);
  return {
    ...s.token,
    format: content.format,
    coordinateSpace: 'display',
    owner: row.selectionOwner,
    section: 0,
    paragraph: 2,
    startUnit: start,
    endUnit: end,
    affinity: 'forward',
  };
}
async function select(e: HeadlessEditor, start = 0, end = 1) {
  await e.setSelection(target(e, start, end));
  return getSelectionFormatting(e.getEditorState());
}
async function save(e: HeadlessEditor) {
  return (await e.save({ allowStaleLayout: true })).bytes;
}
async function toggle(e: HeadlessEditor, enabled: boolean) {
  const f = await select(e);
  return e.dispatchCommand(SET_CHARACTER_STRIKE_COMMAND, { target: f.target!, enabled });
}
for (const format of ['hwp5', 'hwpx'] as const) {
  test(`${format}: 실제 취소선 저장·history·새 세션 재열기`, async (t) => {
    const s = await setup(t, format);
    if (!s) return;
    const { editor: e, bytes } = s;
    try {
      await e.load(bytes, { format, editable: true });
      assert.equal((await select(e)).strike, false);
      const before = await save(e);
      assert.equal((await toggle(e, true)).status, 'committed-with-snapshot');
      assert.equal(getSelectionFormatting(e.getEditorState()).strike, true);
      const on = await save(e);
      await e.undo();
      assert.equal(hash(await save(e)), hash(before));
      await e.redo();
      assert.equal(hash(await save(e)), hash(on));
      const reopened = createEditor({
        runtimeFactory: createReaderRuntimeFactory({ wasmModule: await compiled! }),
      });
      try {
        await reopened.load(on, { format, editable: true });
        assert.equal((await select(reopened)).strike, true);
        assert.equal((await toggle(reopened, false)).status, 'committed-with-snapshot');
        const off = await save(reopened);
        await reopened.load(off, { format, editable: true });
        assert.equal((await select(reopened)).strike, false);
      } finally {
        await reopened.dispose();
      }
    } finally {
      await e.dispose();
    }
  });
  test(`${format}: readonly 선택·조회 허용과 취소선 거부`, async (t) => {
    const s = await setup(t, format);
    if (!s) return;
    const { editor: e, trace, bytes } = s;
    try {
      await e.load(bytes, { format, editable: false });
      const f = await select(e);
      assert.equal(f.strikeAvailableReason, 'SelectionNotEditable');
      const revision = e.getEditorState().operationRevision,
        count = trace.filter((x) => x === 'character-strike').length;
      const result = await e.dispatchCommand(SET_CHARACTER_STRIKE_COMMAND, {
        target: target(e),
        enabled: true,
      });
      assert.equal(result.status, 'rejected-unapplied');
      assert.equal(result.error, 'ReadOnlyDocument');
      assert.equal(e.getEditorState().operationRevision, revision);
      assert.equal(trace.filter((x) => x === 'character-strike').length, count);
    } finally {
      await e.dispose();
    }
  });
  test(`${format}: Boolean 이외 인수는 Native 요청 없이 거부`, async (t) => {
    const s = await setup(t, format);
    if (!s) return;
    const { editor: e, trace, bytes } = s;
    try {
      await e.load(bytes, { format, editable: true });
      await select(e);
      const before = hash(await save(e)),
        revision = e.getEditorState().operationRevision,
        count = trace.filter((x) => x === 'character-strike').length;
      for (const enabled of [0, 1, 'false', null, undefined]) {
        const result = await e.dispatchCommand(SET_CHARACTER_STRIKE_COMMAND, {
          target: target(e),
          enabled: enabled as unknown as boolean,
        });
        assert.equal(result.status, 'rejected-unapplied');
        assert.equal(result.error, 'InvalidCharacterStrikeEnabled');
      }
      assert.equal(trace.filter((x) => x === 'character-strike').length, count);
      assert.equal(e.getEditorState().operationRevision, revision);
      assert.equal(hash(await save(e)), before);
    } finally {
      await e.dispose();
    }
  });
  test(`${format}: caret 취소선은 빈 범위로 거부`, async (t) => {
    const s = await setup(t, format);
    if (!s) return;
    const { editor: e, trace, bytes } = s;
    try {
      await e.load(bytes, { format, editable: true });
      const f = await select(e, 0, 0);
      assert.equal(f.strikeAvailableReason, 'EmptyCharacterSelection');
      const count = trace.filter((x) => x === 'character-strike').length;
      const r = await e.dispatchCommand(SET_CHARACTER_STRIKE_COMMAND, {
        target: target(e, 0, 0),
        enabled: true,
      });
      assert.equal(r.error, 'EmptyCharacterSelection');
      assert.equal(trace.filter((x) => x === 'character-strike').length, count);
    } finally {
      await e.dispose();
    }
  });
  test(`${format}: 알 수 없는 원본 취소선은 false/true 모두 거부·저장 보존`, async (t) => {
    const s = await setup(t, format);
    if (!s) return;
    const { editor: e, bytes, wasm } = s;
    try {
      let mutant: Uint8Array;
      if (format === 'hwp5') {
        // 독립 record 경계로 제어 입력만 만듭니다. 제품 취소선 정책은 복제하지 않습니다.
        const { createCfbReader } = await import('../../../js/cfb.mjs');
        const { records } =
          await import('../../../tests/hwp5/style-preservation/text-record-oracle.mjs');
        const cfb = await createCfbReader(wasm);
        try {
          cfb.parse(bytes, { strict: true });
          const nodes = cfb.document().nodes,
            entry = nodes.find((n: any) => n.parent === 0 && n.name === 'DocInfo');
          assert(entry);
          const info = inflateRawSync(entry.content),
            record = records(info).filter((r: any) => r.tag === 21)[0];
          const offset = record.start + record.raw.length - record.payload.length + 46;
          info.writeUInt32LE(((info.readUInt32LE(offset) & ~(7 << 18)) | (7 << 18)) >>> 0, offset);
          mutant = cfb.write({
            nodes: nodes.map((n: any) =>
              n === entry ? { ...n, content: deflateRawSync(info) } : n,
            ),
          });
        } finally {
          cfb.close();
        }
      } else {
        const py = spawnSync(
          'python3',
          [
            '-c',
            `import io,sys,zipfile,xml.etree.ElementTree as E
src=io.BytesIO(sys.stdin.buffer.read());dst=io.BytesIO()
with zipfile.ZipFile(src) as a,zipfile.ZipFile(dst,'w') as b:
 for n in a.infolist():
  data=a.read(n.filename)
  if n.filename=='Contents/header.xml':
   root=E.fromstring(data);h='{http://www.hancom.co.kr/hwpml/2011/head}';p=next(x for x in root.iter(h+'charPr') if x.get('id')=='0');strike=p.find(h+'strikeout')
   if strike is None:strike=E.SubElement(p,h+'strikeout',{'color':'#000000'})
   strike.set('shape','FUTURE');data=E.tostring(root,encoding='utf-8',xml_declaration=True)
  b.writestr(n,data)
sys.stdout.buffer.write(dst.getvalue())`,
          ],
          { input: bytes, maxBuffer: 8 * 1024 * 1024 },
        );
        if (py.error && (py.error as NodeJS.ErrnoException).code === 'ENOENT') {
          t.skip('unknown HWPX 제어 입력 생성에 Python3 필요');
          return;
        }
        assert.equal(py.status, 0, py.stderr.toString());
        mutant = py.stdout;
      }
      await e.load(mutant, { format, editable: true });
      const f = await select(e);
      assert.equal(f.strike, null);
      assert.equal(f.strikeAvailableReason, 'UnknownCharacterStrike');
      const before = hash(await save(e));
      for (const enabled of [false, true]) {
        const r = await e.dispatchCommand(SET_CHARACTER_STRIKE_COMMAND, {
          target: target(e),
          enabled,
        });
        assert.equal(r.status, 'rejected-unapplied');
        assert.equal(
          r.error,
          format === 'hwp5' ? 'UnsupportedCharacterStrikeKind' : 'UnsupportedCharacterStrikeShape',
        );
        assert.equal(hash(await save(e)), before);
      }
    } finally {
      await e.dispose();
    }
  });
}

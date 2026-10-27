import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditor,
  createParagraphSelection,
  SPLICE_TEXT_COMMAND,
  findTextMatch,
  getHistoryAvailability,
} from '../../src/index.ts';
import { createReaderEditorRuntime } from '../../src/runtime.ts';
import {
  createApiPlayground,
  apiSelectionTarget,
  apiSampleCode,
} from '../../../../apps/demo/src/api-playground.mjs';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const repoRoot = new URL('../../../../', import.meta.url);
const wasmPath = process.env.HWPJS_TEST_WASM;
if (!wasmPath || !isAbsolute(wasmPath))
  throw Error('ExplicitWasmRequired: set absolute HWPJS_TEST_WASM; no artifact fallback');
const wasmModule = await WebAssembly.compile(new Uint8Array(readFileSync(wasmPath)));
const zipProgram = String.raw`import sys,io,zipfile,re,json,base64,hashlib,xml.etree.ElementTree as ET
def require(ok,message):
    if not ok: raise ValueError(message)
ns={'hp':'http://www.hancom.co.kr/hwpml/2011/paragraph'}
same=''.join(map(chr,[0xac19,0xc740,0x1f600,0xbb38,0xad6c]))
changed=''.join(map(chr,[0xb2e4,0xb978,0x1f600,0xbb38,0xad6c]))
body_text=''.join(map(chr,[0xbcf8,0xbb38,0x1f600,0xbc94,0xc704]))
mode=sys.argv[1]
if mode=='generate':
    raw=sys.stdin.buffer.read()
    require(hashlib.sha256(raw).hexdigest()=='d865c0c7c76f0a1b6fcd296188ec057b5c4f937390e2d2e2b7724d55b8d5cc99','OriginalTableFixtureMismatch')
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        members={i.filename:z.read(i) for i in z.infolist()}
        original=members['Contents/section0.xml'].decode()
        cells=list(re.finditer(r'<hp:tc\s[^>]*>.*?</hp:tc>',original,re.S))
        require(len(cells)==4,'ExpectedFourCells')
        value=original
        for match in reversed(cells[:2]):
            part,n=re.subn(r'<hp:run([^>]*)/>',r'<hp:run\1><hp:t>'+same+'</hp:t></hp:run>',match[0],count=1)
            require(n==1,'ExpectedEmptyRun')
            part,n=re.subn(r'<hp:linesegarray>.*?</hp:linesegarray>','',part,count=1,flags=re.S)
            require(n==1,'ExpectedSourceLineCache')
            value=value[:match.start()]+part+value[match.end():]
        at=list(re.finditer(r'<hp:p\s',value))[-1].start()
        body,n=re.subn(r'<hp:run([^>]*)/>',r'<hp:run\1><hp:t>'+body_text+'</hp:t></hp:run>',value[at:],count=1)
        require(n==1,'ExpectedEmptyBodyRun')
        body,n=re.subn(r'<hp:linesegarray>.*?</hp:linesegarray>','',body,count=1,flags=re.S)
        require(n==1,'ExpectedBodyLineCache')
        value=value[:at]+body
        root=ET.fromstring(value)
        require([''.join(t.text or '' for t in c.findall('./hp:subList/hp:p/hp:run/hp:t',ns)) for c in root.findall('.//hp:tc',ns)]==[same,same,'',''],'GeneratedTextMismatch')
        require(''.join(root.findall('hp:p',ns)[-1].itertext())==body_text,'GeneratedBodyMismatch')
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as dst:
            for info in z.infolist():dst.writestr(info,value.encode() if info.filename=='Contents/section0.xml' else members[info.filename])
    sys.stdout.buffer.write(out.getvalue())
elif mode=='verify':
    payload=json.loads(sys.stdin.buffer.read())
    before=base64.b64decode(payload['before']);after=base64.b64decode(payload['after'])
    with zipfile.ZipFile(io.BytesIO(before)) as a,zipfile.ZipFile(io.BytesIO(after)) as b:
        require(a.namelist()==b.namelist(),'SavedMembersMismatch')
        require([n for n in a.namelist() if a.read(n)!=b.read(n)]==['Contents/section0.xml'],'NonTargetMemberChanged')
        original=ET.fromstring(a.read('Contents/section0.xml'));actual=ET.fromstring(b.read('Contents/section0.xml'))
    require([''.join(t.text or '' for t in c.findall('./hp:subList/hp:p/hp:run/hp:t',ns)) for c in actual.findall('.//hp:tc',ns)]==[same,changed,'',''],'SavedTargetMismatch')
    require(''.join(actual.findall('hp:p',ns)[-1].itertext())==body_text,'NonTargetBodyChanged')
    original.findall('.//hp:tc',ns)[1].find('./hp:subList/hp:p/hp:run/hp:t',ns).text=changed
    require(ET.tostring(original)==ET.tostring(actual),'NonTargetXmlChanged')
    print(json.dumps({'targetOnly':True,'otherMembersExact':True,'otherXmlExact':True}))
else: raise ValueError('UnknownProbeMode')
`;
function zipProbe(mode: string, bytes: Uint8Array): Uint8Array {
  const result = spawnSync(
    process.env.HWPJS_TEST_PYTHON ?? 'python3',
    ['-I', '-B', '-c', zipProgram, mode],
    { input: bytes, maxBuffer: 8 * 1024 * 1024 },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr?.toString());
  return new Uint8Array(result.stdout);
}
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const tableBytes = new Uint8Array(
  readFileSync(new URL('legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx', repoRoot)),
);
assert.equal(hash(tableBytes), 'd865c0c7c76f0a1b6fcd296188ec057b5c4f937390e2d2e2b7724d55b8d5cc99');
const nooriBytes = new Uint8Array(
  readFileSync(new URL('legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp', repoRoot)),
);
assert.equal(hash(nooriBytes), 'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f');
const duplicateBytes = zipProbe('generate', tableBytes);
function fixtureBytes(name: string): Uint8Array {
  if (name === 'table.hwpx') return tableBytes.slice();
  if (name === 'noori.hwp') return nooriBytes.slice();
  if (name === 'duplicate-cells.hwpx') return duplicateBytes.slice();
  throw Error('UnknownFixture');
}
function verifyDuplicateSave(saved: Uint8Array): void {
  const payload = Buffer.from(
    JSON.stringify({
      before: Buffer.from(duplicateBytes).toString('base64'),
      after: Buffer.from(saved).toString('base64'),
    }),
  );
  assert.deepEqual(JSON.parse(Buffer.from(zipProbe('verify', payload)).toString()), {
    targetOnly: true,
    otherMembersExact: true,
    otherXmlExact: true,
  });
}
function assertMatchObject(value: any, expected: Record<string, unknown>): void {
  for (const key of Object.keys(expected)) assert.deepEqual(value[key], expected[key]);
}

const coord = (paragraph: number, startUnit = 0, endUnit = startUnit) => ({
  section: 0,
  paragraph,
  startUnit,
  endUnit,
});
async function open(name: string, format: 'hwp5' | 'hwpx', editable = true) {
  const calls: any[] = [];
  const editor = createEditor({
    runtimeFactory: () => {
      const real = createReaderEditorRuntime({ wasmModule });
      return {
        request(message: any, context: any) {
          calls.push(structuredClone(message));
          return real.request(message, context);
        },
        dispose() {
          return real.dispose();
        },
      };
    },
  });
  const bytes = fixtureBytes(name);
  await editor.load(bytes, { format, editable });
  return { editor, calls, bytes };
}
function row(editor: any, paragraph: number) {
  return editor
    .getEditorState()
    .content.paragraphs.find((r: any) => r.section === 0 && r.paragraph === paragraph);
}
async function splice(editor: any, paragraph: number, text: string, start = 0, end = start) {
  const target = createParagraphSelection(editor.getEditorState(), coord(paragraph, start, end));
  const result = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 'committed-with-snapshot');
  return target;
}
test('실 cb48 HWPX 빈셀 0..0 편집 undo redo save 재열기', async () => {
  const { editor, bytes } = await open('table.hwpx', 'hwpx');
  try {
    assert.equal(row(editor, 1).text, '');
    assertMatchObject(row(editor, 1).tableCell, { row: 0, column: 0 });
    const target = createParagraphSelection(editor.getEditorState(), coord(1));
    await editor.setSelection(target);
    await splice(editor, 1, '빈셀');
    assert.equal(row(editor, 1).text, '빈셀');
    assert.equal(row(editor, 2).text, '');
    await editor.undo();
    assert.equal(row(editor, 1).text, '');
    const restored = await editor.save({ allowStaleLayout: true });
    assert.deepEqual(restored.bytes, bytes);
    await editor.redo();
    assert.equal(row(editor, 1).text, '빈셀');
    const saved = await editor.save({ allowStaleLayout: true });
    await editor.load(saved.bytes, { format: 'hwpx' });
    assert.equal(row(editor, 1).text, '빈셀');
    assert.equal(row(editor, 2).text, '');
    console.log(
      JSON.stringify({
        scope: 'actual cb48/core/ReaderRuntime',
        case: 'HWPX빈셀',
        paragraph: 1,
        undoBytesExact: true,
        redo: true,
        reopen: true,
      }),
    );
  } finally {
    await editor.dispose();
  }
});
test('실 cb48 중복문구 셀은 두번째 좌표만 선택 편집한다', async () => {
  const { editor } = await open('duplicate-cells.hwpx', 'hwpx');
  try {
    assert.equal(row(editor, 1).text, '같은😀문구');
    assert.equal(row(editor, 2).text, '같은😀문구');
    const s = editor.getEditorState(),
      first = createParagraphSelection(s, coord(1)),
      second = createParagraphSelection(s, { ...coord(2, 0, 2), affinity: 'backward' });
    assert.notEqual(first.owner, second.owner);
    assert.equal(findTextMatch(s, '같은😀문구')?.paragraph, 1);
    await editor.setSelection(second);
    assert.equal((editor.getEditorState().selection as any).paragraph, 2);
    await splice(editor, 2, '다른', 0, 2);
    assert.equal(row(editor, 1).text, '같은😀문구');
    assert.equal(row(editor, 2).text, '다른😀문구');
    await editor.undo();
    assert.equal(row(editor, 2).text, '같은😀문구');
    await editor.redo();
    assert.equal(row(editor, 2).text, '다른😀문구');
    const saved = await editor.save({ allowStaleLayout: true });
    verifyDuplicateSave(saved.bytes);
    await editor.load(saved.bytes, { format: 'hwpx' });
    assert.equal(row(editor, 1).text, '같은😀문구');
    assert.equal(row(editor, 2).text, '다른😀문구');
    console.log(
      JSON.stringify({
        scope: 'actual cb48/core/ReaderRuntime',
        case: '같은문구별개셀',
        first: 1,
        edited: 2,
        otherCellUnchanged: true,
        reopen: true,
      }),
    );
  } finally {
    await editor.dispose();
  }
});
test('실 cb48 본체 범위와 affinity는 동일 public 경로로 선택한다', async () => {
  const { editor } = await open('duplicate-cells.hwpx', 'hwpx');
  try {
    assert.equal(row(editor, 5).text, '본문😀범위');
    const target = createParagraphSelection(editor.getEditorState(), {
      ...coord(5, 2, 4),
      affinity: 'backward',
    });
    assert.equal(target.owner, 'section:0:body');
    await editor.setSelection(target);
    assert.equal((editor.getEditorState().selection as any).affinity, 'backward');
    assert.throws(
      () => createParagraphSelection(editor.getEditorState(), coord(5, 2, 3)),
      new RegExp('InvalidScalarBoundary'),
    );
    await splice(editor, 5, '글', 0, 2);
    assert.equal(row(editor, 5).text, '글😀범위');
    assert.equal(row(editor, 1).text, '같은😀문구');
  } finally {
    await editor.dispose();
  }
});
test('실 cb48 HWP5 빈셀은 기존 issuer reference를 명령에 그대로 전달한다', async () => {
  const { editor, calls, bytes } = await open('noori.hwp', 'hwp5');
  try {
    const s = editor.getEditorState(),
      empty = row(editor, 38);
    assert.equal(empty.text, '');
    assertMatchObject(empty.tableCell, { row: 0, column: 1 });
    assert.equal(empty.currentReference.id, '187');
    assert.equal(typeof empty.currentReference.scope, 'string');
    const target = createParagraphSelection(s, coord(38));
    assert.equal(Object.hasOwn(target, 'reference'), false);
    await editor.setSelection(target);
    await splice(editor, 38, '빈셀');
    assert.equal(row(editor, 38).text, '빈셀');
    const call = calls.find((m) => m.kind === 'splice');
    // 소유 observation은 null prototype, transport 관측용 structuredClone은 plain prototype이다.
    assert.equal(Object.getPrototypeOf(empty.currentReference), null);
    assert.equal(Object.getPrototypeOf(call.reference), Object.prototype);
    const stablePlain = (value: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    assert.deepEqual(stablePlain(call.reference), stablePlain(empty.currentReference));
    await editor.undo();
    assert.equal(row(editor, 38).text, '');
    const restored = await editor.save({ allowStaleLayout: true });
    assert.deepEqual(restored.bytes, bytes);
    await editor.redo();
    assert.equal(row(editor, 38).text, '빈셀');
    const saved = await editor.save({ allowStaleLayout: true });
    await editor.load(saved.bytes, { format: 'hwp5' });
    assert.equal(row(editor, 38).text, '빈셀');
    console.log(
      JSON.stringify({
        scope: 'actual cb48/core/ReaderRuntime',
        case: 'HWP5빈셀',
        paragraph: 38,
        sourceId: '187',
        issuerReferenceForwarded: true,
        undoBytesExact: true,
        reopen: true,
      }),
    );
  } finally {
    await editor.dispose();
  }
});
test('실 cb48 wrong owner token 및 좌표는 Native 편집 전에 거부한다', async () => {
  const { editor, calls } = await open('table.hwpx', 'hwpx');
  try {
    const s = editor.getEditorState(),
      t = createParagraphSelection(s, coord(1)),
      n = calls.length;
    await assert.rejects(
      editor.setSelection({ ...t, owner: 'section:0:body' }),
      new RegExp('InvalidSelectionOwner'),
    );
    for (const change of [
      { editorId: 'other' },
      { documentId: 'other' },
      { generation: t.generation + 1 },
      { operationRevision: t.operationRevision + 1 },
      { viewRevision: t.viewRevision + 1 },
    ])
      await assert.rejects(editor.setSelection({ ...t, ...change }), new RegExp('StaleTarget'));
    assert.throws(
      () => createParagraphSelection(s, coord(999)),
      new RegExp('InvalidSelectionOwner'),
    );
    assert.throws(
      () => createParagraphSelection(s, coord(1, -1)),
      new RegExp('InvalidTextPosition'),
    );
    for (const key of ['owner', 'reference', 'token'])
      assert.throws(
        () => createParagraphSelection(s, { ...coord(1), [key]: 'forged' } as any),
        new RegExp('InvalidParagraphSelectionOptions'),
      );
    assert.equal(calls.length, n);
    assert.equal(editor.getEditorState(), s);
  } finally {
    await editor.dispose();
  }
});
test('실 cb48 편집 load dispose 뒤 old target은 되살리지 않는다', async () => {
  const { editor, bytes } = await open('table.hwpx', 'hwpx');
  try {
    const old = createParagraphSelection(editor.getEditorState(), coord(1));
    await splice(editor, 1, '갱신');
    await assert.rejects(editor.setSelection(old), new RegExp('StaleTarget'));
    const beforeLoad = createParagraphSelection(editor.getEditorState(), coord(1));
    await editor.load(bytes, { format: 'hwpx' });
    await assert.rejects(editor.setSelection(beforeLoad), new RegExp('StaleTarget'));
    const beforeDispose = createParagraphSelection(editor.getEditorState(), coord(1));
    await editor.dispose();
    await assert.rejects(editor.setSelection(beforeDispose), new RegExp('EditorDisposed'));
  } finally {
    await editor.dispose();
  }
});
test('실 cb48 readonly 선택은 가능하지만 편집 권한을 얻지 않는다', async () => {
  const { editor, calls } = await open('table.hwpx', 'hwpx', false);
  try {
    const target = createParagraphSelection(editor.getEditorState(), coord(1));
    await editor.setSelection(target);
    const n = calls.length;
    const result = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: '금지' });
    assert.equal(result.error, 'ReadOnlyDocument');
    assert.equal(calls.length, n);
    assert.equal(row(editor, 1).text, '');
  } finally {
    await editor.dispose();
  }
});
test('별도 API예제 overlay가 빈셀 및 동일문구 좌표를 공식 facade로 연결한다', async () => {
  const { editor } = await open('duplicate-cells.hwpx', 'hwpx');
  const api = createApiPlayground({
    editor,
    spliceCommand: SPLICE_TEXT_COMMAND,
    createParagraphSelection,
    getHistoryAvailability,
  });
  try {
    assert.equal(
      apiSelectionTarget(editor, { paragraph: 3, start: 0, end: 0 }, createParagraphSelection)
        .paragraph,
      3,
    );
    const selected = await api.execute('select', {
      section: 0,
      paragraph: 2,
      start: 0,
      end: 2,
      affinity: 'backward',
    });
    assert.equal(selected.ok, true);
    assert.equal((editor.getEditorState().selection as any).paragraph, 2);
    const blank = await api.execute('select', { section: 0, paragraph: 3, start: 0, end: 0 });
    assert.equal(blank.ok, true);
    const edited = await api.execute('splice', {
      section: 0,
      paragraph: 2,
      start: 0,
      end: 2,
      text: '예제',
    });
    assert.equal(edited.ok, true);
    assert.equal(row(editor, 2).text, '예제😀문구');
    assert.equal(row(editor, 1).text, '같은😀문구');
    assert.ok(apiSampleCode('select', { paragraph: 2 }).includes('createParagraphSelection'));
    assert.ok(!apiSampleCode('select', { paragraph: 2 }).includes('SelectionMatchNotFound'));
    assert.equal(findTextMatch(editor.getEditorState(), '예제😀문구')?.paragraph, 2);
  } finally {
    api.dispose();
    await editor.dispose();
  }
});

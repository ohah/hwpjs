import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { createHwpxReader } from "../../js/hwpx.mjs";

const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
const fixture = name => readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwpx`);

test("all seven selected field labels in tracked HWPX fixtures edit save reopen and restore text", async () => {
  const editor = await createHwpxEditor(wasm), reader = await createHwpxReader(wasm);
  const files = execFileSync("git", ["ls-files", "-z"]).toString().split("\0")
    .filter(path => path.includes("/fixtures/") && path.endsWith(".hwpx") && !path.endsWith("/password-12345.hwpx"));
  const paragraphs = bytes => {
    const result = reader.readTextEvents(bytes), values = new Map();
    for (const event of result.events) {
      if (event.kind === "paragraph_start") values.set(event.paragraph, "");
      if (event.kind === "content") values.set(event.paragraph, values.get(event.paragraph) + event.value);
      if (event.kind === "inline_empty" && event.inlineKind === "tab") values.set(event.paragraph, values.get(event.paragraph) + "\t");
    }
    return values;
  };
  let exercised = 0, fieldFiles = 0;
  try {
    for (const path of files) {
      const input = readFileSync(path); editor.open(input);
      const events = reader.readTextEvents(input), commands = [];
      for (const event of events.events) {
        if (event.kind !== "paragraph_start" || editor.canEdit(event.section, event.paragraph)) continue;
        let targets;
        try { targets = editor.fieldLabels(event.section, event.paragraph); }
        catch (error) { if (["InvalidFieldLinks", "SourceBindingMismatch", "UnsupportedTextPositionProjection"].includes(error.message)) continue; throw error; }
        for (const target of targets) commands.push({ ...target, section: event.section, paragraph: event.paragraph });
      }
      if (commands.length) fieldFiles++;
      const before = paragraphs(input);
      for (const command of commands) {
        editor.open(input);
        editor.spliceFieldLabel(command.section, command.paragraph, command.beginElement, command.start, 0, "검증😀<&");
        const saved = editor.save(), expected = new Map(before), previous = before.get(command.paragraph);
        expected.set(command.paragraph, previous.slice(0, command.start) + "검증😀<&" + previous.slice(command.start));
        assert.deepEqual(paragraphs(saved), expected, path);
        editor.open(saved);
        const current = editor.fieldLabels(command.section, command.paragraph).find(t => t.beginElement === command.beginElement);
        assert(current, path); assert.equal(current.end, command.end + 6, path);
        editor.spliceFieldLabel(command.section, command.paragraph, current.beginElement, command.start, 6, "");
        assert.deepEqual(paragraphs(editor.save()), before, path);
        // dirty is a sticky edit-history flag: restored text does not imply
        // the original ZIP bytes or original dirty attribute are restored.
        exercised++;
      }
    }
    assert.equal(fieldFiles, 2); assert.equal(exercised, 7);
  } finally { editor.close(); reader.close(); }
});

test("public HWPX field label command saves dirty with independently checked XML and ZIP", async () => {
  const input = fixture("hyperlink");
  const locate = [
    "import io,json,sys,zipfile,xml.etree.ElementTree as E",
    "root=E.fromstring(zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).read('Contents/section0.xml'))",
    "ns='{http://www.hancom.co.kr/hwpml/2011/paragraph}'",
    "elements=list(root.iter()); begin=next(e for e in elements if e.tag==ns+'fieldBegin' and e.get('type')=='HYPERLINK')",
    "paragraphs=[e for e in elements if e.tag==ns+'p']; p=next(e for e in paragraphs if begin in list(e.iter()))",
    "start=0",
    "for e in p.iter():",
    "  if e is begin: break",
    "  if e.tag==ns+'t': start+=len((e.text or '').encode('utf-16-le'))//2",
    "print(json.dumps({'begin':elements.index(begin),'paragraph':paragraphs.index(p)+1,'start':start}))",
  ].join("\n");
  const command = JSON.parse(execFileSync("python3", ["-c", locate], { input }));
  const editor = await createHwpxEditor(wasm);
  try {
    editor.open(input);
    const { begin, paragraph, start } = command;
    const targets = editor.fieldLabels(0, paragraph);
    assert(targets.some(target => target.beginElement === begin && target.start === start));
    assert.throws(() => editor.spliceFieldLabel(0, paragraph, -1, start, 0, "x"), { message: "InvalidInteger" });
    assert.throws(() => editor.spliceFieldLabel(0, paragraph, begin, start, 0, "\ud800"), { message: "InvalidText" });
    assert.deepEqual(Buffer.from(editor.save()), input);
    editor.spliceFieldLabel(0, paragraph, begin, start, 0, "검증😀<&");
    const changedTarget = editor.fieldLabels(0, paragraph).find(target => target.beginElement === begin);
    assert.equal(changedTarget.end, targets.find(target => target.beginElement === begin).end + 6);
    const saved = editor.save();
    const oracle = [
      "import io,json,sys,zipfile,xml.etree.ElementTree as E,base64",
      "data=json.load(sys.stdin); a=zipfile.ZipFile(io.BytesIO(base64.b64decode(data['before']))); b=zipfile.ZipFile(io.BytesIO(base64.b64decode(data['after'])))",
      "if a.namelist()!=b.namelist() or a.comment!=b.comment: raise ValueError('ZIP inventory changed')",
      "ns='{http://www.hancom.co.kr/hwpml/2011/paragraph}'",
      "for name in a.namelist():",
      "  before=a.read(name); after=b.read(name)",
      "  if name!='Contents/section0.xml':",
      "    if before!=after: raise ValueError('Other payload changed: '+name)",
      "    continue",
      "  parser=lambda:E.XMLParser(target=E.TreeBuilder(insert_comments=True,insert_pis=True))",
      "  expected=E.fromstring(before,parser=parser()); actual=E.fromstring(after,parser=parser()); elems=list(expected.iter())",
      "  begin=elems[data['begin']]; begin.set('dirty','1'); end=next(e for e in elems[elems.index(begin)+1:] if e.tag==ns+'fieldEnd' and e.get('beginIDRef')==begin.get('id'))",
      "  text=next(e for e in elems[elems.index(begin)+1:elems.index(end)] if e.tag==ns+'t'); text.text='검증😀<&'+(text.text or '')",
      "  if E.tostring(expected)!=E.tostring(actual): raise ValueError('Unexpected XML change')",
    ].join("\n");
    const payload = JSON.stringify({ before: input.toString("base64"), after: Buffer.from(saved).toString("base64"), begin });
    for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "-c", oracle], { input: payload });
    const corrupt = [
      "import io,json,sys,zipfile,xml.etree.ElementTree as E,base64",
      "data=json.load(sys.stdin); source=zipfile.ZipFile(io.BytesIO(base64.b64decode(data['after']))); output=io.BytesIO(); ns='{http://www.hancom.co.kr/hwpml/2011/paragraph}'",
      "entries=source.infolist()",
      "if data['mutation']=='order': entries=list(reversed(entries))",
      "with zipfile.ZipFile(output,'w') as target:",
      "  for entry in entries:",
      "    value=source.read(entry)",
      "    if entry.filename=='Contents/section0.xml' and data['mutation'] in ('dirty','label'):",
      "      root=E.fromstring(value); elems=list(root.iter()); begin=elems[data['begin']]",
      "      if data['mutation']=='dirty': begin.set('dirty','0')",
      "      else:",
      "        end=next(e for e in elems[elems.index(begin)+1:] if e.tag==ns+'fieldEnd' and e.get('beginIDRef')==begin.get('id')); text=next(e for e in elems[elems.index(begin)+1:elems.index(end)] if e.tag==ns+'t'); text.text=(text.text or '')[len('검증😀<&'):]",
      "      value=E.tostring(root,encoding='utf-8')",
      "    if entry.filename=='mimetype' and data['mutation']=='other': value+=b'corrupt'",
      "    target.writestr(entry,value)",
      "  target.comment=source.comment",
      "data['after']=base64.b64encode(output.getvalue()).decode(); print(json.dumps(data))",
    ].join("\n");
    for (const mutation of ["dirty", "label", "other", "order"]) {
      const broken = execFileSync("python3", ["-c", corrupt], { input: JSON.stringify({ ...JSON.parse(payload), mutation }) });
      for (const flags of [[], ["-O"]]) {
        assert.throws(() => execFileSync("python3", [...flags, "-c", oracle], { input: broken, stdio: "pipe" }), error => error.status !== 0);
      }
    }
    assert.throws(() => editor.spliceFieldLabel(0, paragraph, begin, start + 3, 0, "x"), { message: "SplitSurrogatePair" });
    assert.deepEqual(editor.save(), saved);
  } finally { editor.close(); }
});

test("public HWPX refuses paired tabs containing otherwise unowned character data", async () => {
  const script = [
    "import io,re,sys,zipfile",
    "source=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))",
    "output=io.BytesIO()",
    "with zipfile.ZipFile(output,'w') as result:",
    "  for entry in source.infolist():",
    "    data=source.read(entry)",
    "    if entry.filename=='Contents/section0.xml': data,count=re.subn(rb'(<hp:tab\\b[^>]*?)/>',rb'\\1>hidden</hp:tab>',data,count=1)",
    "    result.writestr(entry,data)",
    "  result.comment=source.comment",
    "if count!=1: raise ValueError('Fixture topology drift')",
    "sys.stdout.buffer.write(output.getvalue())",
  ].join("\n");
  const derived = execFileSync("python3", ["-c", script], { input: fixture("tabdef") });
  const editor = await createHwpxEditor(wasm), reader = await createHwpxReader(wasm);
  try {
    editor.open(derived);
    assert(reader.readTextEvents(derived).events.some(e => e.kind === "content" && e.value === "hidden"));
    assert.equal(editor.canEdit(0, 1), false);
    // This paragraph has only tabs: unsupported paired content prevents
    // materializing any owned text site, so refusal occurs at ownership first.
    assert.throws(() => editor.splice(0, 1, 0, 0, "new"), { message: "MissingTextSite" });
    assert.deepEqual(Buffer.from(editor.save()), derived);
  } finally { editor.close(); reader.close(); }
});

test("actual HWPX tabs retain source through boundary edits and refused deletion", async () => {
  const editor = await createHwpxEditor(wasm), reader = await createHwpxReader(wasm);
  const input = fixture("tabdef");
  const text = bytes => reader.readTextEvents(bytes).events.filter(e => e.paragraph === 1)
    .map(e => e.kind === "content" ? e.value : e.kind === "inline_empty" && e.inlineKind === "tab" ? "\t" : "").join("");
  try {
    editor.open(input);
    assert.equal(editor.canEdit(0, 1), true);
    assert.equal(text(input), "\t\t\t");
    for (const position of [0, 1, 2, 3]) {
      editor.splice(0, 1, position, 0, "한😀");
      const saved = editor.save();
      assert.equal(text(saved), "\t".repeat(position) + "한😀" + "\t".repeat(3 - position));
      const oracle = JSON.stringify({ before: input.toString("base64"), after: Buffer.from(saved).toString("base64"), position, text: "한😀" });
      for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-tab-edit-oracle.py"], { input: oracle });
      const tab = position === 0 ? 3 : 0;
      assert.throws(() => editor.splice(0, 1, tab, 1, ""), { message: "ProtectedInlineControl" });
      assert.deepEqual(editor.save(), saved);
      editor.splice(0, 1, position, 3, "");
      assert.deepEqual(Buffer.from(editor.save()), input);
    }
  } finally { editor.close(); reader.close(); }
});

test("HWPX product editor opens all tracked unencrypted fixtures and preserves no-op ZIP", async () => {
  const paths = execFileSync("git", ["ls-files", "-z"]).toString().split("\0")
    .filter(path => path.includes("/fixtures/") && path.endsWith(".hwpx"));
  assert.equal(paths.length, 45);
  const editor = await createHwpxEditor(wasm);
  let opened = 0, encrypted = 0;
  try {
    for (const path of paths) {
      const input = readFileSync(path);
      if (path.endsWith("/password-12345.hwpx")) {
        assert.throws(() => editor.open(input), { message: "EncryptedDocument" });
        encrypted++;
      } else {
        assert(editor.open(input).sectionCount > 0, path);
        assert.deepEqual(Buffer.from(editor.save()), input, path);
        opened++;
      }
    }
    assert.equal(opened, 44); assert.equal(encrypted, 1);
  } finally { editor.close(); }
});

test("HWPX product editor preserves failed reopen and restores original ZIP", async () => {
  const editor = await createHwpxEditor(wasm), reader = await createHwpxReader(wasm);
  const input = fixture("charshape");
  try {
    assert.throws(() => editor.save(), { message: "EditorNotOpen" });
    assert.deepEqual(editor.open(input), { sectionCount: 1 });
    assert.equal(editor.canEdit(0, 1), true);
    assert.equal(editor.canEdit(0, 2), true);
    assert.throws(() => editor.canEdit(1, 2), { message: "InvalidSectionIndex" });
    assert.deepEqual(Buffer.from(editor.save()), input);
    editor.splice(0, 2, 0, 0, "검증😀<&\r");
    const saved = editor.save();
    const events = reader.readTextEvents(saved).events;
    const text = events.filter(e => e.kind === "content" && e.paragraph === 2).map(e => e.value).join("");
    assert(text.startsWith("검증😀<&\r"));
    assert.throws(() => editor.open(fixture("password-12345")), { message: "EncryptedDocument" });
    assert.deepEqual(editor.save(), saved);
    assert.throws(() => editor.splice(0, 2, 3, 0, "x"), { message: "SplitSurrogatePair" });
    assert.deepEqual(editor.save(), saved);
    editor.splice(0, 2, 0, 7, "");
    assert.deepEqual(Buffer.from(editor.save()), input);
  } finally { editor.close(); reader.close(); }
  editor.close();
  assert.throws(() => editor.save(), { message: "EditorClosed" });
});

test("HWPX editor rejects JS coercions before mutating native state", async () => {
  const editor = await createHwpxEditor(wasm);
  try {
    editor.open(fixture("charshape"));
    const before = editor.save();
    for (const value of [-1, 0.5, NaN, Infinity, 0x100000000, "0"]) {
      assert.throws(() => editor.splice(value, 2, 0, 0, "x"), { message: "InvalidInteger" });
    }
    assert.throws(() => editor.splice(0, 2, 0, 0, "\ud800"), { message: "InvalidText" });
    assert.deepEqual(editor.save(), before);
  } finally { editor.close(); }
});

test("saved HWPX reopens as independently owned editable state", async () => {
  const first = await createHwpxEditor(wasm), second = await createHwpxEditor(wasm);
  const reader = await createHwpxReader(wasm);
  try {
    first.open(fixture("charshape"));
    first.splice(0, 2, 0, 0, "첫😀");
    const bytes = first.save(), preserved = bytes.slice();
    second.open(bytes);
    bytes.fill(0);
    assert.deepEqual(second.save(), preserved);
    second.splice(0, 2, 0, 3, "다음");
    const events = reader.readTextEvents(second.save()).events;
    assert(events.filter(e => e.kind === "content" && e.paragraph === 2).map(e => e.value).join("").startsWith("다음"));
    assert.deepEqual(first.save(), preserved);
    first.close();
    second.splice(0, 2, 0, 2, "");
    assert.equal(second.canEdit(0, 2), true);
  } finally { first.close(); second.close(); reader.close(); }
});

test("column metadata paragraph edit matches independent Python XML and ZIP decoder", async () => {
  const editor = await createHwpxEditor(wasm);
  const original = fixture("charshape");
  try {
    editor.open(original);
    editor.splice(0, 1, 0, 0, "검증😀<&\r");
    const saved = editor.save();
    const script = [
      "import base64, io, json, sys, zipfile",
      "import runpy",
      "compare_text_edit=runpy.run_path('tools/zip-replacement-oracle.py')['compare_text_edit']",
      "data=json.load(sys.stdin)",
      "before=zipfile.ZipFile(io.BytesIO(base64.b64decode(data['before'])))",
      "after=zipfile.ZipFile(io.BytesIO(base64.b64decode(data['after'])))",
      "if before.namelist()!=after.namelist() or after.testzip() is not None: raise ValueError('ZIP mismatch')",
      "for entry in before.infolist():",
      "  if entry.filename=='Contents/section0.xml': compare_text_edit(before.read(entry),after.read(entry.filename))",
      "  elif before.read(entry)!=after.read(entry.filename): raise ValueError('Other payload changed')",
      "  current=after.getinfo(entry.filename)",
      "  for field in ('compress_type','date_time','extra','comment','external_attr','internal_attr','create_system'):",
      "    if getattr(entry,field)!=getattr(current,field): raise ValueError('Metadata changed')",
      "if before.comment!=after.comment: raise ValueError('Archive comment changed')",
    ].join("\n");
    const data = JSON.stringify({ before: original.toString("base64"), after: Buffer.from(saved).toString("base64") });
    for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "-c", script], { input: data });
  } finally { editor.close(); }
});

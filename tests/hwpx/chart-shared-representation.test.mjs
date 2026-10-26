import nodeTest from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync as oracleExecFileSync } from "../../tools/oracle-process.mjs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";

const test = (name, run) => {
  const fixture = name.startsWith("actual disjoint")
    ? "reference/rhwp/samples/issue2006/1790387_prep_final_report.hwpx"
    : name.startsWith("direct series")
      ? "reference/rhwp/samples/issue6037/2차원원형-계열추가.hwpx"
      : "reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx";
  return nodeTest(
    name,
    { skip: existsSync(fixture) ? false : `RHWP fixture is unavailable: ${fixture}` },
    run,
  );
};

// Give every independent checker a bounded lifetime and regular-file EOF.
const execFileSync = (command, args, options) =>
  oracleExecFileSync(command, args, { timeout: 30000, ...options });

const derive = `import io,sys,zipfile,copy,xml.etree.ElementTree as E
p='{http://www.hancom.co.kr/hwpml/2011/paragraph}';o='{http://www.idpf.org/2007/opf/}'
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));payloads={i.filename:z.read(i.filename) for i in z.infolist()}
section=E.fromstring(payloads['Contents/section0.xml']);manifest=E.fromstring(payloads['Contents/content.hpf']);parents={c:n for n in section.iter() for c in n}
switch=next(section.iter(p+'switch'));run=parents[switch];clone=copy.deepcopy(run);ole=next(clone.iter(p+'ole'));old=ole.get('binaryItemIDRef');ole.set('binaryItemIDRef','aliasOle');parents[run].append(clone)
item=next(n for n in manifest.iter(o+'item') if n.get('id')==old);alias=copy.deepcopy(item);alias.set('id','aliasOle');alias.set('href','BinData/alias.ole');next(manifest.iter(o+'manifest')).append(alias)
mode=sys.argv[1] if len(sys.argv)>1 else 'shared_xml'
if mode=='shared_ole':
 alias.set('href',item.get('href'));next(clone.iter(p+'chart')).set('chartIDRef','Chart/alias.xml')
if mode in ['chain','mismatch']:
 third=copy.deepcopy(clone);next(third.iter(p+'chart')).set('chartIDRef','Chart/alias.xml');parents[run].append(third)
output=io.BytesIO()
with zipfile.ZipFile(output,'w') as out:
 for info in z.infolist():out.writestr(copy.copy(info),E.tostring(section) if info.filename=='Contents/section0.xml' else E.tostring(manifest) if info.filename=='Contents/content.hpf' else payloads[info.filename])
 out.writestr('BinData/alias.ole',payloads[item.get('href')])
 if mode!='shared_xml':
  chart=payloads['Chart/chart1.xml']
  if mode=='mismatch':
   parsed=E.fromstring(chart);next(parsed.iter('{http://schemas.openxmlformats.org/drawingml/2006/chart}v')).text='different';chart=E.tostring(parsed)
  out.writestr('Chart/alias.xml',chart)
sys.stdout.buffer.write(output.getvalue())`;

const verify = `import io,sys,zipfile,olefile
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));expected=z.read('Chart/chart1.xml')
if 'Chart/alias.xml' in z.namelist() and z.read('Chart/alias.xml')!=expected:raise ValueError('SharedChartXmlMismatch')
for path in ['BinData/ole1.ole','BinData/alias.ole']:
 payload=z.read(path)
 if not payload.startswith(bytes.fromhex('d0cf11e0a1b11ae1')):payload=payload[4:]
 with olefile.OleFileIO(io.BytesIO(payload)) as compound:
  if compound.openstream('OOXMLChartContents').read()!=expected:raise ValueError('SharedChartRepresentationMismatch: '+path)
`;

test("actual disjoint charts retain independent owners through sequential edits and history", async () => {
  const input = readFileSync("reference/rhwp/samples/issue2006/1790387_prep_final_report.hwpx");
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  try {
    editor.open(input, { allowObservedChartOleDeviations: true });
    const nodes = editor.chartNodes(0);
    assert.equal(nodes.length, 2);
    const originals = nodes.map((node) => editor.chartPoints(0, node));
    assert.notEqual(originals[0].pair.chart_path, originals[1].pair.chart_path);
    assert.notEqual(originals[0].pair.ole_path, originals[1].pair.ole_path);
    const ordinals = originals.map((chart) =>
      chart.values.points.findIndex((point) => point.kind === "numeric_cache"),
    );
    assert.ok(ordinals.every((point) => point >= 0));
    editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 32 * 1024 * 1024 });
    const states = [input],
      values = ["314.159", "6.70"];
    for (let target = 0; target < nodes.length; target++) {
      editor.setChartPoint(0, nodes[target], ordinals[target], values[target]);
      states.push(Buffer.from(editor.save()));
      const chart = originals[target],
        row = chart.values.points[ordinals[target]];
      const payload = {
        before: states[target].toString("base64"),
        after: states[target + 1].toString("base64"),
        chart: chart.pair.chart_path,
        ole: chart.pair.ole_path,
        value_node: row.value_node,
        kind: row.kind,
        value: values[target],
        allow_root_creation_zero: true,
      };
      for (const flags of [[], ["-O"]]) {
        const check = (data) =>
          execFileSync("python3", [...flags, "tools/hwpx-chart-session-oracle.py"], {
            input: JSON.stringify(data),
            timeout: 30000,
          });
        check(payload);
        assert.throws(
          () => check({ ...payload, value: "wrong" }),
          (error) => error.status === 1 && String(error.stderr).includes("chart XML mismatch"),
        );
      }
      for (let owner = 0; owner < nodes.length; owner++) {
        const current = editor.chartPoints(0, nodes[owner]);
        for (const [ordinal, point] of current.values.points.entries()) {
          assert.equal(
            point.value,
            owner <= target && ordinal === ordinals[owner]
              ? values[owner]
              : originals[owner].values.points[ordinal].value,
          );
        }
      }
    }
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), states[1]);
    const revision = editor.historyRevision(),
      revisions = editor.historyRevisions();
    const beforeRefusal = nodes.map((node) => editor.chartPoints(0, node));
    for (const change of [
      () => editor.setChartPoint(0, nodes[1], ordinals[1], "not-a-number"),
      () => editor.setChartPoint(0, nodes[0], 0xffffffff, "1"),
    ]) {
      assert.throws(change, /InvalidChartNumericValue|InvalidChartPointIndex/);
      assert.deepEqual(Buffer.from(editor.save()), states[1]);
      assert.equal(editor.historyRevision(), revision);
      assert.deepEqual(editor.historyRevisions(), revisions);
      assert.deepEqual(
        nodes.map((node) => editor.chartPoints(0, node)),
        beforeRefusal,
      );
    }
    editor.setChartPoint(0, nodes[0], ordinals[0], values[0]);
    assert.equal(
      editor.historyRevision(),
      revision,
      "an unchanged first owner must not discard the second owner's redo",
    );
    assert.deepEqual(editor.historyRevisions(), revisions);
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), states[0]);
    for (const expected of [states[1], states[2]]) {
      assert.equal(editor.redo(), true);
      assert.deepEqual(Buffer.from(editor.save()), expected);
    }
    editor.open(states[2], { allowObservedChartOleDeviations: true });
    const reopened = editor.chartNodes(0);
    for (let owner = 0; owner < nodes.length; owner++)
      assert.equal(
        editor.chartPoints(0, reopened[owner]).values.points[ordinals[owner]].value,
        values[owner],
      );
    assert.deepEqual(Buffer.from(editor.save()), states[2]);
  } finally {
    editor.close();
  }
});

test("shared chart XML updates every associated OLE copy through save and history", async () => {
  const input = execFileSync("python3", ["-c", derive], {
    input: readFileSync("reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx"),
  });
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  try {
    editor.open(input);
    const nodes = editor.chartNodes(0);
    assert.equal(nodes.length, 2);
    const original = editor.chartPoints(0, nodes[0]);
    const point = original.values.points.findIndex((row) => row.kind === "numeric_cache");
    assert.ok(point >= 0);
    editor.enableHistory();
    editor.setChartPoint(0, nodes[0], point, "314.159");
    const saved = editor.save();
    for (const flags of [[], ["-O"]])
      execFileSync("python3", [...flags, "-c", verify], { input: saved });
    assert.equal(editor.chartPoints(0, nodes[1]).values.points[point].value, "314.159");
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save(), saved);
    editor.open(saved);
    editor.setChartPoint(0, nodes[1], point, "6.70");
    const second = editor.save();
    for (const flags of [[], ["-O"]])
      execFileSync("python3", [...flags, "-c", verify], { input: second });
    assert.equal(editor.chartPoints(0, nodes[0]).values.points[point].value, "6.70");
  } finally {
    editor.close();
  }
});

for (const [mode, count] of [
  ["shared_ole", 2],
  ["chain", 3],
])
  test(`shared chart connected component ${mode} has one current owner`, async () => {
    const input = execFileSync("python3", ["-c", derive, mode], {
      input: readFileSync("reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx"),
    });
    const editor = await createHwpxEditor(
      readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
    );
    try {
      editor.open(input);
      const nodes = editor.chartNodes(0);
      assert.equal(nodes.length, count);
      const point = editor
        .chartPoints(0, nodes[0])
        .values.points.findIndex((row) => row.kind === "numeric_cache");
      editor.enableHistory();
      editor.setChartPoint(0, nodes.at(-1), point, "314.159");
      for (const node of nodes)
        assert.equal(editor.chartPoints(0, node).values.points[point].value, "314.159");
      const saved = editor.save();
      // An unreferenced extra OLE in shared_ole remains unchanged by design.
      const checker =
        mode === "shared_ole"
          ? verify.replace("['BinData/ole1.ole','BinData/alias.ole']", "['BinData/ole1.ole']")
          : verify;
      for (const flags of [[], ["-O"]])
        execFileSync("python3", [...flags, "-c", checker], { input: saved });
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save(), saved);
      editor.open(saved);
      editor.setChartPoint(0, nodes[0], point, "6.70");
      for (const node of nodes)
        assert.equal(editor.chartPoints(0, node).values.points[point].value, "6.70");
      for (const flags of [[], ["-O"]])
        execFileSync("python3", [...flags, "-c", checker], { input: editor.save() });
    } finally {
      editor.close();
    }
  });

test("shared chart across sections keeps one owner and untouched section XML", async () => {
  const original = readFileSync("reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx");
  const shared = execFileSync("python3", ["-c", derive], { input: original });
  const across = `import io,sys,zipfile,copy,xml.etree.ElementTree as E
p='{http://www.hancom.co.kr/hwpml/2011/paragraph}';o='{http://www.idpf.org/2007/opf/}'
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));parts={i.filename:z.read(i.filename) for i in z.infolist()}
first=E.fromstring(parts['Contents/section0.xml']);second=copy.deepcopy(first)
for section,remove in [(first,-1),(second,0)]:
 parents={c:n for n in section.iter() for c in n};switches=list(section.iter(p+'switch'));run=parents[switches[remove]];parents[run].remove(run)
head=E.fromstring(parts['Contents/header.xml']);head.set('secCnt','2');parts['Contents/header.xml']=E.tostring(head)
manifest=E.fromstring(parts['Contents/content.hpf']);E.SubElement(next(manifest.iter(o+'manifest')),o+'item',{'id':'section1','href':'Contents/section1.xml','media-type':'application/xml'})
spine=next(manifest.iter(o+'spine'));spine.insert(2,E.Element(o+'itemref',{'idref':'section1','linear':'yes'}));parts['Contents/content.hpf']=E.tostring(manifest)
parts['Contents/section0.xml']=E.tostring(first);parts['Contents/section1.xml']=E.tostring(second)
output=io.BytesIO()
with zipfile.ZipFile(output,'w') as out:
 for name,payload in parts.items():out.writestr(name,payload)
sys.stdout.buffer.write(output.getvalue())`;
  const input = execFileSync("python3", ["-c", across], { input: shared });
  const sections = (bytes) =>
    execFileSync(
      "python3",
      [
        "-c",
        "import io,sys,zipfile,hashlib;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));print([(p,hashlib.sha256(z.read(p)).hexdigest()) for p in ['Contents/section0.xml','Contents/section1.xml']])",
      ],
      { input: bytes, encoding: "utf8" },
    );
  const before = sections(input);
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  try {
    editor.open(input);
    editor.enableHistory();
    const nodes = [0, 1].map((section) => {
      const rows = editor.chartNodes(section);
      assert.equal(rows.length, 1);
      return rows[0];
    });
    const point = editor
      .chartPoints(0, nodes[0])
      .values.points.findIndex((row) => row.kind === "numeric_cache");
    assert.ok(point >= 0);
    editor.setChartPoint(1, nodes[1], point, "314.159");
    assert.equal(editor.chartPoints(0, nodes[0]).values.points[point].value, "314.159");
    const saved = editor.save();
    assert.equal(sections(saved), before);
    for (const flags of [[], ["-O"]])
      execFileSync("python3", [...flags, "-c", verify], { input: saved });
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save(), saved);
    editor.open(saved);
    editor.setChartPoint(0, nodes[0], point, "6.70");
    assert.equal(editor.chartPoints(1, nodes[1]).values.points[point].value, "6.70");
    const changed = editor.save();
    assert.equal(sections(changed), before);
    for (const flags of [[], ["-O"]])
      execFileSync("python3", [...flags, "-c", verify], { input: changed });
  } finally {
    editor.close();
  }
});

test("mismatched connected chart source refuses atomically and preserves history revision", async () => {
  const input = execFileSync("python3", ["-c", derive, "mismatch"], {
    input: readFileSync("reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx"),
  });
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  try {
    editor.open(input);
    const nodes = editor.chartNodes(0);
    const point = editor
      .chartPoints(0, nodes[0])
      .values.points.findIndex((row) => row.kind === "numeric_cache");
    editor.enableHistory();
    const revision = editor.historyRevision();
    assert.throws(
      () => editor.setChartPoint(0, nodes[0], point, "314.159"),
      /SourceBindingMismatch|ChartRepresentationMismatch/,
    );
    assert.equal(editor.historyRevision(), revision);
    assert.deepEqual(Buffer.from(editor.save()), input);
  } finally {
    editor.close();
  }
});

for (const [mode, count] of [
  ["shared_xml", 2],
  ["shared_ole", 2],
  ["chain", 3],
])
  test(`direct series shared component ${mode} updates every physical copy and history`, async () => {
    const input = execFileSync("python3", ["-c", derive, mode], {
      input: readFileSync("reference/rhwp/samples/issue6037/2차원원형-계열추가.hwpx"),
    });
    const editor = await createHwpxEditor(
      readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
    );
    try {
      editor.open(input, { allowObservedChartOleDeviations: true });
      editor.enableHistory();
      const nodes = editor.chartNodes(0);
      assert.equal(nodes.length, count);
      const pairs = nodes.map((node) => {
        const chart = editor.chartPoints(0, node),
          names = editor.chartSeriesText(0, node);
        assert.equal(names.values.length, 1);
        return {
          chart: chart.pair.chart_path,
          ole: chart.pair.ole_path,
          value_node: names.values[0].value_node,
        };
      });
      const first = { chart: "Chart/chart1.xml", ole: "BinData/ole1.ole" };
      const alias =
        mode === "shared_ole"
          ? { chart: "Chart/alias.xml", ole: first.ole }
          : { chart: first.chart, ole: "BinData/alias.ole" };
      const expected =
        mode === "chain"
          ? [first, alias, { chart: "Chart/alias.xml", ole: "BinData/alias.ole" }]
          : [first, alias];
      assert.deepEqual(
        pairs.map(({ chart, ole }) => ({ chart, ole })),
        expected,
      );
      const text = "공유 이름😀<&_x0008_";
      editor.setChartSeriesText(0, nodes.at(-1), 0, text);
      for (const node of nodes) assert.equal(editor.chartSeriesText(0, node).values[0].text, text);
      const saved = editor.save();
      for (const flags of [[], ["-O"]]) {
        const payload = {
          before: input.toString("base64"),
          after: Buffer.from(saved).toString("base64"),
          pairs,
          value: text,
          allow_root_creation_zero: true,
        };
        const verify = (data) =>
          execFileSync("python3", [...flags, "tools/hwpx-chart-shared-series-oracle.py"], {
            input: JSON.stringify(data),
            timeout: 30000,
          });
        verify(payload);
        assert.throws(
          () => verify({ ...payload, value: "wrong" }),
          (error) => error.status === 1 && /chart XML mismatch/.test(String(error.stderr)),
        );
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save()), input);
      const revision = editor.historyRevision();
      assert.throws(
        () => editor.setChartSeriesText(0, nodes[0], 1, "bad"),
        /InvalidChartSeriesTextIndex/,
      );
      assert.equal(editor.historyRevision(), revision);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save(), saved);
      editor.open(saved, { allowObservedChartOleDeviations: true });
      for (const node of nodes) assert.equal(editor.chartSeriesText(0, node).values[0].text, text);
      assert.deepEqual(editor.save(), saved);
    } finally {
      editor.close();
    }
  });

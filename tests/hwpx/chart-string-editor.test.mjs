import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';
import { referenceChartFixturePaths } from './chart-fixture-paths.mjs';
const test = (name, run) =>
  nodeTest(
    name,
    {
      skip: !existsSync('reference/rhwp/samples/chart')
        ? 'RHWP chart reference fixtures are unavailable'
        : false,
    },
    run,
  );

test('derived multilevel chart API edits one level with independent two-copy history', async () => {
  const derive = `import io,sys,zipfile,re,copy,olefile,xml.etree.ElementTree as E
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));parts={i.filename:z.read(i.filename) for i in z.infolist()};old=parts['Chart/chart1.xml']
levels=''.join('<c:lvl>'+''.join('<c:pt idx="'+str(i)+'"><c:v>'+v+'</c:v></c:pt>' for i,v in enumerate(values))+'</c:lvl>' for values in ['abcd','WXYZ'])
category=('<c:cat><c:multiLvlStrRef><c:f>Sheet1!$A$2:$B$5</c:f><c:multiLvlStrCache><c:ptCount val="4"/>'+levels+'</c:multiLvlStrCache></c:multiLvlStrRef></c:cat>').encode()
chart,count=re.subn(rb'<c:cat>.*?</c:cat>',lambda _:category,old,count=1,flags=re.S)
E.register_namespace('c','http://schemas.openxmlformats.org/drawingml/2006/chart');root=E.fromstring(chart);u='{http://schemas.openxmlformats.org/drawingml/2006/chart}';parents={child:parent for parent in root.iter() for child in parent}
for series in list(root.iter(u+'ser'))[1:]:parents[series].remove(series)
chart=E.tostring(root,encoding='utf-8')
if count!=1 or len(chart)>len(old):raise ValueError('InvalidMultilevelDerivativeSize')
chart+=b' '*(len(old)-len(chart));parts['Chart/chart1.xml']=chart
payload=parts['BinData/ole1.ole'];prefix=b'' if payload.startswith(bytes.fromhex('d0cf11e0a1b11ae1')) else payload[:4];compound=io.BytesIO(payload[len(prefix):])
with olefile.OleFileIO(compound,write_mode=True) as ole:ole.write_stream('OOXMLChartContents',chart)
parts['BinData/ole1.ole']=prefix+compound.getvalue();output=io.BytesIO()
with zipfile.ZipFile(output,'w') as out:
 for info in z.infolist():out.writestr(copy.copy(info),parts[info.filename])
sys.stdout.buffer.write(output.getvalue())`;
  const input = execFileSync('python3', ['-c', derive], {
    input: readFileSync('reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx'),
  });
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
  );
  try {
    editor.open(input);
    editor.enableHistory();
    const [wrapper] = editor.chartNodes(0),
      original = editor.chartPoints(0, wrapper);
    const rows = original.values.points
      .map((row, index) => ({ ...row, ordinal: index }))
      .filter((row) => row.kind === 'multilevel_cache');
    assert.equal(rows.length, 8);
    const target = rows[4],
      value = '두 번째😀<&_x0008_';
    assert.equal(target.index, rows[0].index);
    assert.notEqual(target.level_node, rows[0].level_node);
    editor.setChartPoint(0, wrapper, target.ordinal, value);
    const saved = editor.save();
    for (const [index, row] of original.values.points.entries())
      assert.equal(
        editor.chartPoints(0, wrapper).values.points[index].value,
        index === target.ordinal ? value : row.value,
      );
    const payload = {
      before: input.toString('base64'),
      after: Buffer.from(saved).toString('base64'),
      chart: original.pair.chart_path,
      ole: original.pair.ole_path,
      value_node: target.value_node,
      kind: target.kind,
      value,
    };
    for (const flags of [[], ['-O']]) {
      const verify = (data) =>
        execFileSync('python3', [...flags, 'tools/hwpx-chart-session-oracle.py'], {
          input: JSON.stringify(data),
          timeout: 30000,
        });
      verify(payload);
      assert.throws(
        () => verify({ ...payload, value_node: rows[0].value_node }),
        (error) => error.status === 1 && String(error.stderr).includes('chart XML mismatch'),
      );
    }
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save(), saved);
    editor.open(saved);
    assert.equal(editor.chartPoints(0, wrapper).values.points[target.ordinal].value, value);
  } finally {
    editor.close();
  }
});

test('every reference string chart point supports independent save and history', async () => {
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
  );
  let verified = 0;
  try {
    for (const path of referenceChartFixturePaths()) {
      const input = readFileSync(path);
      editor.open(input);
      const wrappers = editor.chartNodes(0);
      assert.equal(wrappers.length, 1);
      const wrapper = wrappers[0];
      const original = editor.chartPoints(0, wrapper);
      for (const [point, row] of original.values.points.entries()) {
        if (!['string_cache', 'string_literal', 'multilevel_cache'].includes(row.kind)) continue;
        editor.open(input);
        editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 16 * 1024 * 1024 });
        let value = point % 3 ? '문자😀<&_x0008_\0\r\n\t' : '';
        if (value === row.value) value = '새 값😀';
        editor.setChartPoint(0, wrapper, point, value);
        const saved = editor.save();
        const payload = {
          before: input.toString('base64'),
          after: Buffer.from(saved).toString('base64'),
          chart: original.pair.chart_path,
          ole: original.pair.ole_path,
          value_node: row.value_node,
          kind: row.kind,
          value,
        };
        for (const flags of [[], ['-O']])
          execFileSync('python3', [...flags, 'tools/hwpx-chart-session-oracle.py'], {
            input: JSON.stringify(payload),
            timeout: 30000,
          });
        const current = editor.chartPoints(0, wrapper);
        for (const [index, before] of original.values.points.entries())
          assert.equal(
            current.values.points[index].value,
            index === point ? value : before.value,
            `${path}: point ${point} changed unrelated ${index}`,
          );
        assert.equal(editor.undo(), true);
        assert.deepEqual(Buffer.from(editor.save()), input);
        assert.equal(editor.redo(), true);
        assert.deepEqual(editor.save(), saved);
        editor.open(saved);
        assert.equal(editor.chartPoints(0, wrapper).values.points[point].value, value);
        verified++;
      }
    }
    assert.equal(verified, 297, 'complete reference string point inventory');
  } finally {
    editor.close();
  }
});

test('chart string API preserves Xstring literals Unicode controls and independent two-copy history', async () => {
  const input = readFileSync('reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx');
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
  );
  try {
    for (const value of ['제목😀<&_x0008_\0\r\n\t', '', '_x005F_xD800_', '새 범주']) {
      editor.open(input);
      const [wrapper] = editor.chartNodes(0);
      const original = editor.chartPoints(0, wrapper);
      const point = original.values.points.findIndex((row) => row.kind === 'string_cache');
      assert.ok(point >= 0);
      editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 16 * 1024 * 1024 });
      editor.setChartPoint(0, wrapper, point, value);
      const saved = editor.save();
      assert.equal(editor.chartPoints(0, wrapper).values.points[point].value, value);
      const payload = {
        before: input.toString('base64'),
        after: Buffer.from(saved).toString('base64'),
        chart: original.pair.chart_path,
        ole: original.pair.ole_path,
        value_node: original.values.points[point].value_node,
        kind: original.values.points[point].kind,
        value,
      };
      for (const flags of [[], ['-O']]) {
        const verify = (data) =>
          execFileSync('python3', [...flags, 'tools/hwpx-chart-session-oracle.py'], {
            input: JSON.stringify(data),
            timeout: 30000,
          });
        verify(payload);
        assert.throws(
          () => verify({ ...payload, value: 'wrong' }),
          (error) => error.status === 1 && String(error.stderr).includes('chart XML mismatch'),
        );
      }
      assert.throws(
        () => editor.setChartNumericPoint(0, wrapper, point, '2'),
        /UnsupportedChartPointKind/,
      );
      assert.deepEqual(editor.save(), saved);
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save(), saved);
      editor.open(saved);
      assert.equal(editor.chartPoints(0, wrapper).values.points[point].value, value);
    }
  } finally {
    editor.close();
  }
});

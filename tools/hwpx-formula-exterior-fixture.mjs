// Verification-only derived fixture; never part of the product parser.
import { readFileSync } from "node:fs";
import { execFileSync } from "./oracle-process.mjs";

export function formulaExteriorFixture(placement, { mixed = false } = {}) {
  if (!["same-run", "separate-run"].includes(placement))
    throw new TypeError("Invalid exterior placement");
  if (typeof mixed !== "boolean") throw new TypeError("Invalid mixed fixture policy");
  const derived = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `
import sys, io, json, base64, zipfile, xml.etree.ElementTree as ET
P = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as source:
    root = ET.fromstring(source.read('Contents/section0.xml'))
    if ${mixed ? "True" : "False"}:
        if any(node.get('id') == '4242424242' for node in root.iter(P + 'fieldBegin')):
            raise ValueError('Mixed fixture field ID collision')
        hyperlink = ET.fromstring('<p:p xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph" id="424242" paraPrIDRef="0" styleIDRef="0"><p:run charPrIDRef="7"><p:t>outside</p:t><p:ctrl><p:fieldBegin id="4242424242" type="HYPERLINK"><p:parameters><p:stringParam name="Command">https://example.com</p:stringParam></p:parameters></p:fieldBegin></p:ctrl><p:t>label</p:t><p:ctrl><p:fieldEnd beginIDRef="4242424242"/></p:ctrl></p:run></p:p>')
        root.insert(1, hyperlink)
    for ordinal, paragraph in enumerate(root.iter(P + 'p'), 1):
        run = next((run for run in paragraph.findall(P + 'run') if any(node.get('type') == 'FORMULA' for node in run.findall(P + 'ctrl/' + P + 'fieldBegin'))), None)
        if run is not None:
            text = ET.Element(P + 't'); text.text = 'outside'
            if '${placement}' == 'same-run':
                run.insert(0, text)
            else:
                prefix_run = ET.Element(P + 'run', dict(run.attrib))
                prefix_run.append(text)
                paragraph.insert(0, prefix_run)
            suffix = ET.Element(P + 't'); suffix.text = 'after'
            run.append(suffix)
            break
    else: raise ValueError('Missing formula paragraph')
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as target:
        target.comment = source.comment
        for info in source.infolist():
            target.writestr(info, ET.tostring(root, encoding='utf-8') if info.filename == 'Contents/section0.xml' else source.read(info.filename))
    print(json.dumps({'input': base64.b64encode(output.getvalue()).decode(), 'paragraph': ordinal}))
`,
      ],
      {
        input: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx"),
        encoding: "utf8",
      },
    ),
  );
  return { input: Buffer.from(derived.input, "base64"), paragraph: derived.paragraph };
}

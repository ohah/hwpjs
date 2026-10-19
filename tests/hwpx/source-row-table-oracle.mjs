import { execFileSync } from "node:child_process";

// Independent expanded-name XML traversal; never calls a product parser.
export function sourceRowTableOracle(path, tableId) {
  return JSON.parse(execFileSync("python3", ["-c", `
import zipfile,xml.etree.ElementTree as E,json,sys
r=E.fromstring(zipfile.ZipFile(sys.argv[1]).read('Contents/section0.xml'))
n='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
nodes=list(r.iter()); indices={id(e):i for i,e in enumerate(nodes)}
tables=[e for e in r.iter(n+'tbl') if e.get('id')==sys.argv[2]]; assert len(tables)==1
t=tables[0]; cells=[]
for tr in t.findall(n+'tr'):
 for tc in tr.findall(n+'tc'):
  a=tc.find(n+'cellAddr'); s=tc.find(n+'cellSpan'); z=tc.find(n+'cellSz'); owner=tc.find(n+'subList')
  cells.append(dict(listNode=indices[id(owner)],row=int(a.get('rowAddr')),column=int(a.get('colAddr')),rowSpan=int(s.get('rowSpan')),columnSpan=int(s.get('colSpan')),width=int(z.get('width'))))
print(json.dumps(dict(tableNode=indices[id(t)],rows=int(t.get('rowCnt')),columns=int(t.get('colCnt')),cells=cells,declaredWidth=int(t.find(n+'sz').get('width')))))
`, path, String(tableId)], { encoding: "utf8", timeout: 30000 }));
}

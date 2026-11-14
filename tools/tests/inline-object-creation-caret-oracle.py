from pathlib import Path
import zipfile,xml.etree.ElementTree as ET,hashlib,json,sys
p=Path(sys.argv[1]).resolve();hp='http://www.hancom.co.kr/hwpml/2011/paragraph';c='http://schemas.openxmlformats.org/drawingml/2006/chart';count=0
q=lambda n:'{'+hp+'}'+n
def need(ok,msg):
 global count
 count+=1
 if not ok:raise ValueError(msg)
def load(f):
 with zipfile.ZipFile(f) as z:
  need(z.testzip() is None,str(f)+' CRC');need(len(z.namelist())==len(set(z.namelist())),str(f)+' unique entries');out={n:z.read(n) for n in z.namelist()}
 for n,b in out.items():
  if n.endswith(('.xml','.hpf')):ET.fromstring(b)
 return out
def paragraphs(parts):return ET.fromstring(parts['Contents/section0.xml']).findall(q('p'))
for mode in ['saved','live']:
 for kind in ['equation','chart']:
  prefix=f'{mode}-{kind}';before=load(p/f'{prefix}-before.hwpx');after=load(p/f'{prefix}-after.hwpx');a=paragraphs(before);b=paragraphs(after);need(len(a)==len(b)==2,prefix+' body paragraph count');need(ET.tostring(a[0])==ET.tostring(b[0]),prefix+' first chart paragraph unchanged')
  need(not list(a[1].iter(q('chart'))) and not list(a[1].iter(q('equation'))),prefix+' source second paragraph has no object');need(all(e.tag==q('t') for run in a[1].findall(q('run')) for e in run),prefix+' source second paragraph only text children');need(''.join(e.text or '' for e in a[1].iter(q('t')))=='',prefix+' source second paragraph empty')
  for name in before:
   if name not in {'Contents/section0.xml','Contents/content.hpf'}:need(after[name]==before[name],prefix+' existing resource unchanged '+name)
  objects=list(b[1].iter(q(kind)));need(len(objects)==1,prefix+' one new object in second paragraph')
  if kind=='equation':need(objects[0].find(q('script')).text=='a+b',prefix+' exact script');need(set(after)==set(before),prefix+' no new package resource')
  else:
   path=objects[0].get('chartIDRef');need(path in after and path not in before,prefix+' distinct new chart resource');chart=ET.fromstring(after[path]);ns={'c':c};need(chart.find('.//c:tx/c:v',ns).text=='두 번째',prefix+' new series name');need(chart.find('.//c:cat//c:v',ns).text=='추가',prefix+' new category');expected='999' if '--wrong-value' in sys.argv else '42';need(chart.find('.//c:val//c:v',ns).text==expected,prefix+' new chart value');need(len(set(after)-set(before))==2,prefix+' new chart and fallback only')
  for stage,expected in [('undo',before),('redo',after),('reopened',after)]:need(load(p/f'{prefix}-{stage}.hwpx')==expected,prefix+' exact all member bytes '+stage)
  result=json.loads((p/f'{prefix}-result.json').read_text());need(result['revisionAfter']==result['revisionBefore']+1,prefix+' single history revision')
need(''.join(e.text or '' for e in paragraphs(load(p/'budget-preserved-redo.hwpx'))[1].iter(q('t')))=='X','rejected creation preserves existing text redo')
print(json.dumps({'independent':'Python stdlib ZIP/XML','checks':count,'result':'pass','artifacts':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(p.glob('*.hwpx'))}},indent=2))

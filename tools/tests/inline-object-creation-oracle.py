from pathlib import Path
import zipfile,xml.etree.ElementTree as ET,json,hashlib,sys
p=Path(sys.argv[1]).resolve();checks=0
if any(word in str(p).lower() for word in ['hwpers', 'title-column-roundtrip']):raise ValueError('ProtectedBeforeAccess')
hp='http://www.hancom.co.kr/hwpml/2011/paragraph';c='http://schemas.openxmlformats.org/drawingml/2006/chart';opf='http://www.idpf.org/2007/opf/'
def need(condition,message):
 global checks
 checks+=1
 if not condition:raise ValueError(message)
def q(name):return '{'+hp+'}'+name
def load(name):
 with zipfile.ZipFile(p/name) as z:
  need(z.testzip() is None,name+' ZIP CRC');names=z.namelist();need(len(names)==len(set(names)),name+' duplicate member')
  out={n:z.read(n) for n in names}
 need(out.get('mimetype')==b'application/hwp+zip',name+' mimetype')
 for n,data in out.items():
  if n.endswith(('.xml','.hpf')):ET.fromstring(data)
 return out
def text(parts):return ''.join(e.text or '' for e in ET.fromstring(parts['Contents/section0.xml']).iter(q('t')))
def semantic(name,kind,numbers=None):
 parts=load(name);root=ET.fromstring(parts['Contents/section0.xml']);need(text(parts)=='a😀b',name+' Unicode text')
 run=root.find('.//'+q('run'));tags=[e.tag for e in run];index=tags.index(q('equation') if kind=='equation' else q('switch'));need(run[index-1].tag==q('t') and run[index-1].text=='a' and run[index+1].tag==q('t') and run[index+1].text=='😀b',name+' scalar insertion order')
 if kind=='equation':
  eqs=list(root.iter(q('equation')));need(len(eqs)==1,name+' one equation');eq=eqs[0];need(eq.find(q('script')).text=='a < b & c',name+' exact unescaped script');need(eq.find(q('sz')).attrib=={'width':'6000','widthRelTo':'ABSOLUTE','height':'2000','heightRelTo':'ABSOLUTE','protect':'0'},name+' equation dimensions')
  for key,value in {'version':'Equation Version 60','baseLine':'85','baseUnit':'1000','font':'HYhwpEQ'}.items():need(eq.get(key)==value,name+' '+key)
  need(eq.find(q('pos')).get('treatAsChar')=='1',name+' inline equation');need(not list(root.iter(q('chart'))),name+' no unrelated chart')
 else:
  charts=list(root.iter(q('chart')));need(len(charts)==1,name+' one chart');chart=charts[0];path=chart.get('chartIDRef');need(path in parts,name+' chart reference resolves');need(chart.find(q('sz')).get('width')=='20000' and chart.find(q('sz')).get('height')=='12000',name+' chart dimensions')
  plot=ET.fromstring(parts[path]);ns={'c':c};need(plot.find('.//c:barDir',ns).get('val')=='col',name+' standard vertical bar');series=plot.findall('.//c:barChart/c:ser',ns);need(len(series)==2,name+' series count')
  values=numbers or [['1.50','-2e2'],['0','30']]
  for i,s in enumerate(series):
   need(s.find('c:tx/c:v',ns).text==['S<&','둘'][i],name+' series name/order');need([v.text for v in s.findall('c:cat/c:strLit/c:pt/c:v',ns)]==['한<&','😀'],name+' exact categories');need([v.text for v in s.findall('c:val/c:numLit/c:pt/c:v',ns)]==values[i],name+' exact number lexical/order')
  ole=list(root.iter(q('ole')));need(len(ole)==1,name+' one OLE fallback');items={i.get('id'):i.get('href') for i in ET.fromstring(parts['Contents/content.hpf']).iter('{'+opf+'}item')};need(path in items.values(),name+' OPF chart resource');olepath=items.get(ole[0].get('binaryItemIDRef'));need(olepath in parts,name+' OLE reference resolves');need(int.from_bytes(parts[olepath][:4],'little')==len(parts[olepath])-4,name+' OLE length prefix');need(parts[olepath][4:12]==bytes.fromhex('d0cf11e0a1b11ae1'),name+' CFB magic after length prefix')
  generated=[chart.get('id'),ole[0].get('id'),ole[0].get('instid')];need(len(generated)==len(set(generated)) and all(generated),name+' distinct generated identities');need(not list(root.iter(q('equation'))),name+' no unrelated equation')
 return parts
for prefix in ['equation','chart','core-equation','core-chart']:
 kind=prefix.split('-')[-1];numbers=[['1.5','-200'],['0','30']] if prefix=='core-chart' else None
 before=load(prefix+'-before.hwpx');after=semantic(prefix+'-after.hwpx',kind,numbers)
 need(load(prefix+'-undo.hwpx')==before,prefix+' undo restores every member byte')
 need(load(prefix+'-redo.hwpx')==after,prefix+' redo restores every member byte')
 need(load(prefix+'-reopened.hwpx')==after,prefix+' reopen restores every member byte')
 allowed={'Contents/section0.xml'} if kind=='equation' else {'Contents/section0.xml','Contents/content.hpf','Chart/hwpjs-created-0.xml','BinData/hwpjs-created-chart-0.ole'}
 need({n for n in before.keys()|after.keys() if before.get(n)!=after.get(n)}==allowed,prefix+' only owned package parts change')
for kind in ['equation','chart']:
 need(load(kind+'-rejected.hwpx')==load('seed.hwpx'),kind+' rejection keeps source members')
 semantic(kind+'-preserved-redo.hwpx','equation')
need(load('old879-unchanged.hwpx')==load('seed.hwpx'),'old879 source unchanged')
for name in ['core-old879-unchanged.hwpx','core-explicit-v1-unchanged.hwpx','core-budget-rejected.hwpx']:need(load(name)==load('seed.hwpx'),name+' source unchanged')
need(text(load('core-budget-preserved-redo.hwpx'))=='aZ😀b','budget-rejected creation preserves earlier text redo')
queued=[['999','-200'],['0','30']] if '--expect-mutated' in sys.argv else [['1.5','-200'],['0','30']]
semantic('core-queued-chart.hwpx','chart',queued);semantic('core-collected-equation.hwpx','equation')
print(json.dumps({'independent':'Python stdlib ZIP/XML; CFB fallback magic only','checks':checks,'result':'pass','artifacts':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(p.glob('*.hwpx'))}},indent=2))

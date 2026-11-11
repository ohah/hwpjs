"""Independent stdlib CFB and PAGE_DEF oracle; never imports product readers."""
from pathlib import Path
import json,struct,sys,importlib.util
P=Path(__file__).resolve().parent.parent/'tests/hwp5/paragraph-bullet-definition-oracle.py'
spec=importlib.util.spec_from_file_location('independent_compound',P);cfb=importlib.util.module_from_spec(spec);spec.loader.exec_module(cfb)
require=cfb.require
FIELDS=('width','height','left','right','top','bottom','header','footer','gutter')
def safe(value):
 p=Path(value);require(p.is_absolute() and '..' not in p.parts and not any(x in str(p) for x in ['title-column-roundtrip','hwpers_test4_complex_table','legacy/hwpers']),'Unsafe path');return p
def normalize(rs,values=None):
 out=[];stack=[];page_count=0;owner=None;first=None
 for r in rs:
  while stack and stack[-1]['level']>=r['level']:stack.pop()
  parent=stack[-1] if stack else None
  if r['tag']==66 and r['level']==0 and first is None:first=r
  if r['tag']==71 and r['payload'][:4]==b'dces':
   require(owner is None and parent is first and first is not None,'Ambiguous PAGE_DEF owner');owner=r
  if r['tag']==73:
   require(parent is owner and owner is not None,'Orphan PAGE_DEF');page_count+=1
   require(len(r['payload'])>=40,'Truncated PAGE_DEF')
   scalars=struct.unpack_from('<9I',r['payload']);flags=cfb.U(r['payload'],36)
   require((flags>>1)&3!=3,'Reserved PAGE_DEF binding')
   if values is not None:
    expected=tuple(values[k] if k in ('width','height') else values['margin'][k] for k in FIELDS)
    require(scalars==expected,'Wrong page dimensions or margins')
    low=(1 if values['orientation']=='narrowly' else 0)|({'left_only':0,'left_right':1,'top_bottom':2}[values['gutter_type']]<<1)
    require(flags&7==low,'Wrong page orientation or binding')
   out.append((r['tag'],r['level'],r['raw'][:-len(r['payload'])],flags&~7,r['payload'][40:]))
  elif r['tag']==69:
   require(parent is not None and parent['tag']==66 and len(r['payload'])%36==0,'Unknown line cache payload')
   require(all(cfb.U(r['payload'],i+32)&~0x803f0003==0 for i in range(0,len(r['payload']),36)),'Unknown line cache flags')
   require(values is None,'Stale page line cache')
  elif r['tag']==66:
   require(len(r['payload'])>=18,'Truncated paragraph header')
   payload=bytearray(r['payload'])
   if values is not None:require(struct.unpack_from('<H',payload,16)[0]==0,'Stale line count')
   payload[16:18]=b'\0\0';out.append((r['tag'],r['level'],r['raw'][:-len(r['payload'])],bytes(payload)))
  else:out.append((r['tag'],r['level'],r['raw']))
  stack.append(r)
 require(page_count==1,'Absent or duplicate PAGE_DEF');return out

def verify(plan):
 a=cfb.Compound(safe(plan['before']));b=cfb.Compound(safe(plan['after']));sections=plan['sections'];require(isinstance(sections,list) and sections and len(sections)==len(set(sections)) and all(type(i)is int and i>=0 for i in sections),'Invalid sections')
 targets={'/BodyText/Section'+str(i) for i in sections};require(targets<=a.streams.keys(),'Missing section')
 require(a.metadata==b.metadata,'CFB metadata changed');require(a.streams.keys()==b.streams.keys(),'CFB inventory changed')
 for name in a.streams:
  if name not in targets:require(a.streams[name]==b.streams[name],'Non-target stream changed: '+name)
  else:require(normalize(a.records(name))==normalize(b.records(name),plan['values']),'Unrelated section record changed: '+name)
 return {'verified':True,'sections':sections,'nonTargetStreamsAndMetadata':'exact','storedAxes':{k:plan['values'][k] for k in ['width','height']},'knownLineCachesInvalidated':True}
if __name__=='__main__':
 require(len(sys.argv)==2,'Expected plan path');print(json.dumps(verify(json.loads(safe(sys.argv[1]).read_text()))))

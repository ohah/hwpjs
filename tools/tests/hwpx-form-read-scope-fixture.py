"""Constructor-only HWPX test input / independent ZIP XML observations."""
import sys,io,json,re,zipfile,xml.etree.ElementTree as ET
raw=sys.stdin.buffer.read(8*1024*1024+1)
assert len(raw)<=8*1024*1024
with zipfile.ZipFile(io.BytesIO(raw)) as z:parts={n:z.read(n) for n in z.namelist()}
if sys.argv[1]=='fixture':
 xml=parts['Contents/section0.xml'].decode('utf8');assert xml.count('</hs:sec>')==1
 forms=[]
 for kind,name,attrs,text in [
  ('edit','repeat',"readOnly='0' numOnly='0' multiLine='1'",'first😀é'),
  ('comboBox','repeat',"editEnable='1'",'second😀'),
  ('checkBtn','check',"triState='1' value='UNCHECKED'",None),
  ('radioBtn','radio',"radioGroupName='g' value='CHECKED'",None),
  ('edit','protected',"readOnly='1' numOnly='0' multiLine='1'",'protected😀')]:
  editable='0' if name=='protected' else '1'
  child='' if text is None else '<hp:text>'+text+'</hp:text>'
  forms.append(f"<hp:p id='0' paraPrIDRef='0' styleIDRef='0' pageBreak='0' columnBreak='0' merged='0'><hp:run charPrIDRef='0'><hp:t>BODY</hp:t><hp:{kind} name='{name}' enabled='1' editable='{editable}' {attrs}><hp:formCharPr charPrIDRef='0'/>{child}</hp:{kind}></hp:run></hp:p>")
 parts['Contents/section0.xml']=xml.replace('</hs:sec>',''.join(forms)+'</hs:sec>').encode('utf8')
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_STORED) as z:
  for n,b in parts.items():z.writestr(n,b)
 sys.stdout.buffer.write(out.getvalue())
else:
 assert sys.argv[1]=='inspect'
 root=ET.fromstring(parts['Contents/section0.xml']);forms=[]
 for e in root.iter():
  kind=e.tag.rsplit('}',1)[-1]
  if kind not in ['edit','comboBox','checkBtn','radioBtn']:continue
  text=e.find('{http://www.hancom.co.kr/hwpml/2011/paragraph}text')
  forms.append({'kind':kind,'attributes':e.attrib,'text':None if text is None else ''.join(text.itertext())})
 print(json.dumps({'forms':forms,'bodyText':[''.join(e.itertext()) for e in root.iter() if e.tag=='{http://www.hancom.co.kr/hwpml/2011/paragraph}t']},ensure_ascii=False))

"""Independent XML oracle. Expected selection uses XML row/column addresses, never product DTOs."""
import base64,copy,io,json,sys,zipfile,xml.etree.ElementTree as ET
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
def require(ok,reason):
    if not ok: raise ValueError(reason)
def verify(request):
    before=zipfile.ZipFile(io.BytesIO(base64.b64decode(request['before'])))
    after=zipfile.ZipFile(io.BytesIO(base64.b64decode(request['after'])))
    require(before.namelist()==after.namelist(),'ZIP inventory')
    part=request['part']
    root=ET.fromstring(before.read(part))
    tables=root.findall('.//'+P+'tbl')
    table=tables[request.get('table',0)]
    top,left,bottom,right=request['rectangle']
    expected=request['widths']
    require(len(expected)==right-left,'expected widths')
    rows=table.findall(P+'tr')
    changed=0
    for row in rows:
        for cell in row.findall(P+'tc'):
            address=cell.find(P+'cellAddr')
            y=int(address.attrib['rowAddr']); x=int(address.attrib['colAddr'])
            if not(top<=y<bottom and left<=x<right): continue
            span=cell.find(P+'cellSpan')
            require(span.attrib=={'colSpan':'1','rowSpan':'1'},'span')
            size=cell.find(P+'cellSz')
            value=expected[x-left]
            require(isinstance(value,int) and value>0,'width')
            size.set('width',str(value))
            changed+=1
    require(changed==(bottom-top)*(right-left),'rectangle')
    for name in before.namelist():
        if name==part:
            require(ET.tostring(root)==ET.tostring(ET.fromstring(after.read(name))),'section XML')
        else:
            require(before.read(name)==after.read(name),'unselected ZIP part '+name)
    return {'cells':changed,'unchangedOtherParts':len(before.namelist())-1}
try:
    print(json.dumps(verify(json.load(sys.stdin))))
except Exception as error:
    print(str(error),file=sys.stderr)
    sys.exit(1)

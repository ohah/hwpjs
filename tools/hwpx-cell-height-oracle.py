"""Whole XML/ZIP oracle addressed by source row/column, independent of product DTOs."""
import base64,io,json,sys,zipfile,xml.etree.ElementTree as ET
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
def require(value,reason):
    if not value: raise ValueError(reason)
def verify(request):
    before=zipfile.ZipFile(io.BytesIO(base64.b64decode(request['before'])))
    after=zipfile.ZipFile(io.BytesIO(base64.b64decode(request['after'])))
    require(before.namelist()==after.namelist(),'ZIP inventory')
    part=request['part'];root=ET.fromstring(before.read(part))
    table=root.findall('.//'+P+'tbl')[request.get('table',0)]
    top,left,bottom,right=request['rectangle'];heights=request['heights']
    require(len(heights)==bottom-top and all(isinstance(h,int) and h>0 for h in heights),'height arguments')
    count=0
    old_totals={column:0 for column in range(left,right)}
    for row in table.findall(P+'tr'):
        for cell in row.findall(P+'tc'):
            address=cell.find(P+'cellAddr');y=int(address.attrib['rowAddr']);x=int(address.attrib['colAddr'])
            if not(top<=y<bottom and left<=x<right):continue
            span=cell.find(P+'cellSpan')
            require(span.attrib=={'colSpan':'1','rowSpan':'1'},'row/column span')
            size=cell.find(P+'cellSz')
            old_totals[x]+=int(size.attrib['height'])
            size.set('height',str(heights[y-top]));count+=1
    require(count==(bottom-top)*(right-left),'rectangle coverage')
    require(all(value==sum(heights) for value in old_totals.values()),'band height changed')
    for name in before.namelist():
        if name==part:
            require(ET.tostring(root)==ET.tostring(ET.fromstring(after.read(name))),'section XML')
        else:require(before.read(name)==after.read(name),'other ZIP part '+name)
    return {'cells':count,'unchangedOtherParts':len(before.namelist())-1}
try:print(json.dumps(verify(json.load(sys.stdin))))
except Exception as error:
    print(str(error),file=sys.stderr);sys.exit(1)

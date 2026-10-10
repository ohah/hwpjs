"""Independent same-paragraph XML/ZIP preservation after split and remerge."""
import base64,io,json,runpy,sys,zipfile
from pathlib import Path
import xml.etree.ElementTree as E
h=runpy.run_path(str(Path(__file__).with_name("hwpx-character-format-oracle.py")));P=h["P"]
def require(value,message):
    if not value: raise ValueError(message)
def parse(data):return E.fromstring(data,parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True,insert_pis=True)))
def signature(n):return n.tag,sorted(n.attrib.items()),n.text or "",n.tail or "",tuple(signature(c)for c in n)
payload=json.load(sys.stdin)
p=payload["paragraph"]
require(type(p) is int and p>0,"Invalid paragraph")
with zipfile.ZipFile(io.BytesIO(base64.b64decode(payload["before"],validate=True))) as old,zipfile.ZipFile(io.BytesIO(base64.b64decode(payload["after"],validate=True))) as new:
    require(old.namelist()==new.namelist() and old.comment==new.comment,"ZIP inventory")
    require(len(set(old.namelist()))==len(old.namelist()),"Duplicate ZIP entries")
    require(old.testzip() is None and new.testzip() is None,"ZIP integrity")
    part="Contents/section0.xml";before,after=parse(old.read(part)),parse(new.read(part))
    original=list(before.iter(P+"p"));current=list(after.iter(P+"p"))
    require(len(original)==len(current),"Paragraph count")
    require(p<=len(original),"Paragraph out of range")
    source,target=original[p-1],current[p-1]
    rows,length=h["signature"](source,True,True,True)
    actual,actual_length=h["signature"](target,True,True,True)
    if "--wrong-style" in sys.argv:
        row=list(rows[0]);row[3]=999999;rows[0]=tuple(row)
    require(rows==actual and length==actual_length,"Merged text/style/anchor mismatch")
    require(h["metadata_signature"](source,True,True)==h["metadata_signature"](target,True,True),"Merged metadata position/source mismatch")
    require(source.attrib==target.attrib,"Paragraph attributes")
    require((source.text or "")== (target.text or "") and (source.tail or "")== (target.tail or ""),"Paragraph surrounding text")
    nonrun=lambda n:[signature(c)for c in n if c.tag not in [P+"run",P+"linesegarray"]]
    require(nonrun(source)==nonrun(target),"Paragraph metadata")
    require(target.find(P+"linesegarray") is None,"Stale line geometry")
    source.clear();target.clear()
    require(signature(before)==signature(after),"Parent or non-target XML changed")
    for name in old.namelist():
        if name!=part:require(old.read(name)==new.read(name),"Non-target payload")
        for field in ["date_time","compress_type","external_attr","internal_attr","comment","extra","flag_bits"]:
            require(getattr(old.getinfo(name),field)==getattr(new.getinfo(name),field),"ZIP metadata")

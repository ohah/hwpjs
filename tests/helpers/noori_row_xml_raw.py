"""Raw survivor XML preservation after independent semantic row validation."""
import re
from source_grid_cfb import require

def _attr(raw,tag,name,value):
    pattern=rb'(<hp:'+tag+rb'\b[^>]*\b'+name+rb'=")[^"]*(")'
    result,count=re.subn(pattern,lambda m:m.group(1)+str(value).encode()+m.group(2),raw,count=1)
    require(count==1,'expected owned scalar '+name.decode())
    return result

def verify(before,after,operation):
    pattern=rb'<hp:tbl\b.*?</hp:tbl>'
    original=re.search(pattern,before,re.S);actual=re.search(pattern,after,re.S)
    require(original is not None and actual is not None,'first Noori table')
    raw=original.group();rows=list(re.finditer(rb'<hp:tr\b[^>]*>.*?</hp:tr>',raw,re.S))
    observed=list(re.finditer(rb'<hp:tr\b[^>]*>.*?</hp:tr>',actual.group(),re.S))
    require(len(rows)==3,'original3 rows')
    for left,right in zip(rows,rows[1:]):require(raw[left.end():right.start()]==b'','fixture row gaps')
    values=[x.group() for x in rows]
    def shifted(row,start):
        pattern=rb'(<hp:cellAddr\b[^>]*\browAddr=")([0-9]+)(")'
        return re.sub(pattern,lambda m:m.group(1)+str(start).encode()+m.group(3),row)
    if operation=='insert':
        require(len(observed)==4,'new4 rows')
        # The semantic oracle validates every generated cell/paragraph/style.
        # Only its new authored bytes are taken from the actual result here.
        generated=observed[1].group()
        body=values[0]+generated+shifted(values[1],2)+shifted(values[2],3)
        count,height=4,9018
    else:
        require(len(observed)==2,'remaining2 rows')
        body=values[0]+shifted(values[2],1)
        count,height=2,4575
    expected=raw[:rows[0].start()]+body+raw[rows[-1].end():]
    expected=_attr(expected,b'tbl',b'rowCnt',count)
    expected=_attr(expected,b'sz',b'height',height)
    expected=before[:original.start()]+expected+before[original.end():]
    expected=re.sub(rb'<hp:linesegarray\b[^>]*(?:/>|>.*?</hp:linesegarray>)',b'',expected,flags=re.S)
    require(expected==after,'whole raw XML survivor/source preservation')

"""Pinned observed numeric inputs, Decimal SUM/AVG, full section expectation."""
import base64
from decimal import Decimal
import importlib.util
import io
import json
import hashlib
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as E
import zipfile

def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result

arithmetic=module('hwpx-formula-fixture-oracle')
prefix=module('hwpx-anchor-prefix-oracle')
manual=module('hwpx-manual-result-save-oracle')
P=arithmetic.NS
# Keep each observed source bound to its independent formula denominator.
OBSERVED_SOURCES={
    '85699a2e906525f4118c8dcc3f426f7896ae1dd9fa39b3ee2ef790d6b04abdde':13,
    '1ee1e9045be4334fb9f940d7226cfda2884df9fecac6fa7fca76fb81c08a4a81':3,
}

def require(value,message):
    if not value:raise ValueError(message)

def formatted(value,kind):
    if kind=='%.2f,':return format(value,',.2f')
    require(kind=='%g,','Observed result format')
    text=format(value,'f')
    if '.' in text:text=text.rstrip('0').rstrip('.')
    integer,dot,fraction=text.partition('.')
    require(len(text.replace('-','').replace('.',''))<=6,'Observed g precision')
    return format(int(integer),',')+(dot+fraction if dot else '')

def verify(data):
    before,after=[base64.b64decode(data[k],validate=True) for k in ('before','after')]
    expected_count=OBSERVED_SOURCES.get(hashlib.sha256(before).hexdigest())
    require(expected_count is not None,'Observed numeric source bytes')
    require(type(data['paragraph']) is int and data['paragraph']>0 and data['text']=='1','Explicit numeric replacement')
    require(len(arithmetic.inspect(io.BytesIO(before)))==expected_count,'Observed formula inventory')
    with zipfile.ZipFile(io.BytesIO(before)) as old,zipfile.ZipFile(io.BytesIO(after)) as new:
        require(old.namelist()==new.namelist() and len(set(old.namelist()))==len(old.namelist()) and old.comment==new.comment,'ZIP inventory')
        require(old.testzip() is None and new.testzip() is None,'ZIP CRC')
        for name in old.namelist():
            if name!='Contents/section0.xml':require(old.read(name)==new.read(name),'Non-target payload')
        parse=lambda b:E.fromstring(b,parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True,insert_pis=True)))
        expected,actual=[parse(z.read('Contents/section0.xml')) for z in (old,new)]
        paragraphs=list(expected.iter(P+'p'));require(data['paragraph']<=len(paragraphs),'Paragraph identity')
        paragraph=paragraphs[data['paragraph']-1]
        parents={c:p for p in expected.iter() for c in p}
        def ancestor(node,tag):
            while node.tag!=P+tag:node=parents[node]
            return node
        input_cell=ancestor(paragraph,'tc');table=ancestor(input_cell,'tbl')
        def address(cell):
            a=cell.find(P+'cellAddr');return int(a.get('colAddr')),int(a.get('rowAddr'))
        chosen=address(input_cell)
        texts=paragraph.findall(P+'run/'+P+'t');require(len(texts)==1 and not len(texts[0]),'Observed numeric input leaf')
        require(Decimal((texts[0].text or '').replace(',',''))!=1,'Non-noop numeric replacement')
        texts[0].text='1'
        cells={address(c):c for row in table.findall(P+'tr') for c in row.findall(P+'tc')}
        changed=0
        for ordinal,field in enumerate(n for n in expected.iter(P+'fieldBegin') if n.get('type')=='FORMULA'):
            if ancestor(field,'tbl') is not table:continue
            params={n.get('name'):n for n in field.find(P+'parameters')}
            expression=params['Formula'].text;match=re.fullmatch(r'=(SUM|AVG)\(([^():]+):([^():]+)\)',expression)
            require(match is not None,'Observed range formula')
            current=address(ancestor(field,'tc'));first,last=[arithmetic.reference(match[i],current) for i in (2,3)]
            points=[(c,r) for r in range(first[1],last[1]+1) for c in range(first[0],last[0]+1)]
            if chosen not in points:continue
            values=[]
            for point in points:
                leaves=cells[point].findall(P+'subList/'+P+'p/'+P+'run/'+P+'t')
                require(len(leaves)==1 and not len(leaves[0]),'Observed scalar cell')
                values.append(Decimal((leaves[0].text or '').strip().replace(',','')))
            total=sum(values,Decimal(0))
            if match[1]=='AVG':total/=len(values)
            value=formatted(total,params['ResultFormat'].text)
            require(params['Command'].text==expression+'??'+params['ResultFormat'].text+';;'+params['LastResult'].text,'Observed command cache')
            params['LastResult'].text=value;params['Command'].text=expression+'??'+params['ResultFormat'].text+';;'+value
            field.set('dirty','1');manual.selected(expected,ordinal)[1].text=value;changed+=1
        require(changed==1,'One observed dependent result')
        require(prefix.signature(expected)==prefix.signature(actual),'Complete numeric input XML mismatch')
        require(len(arithmetic.inspect(io.BytesIO(after)))==expected_count,'Updated arithmetic inventory')

def self_test(data):
    raw=base64.b64decode(data['after'],validate=True)
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data['before'],validate=True))) as original:
        old_root=E.fromstring(original.read('Contents/section0.xml'))
    old_fields=[n for n in old_root.iter(P+'fieldBegin') if n.get('type')=='FORMULA']
    def mutate(kind):
        output=io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(raw)) as source,zipfile.ZipFile(output,'w') as target:
            target.comment=source.comment+(b'bad' if kind=='zip_comment' else b'')
            for entry in source.infolist():
                payload=source.read(entry.filename)
                if entry.filename=='Contents/section0.xml':
                    root=E.fromstring(payload,parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True,insert_pis=True)))
                    paragraph=list(root.iter(P+'p'))[data['paragraph']-1]
                    leaf=paragraph.findall(P+'run/'+P+'t')[0]
                    fields=[n for n in root.iter(P+'fieldBegin') if n.get('type')=='FORMULA']
                    changed=[i for i,f in enumerate(fields) if f.find(P+'parameters/'+P+"stringParam[@name='LastResult']").text!=old_fields[i].find(P+'parameters/'+P+"stringParam[@name='LastResult']").text]
                    require(len(changed)==1,'Self-test dependent identity')
                    ordinal=changed[0];field=fields[ordinal];params={n.get('name'):n for n in field.find(P+'parameters')}
                    if kind=='input':leaf.text='2'
                    elif kind=='result':manual.selected(root,ordinal)[1].text+='!'
                    elif kind=='cache':params['LastResult'].text+='1'
                    elif kind=='command':params['Command'].text+='bad'
                    elif kind=='dirty':field.set('dirty','0')
                    elif kind=='other_text':
                        other=next(n for n in root.iter(P+'t') if n is not leaf and n is not manual.selected(root,ordinal)[1])
                        other.text=(other.text or '')+'!'
                    payload=E.tostring(root)
                elif kind=='other_payload' and entry.filename=='Contents/header.xml':payload+=b'bad'
                target.writestr(entry,payload)
        return {**data,'after':base64.b64encode(output.getvalue()).decode(),'selfTest':False}
    verify(mutate(None))
    count=0
    for kind in ('input','result','cache','command','dirty','other_text','other_payload','zip_comment'):
        try:verify(mutate(kind))
        except ValueError:count+=1
        else:raise ValueError('Numeric oracle accepted mutation: '+kind)
    require(count==8,'Missing numeric negative coverage')

if __name__=='__main__':
    data=json.load(sys.stdin);verify(data)
    if data.get('selfTest'):self_test(data)
    print('Independent numeric input and all observed formula caches verified'+('; 8 mutations rejected' if data.get('selfTest') else ''))

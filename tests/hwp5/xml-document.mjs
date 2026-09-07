import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {xmlEncode} from './xml-tag-evidence.mjs';
import {xmlDocumentEvidence} from './xml-document-evidence.mjs';
import {historyXmlPayloads} from './history-xml-source.mjs';
export function xmlDocumentPrefix(raw,e,caps={}){
  const values=[caps.bytes??raw.length,caps.markup??16777216,caps.text??16777216,caps.elements??1000000,caps.depth??256,caps.events??1000000,caps.attributes??1000000,caps.references??1000000,caps.tag??65536,caps.name??4096,caps.declaration??4096];
  const head=Buffer.alloc(45);head[0]=e+1;values.forEach((v,i)=>head.writeUInt32LE(v,1+4*i));return Buffer.concat([head,raw]);
}
export function xmlDocumentEdges(call,cfb){
  let accepted=0,rejected=0;const actual=[];
  const good=(text,e)=>{
    const raw=xmlEncode(text,e),want=xmlDocumentEvidence(text,raw.length);
    assert.deepEqual(call(123,xmlDocumentPrefix(raw,e)),want.wire);accepted++;
    const exact={elements:want.elements,depth:want.depth,events:want.events,attributes:want.attributes,references:want.references};
    assert.deepEqual(call(123,xmlDocumentPrefix(raw,e,exact),want.characters),want.wire);
    for(const key of ['elements','depth','events','attributes','references'])if(exact[key]){assert.throws(()=>call(123,xmlDocumentPrefix(raw,e,{...exact,[key]:exact[key]-1})),/LimitExceeded/);rejected++;}
    assert.throws(()=>call(123,xmlDocumentPrefix(raw,e),want.characters-1),/LimitExceeded/);rejected++;
    return want;
  };
  for(let e=0;e<3;e++){
    for(const text of ['<r/>',"<?xml version='1.0'?><!--before--><?p?><r a='&#13;'>A&#13;<e/><![CDATA[<x>&unknown;\r\n]]><!-- c --><?q data?></r> \n<!--after-->",'<r>]]&gt;</r>','<r>&#93;]></r>','<r>]&#93;></r>','<!-- <!DOCTYPE r> --><r/>','<r><![CDATA[<!DOCTYPE r>&unknown;]]></r>','<r><?xml-stylesheet?></r>','<r><?p ??></r>','<r><?p?a?></r>'.replace('?p?a','?p ?a'),'<한글><😀 a="\r\n&#13;"/></한글>','<p:r p:a="1"/>'])good(text,e);
    for(const text of ['', ' ', '<!--only-->','<r>','</r>','<r></R>','<r><a></r></a>','<r/><s/>','x<r/>','<r/>x','&#32;<r/>','<![CDATA[]]><r/>','<r/><![CDATA[]]>','<r>]]></r>','<r>&unknown;</r>',"<r a='&unknown;'/>",'<!DOCTYPE r><r/>','<r><?XML?></r>'," <?xml version='1.0'?><r/>",'<r><!--a--b--></r>','<r><!--a---></r>','<r><![CDATA[unterminated</r>','<r><?p unterminated</r>','<r/>\0','<?p??><r/>','<?p?a?><r/>']){assert.throws(()=>call(123,xmlDocumentPrefix(xmlEncode(text,e),e)));rejected++;}
    const raw=xmlEncode('<r><a x="&amp;"/></r>',e);
    for(let end=0;end<raw.length;end++){assert.throws(()=>call(123,xmlDocumentPrefix(raw.subarray(0,end),e)));rejected++;}
    const text='<r>A&#13;</r>';
    assert.deepEqual(call(123,xmlDocumentPrefix(xmlEncode(text,e),e,{text:xmlEncode('A&#13;',e).length})),xmlDocumentEvidence(text,xmlEncode(text,e).length).wire);
    assert.throws(()=>call(123,xmlDocumentPrefix(xmlEncode(text,e),e,{text:xmlEncode('A&#13;',e).length-1})),/LimitExceeded/);rejected++;
  }
  for(let end=0;end<45;end++){assert.throws(()=>call(123,Buffer.alloc(end)),/UnexpectedEnd/);rejected++;}
  cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/basic/treatise sample.hwp',import.meta.url)),{strict:true});
  for(const p of historyXmlPayloads(cfb).payloads){const text=new TextDecoder('utf-16le',{fatal:true,ignoreBOM:true}).decode(p.bytes),result=good(text,1);actual.push({kind:p.kind,index:p.index,bytes:p.bytes.length,elements:result.elements,attributes:result.attributes,textScalars:result.scalars,comments:result.comments,pi:result.pi,depth:result.depth});}
  good('<recovered/>',0);
  return {accepted,rejected,actual,namespacesValidated:false,dtdSupported:false};
}

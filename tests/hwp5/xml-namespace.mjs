import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {xmlEncode} from './xml-tag-evidence.mjs';
import {xmlDocumentPrefix} from './xml-document.mjs';
import {xmlNamespaceEvidence} from './xml-namespace-evidence.mjs';
import {historyXmlPayloads} from './history-xml-source.mjs';
export function xmlNamespacePrefix(raw,e,{bindings=65536,uriBytes=16777216}={}){
  const base=xmlDocumentPrefix(raw,e),extra=Buffer.alloc(8);extra.writeUInt32LE(bindings,0);extra.writeUInt32LE(uriBytes,4);return Buffer.concat([base.subarray(0,45),extra,raw]);
}
export const namespaceGood=['<r/>',"<p:r p:a='1' xmlns:p='urn:a'/>","<r xml:lang='ko'/>",'<xml:r/>','<xmlns/>',"<r xmlns:xml='http://www.w3.org/XML/1998/namespace'/>","<r xmlns:XMLfoo='urn:a' XMLfoo:a='1'/>","<r xmlns:XML='urn:a' XML:a='1'/>","<r xmlns='urn:a' xmlns:p='urn:a' a='1' p:a='2'/>","<r xmlns:p='urn:A' xmlns:q='urn:a' p:a='1' q:a='2'/>","<r xmlns:p='urn:%61' xmlns:q='urn:a' p:a='1' q:a='2'/>","<r xmlns:p='urn:a'><a xmlns:p='urn:b'><p:b/></a><p:c/></r>","<r xmlns='urn:a'><a xmlns=''/><b/></r>","<한:문서 xmlns:한='urn:한글' 한:속성='1'/>","<😀:r xmlns:😀='urn:a'/>","<r xmlns:p='urn:&#x61;' p:a='1'/>","<r><?xml-stylesheet?></r>"];
export const namespaceBad=['<p:r/>',"<r p:a='1'/>",'<xmlns:r/>',"<r xmlns:xmlns='urn:a'/>","<r xmlns:xml='urn:a'/>","<r xmlns:xml=''/>","<r xmlns:p=''/>","<r xmlns='http://www.w3.org/XML/1998/namespace'/>","<r xmlns:p='http://www.w3.org/XML/1998/namespace'/>","<r xmlns='http://www.w3.org/2000/xmlns/'/>","<r xmlns:p='http://www.w3.org/2000/xmlns/'/>","<r xmlns:p='urn:a' xmlns:q='urn:a' p:x='1' q:x='2'/>","<r xmlns:p='urn:&#97;' xmlns:q='urn:a' p:x='1' q:x='2'/>","<r><a xmlns:p='urn:a'/><p:b/></r>","<r xmlns:p='urn:a' xmlns:q='urn:a'><a xmlns:p='urn:b' p:x='1' q:x='2'/><b p:x='1' q:x='2'/></r>","<p:r xmlns:p='urn:a' xmlns:q='urn:a'></q:r>",'<:r/>','<r:/>','<p:r:s/>',"<r :a='1'/>","<r xmlns:p:q='urn:a'/>",'<?p:q?><r/>','<r><?p:q data?></r>'];
export function xmlNamespaceEdges(call,cfb){
  let accepted=0,rejected=0,actual=0;
  const good=(source,e)=>{
    const raw=xmlEncode(source,e),want=xmlNamespaceEvidence(source,raw.length);
    assert.deepEqual(call(124,xmlNamespacePrefix(raw,e)),want.wire);accepted++;
    const caps={bindings:want.maxBindings,uriBytes:want.maxUriBytes};
    assert.deepEqual(call(124,xmlNamespacePrefix(raw,e,caps)),want.wire);
    for(const key of ['bindings','uriBytes'])if(caps[key]){assert.throws(()=>call(124,xmlNamespacePrefix(raw,e,{...caps,[key]:caps[key]-1})),/LimitExceeded/);rejected++;}
  };
  const bad=(source,e)=>{assert.throws(()=>xmlNamespaceEvidence(source,xmlEncode(source,e).length));assert.throws(()=>call(124,xmlNamespacePrefix(xmlEncode(source,e),e)));rejected++;};
  for(let e=0;e<3;e++){
    namespaceGood.forEach(s=>good(s,e));namespaceBad.forEach(s=>bad(s,e));
    for(const prefix of ['p','한','😀'])for(const local of ['a','한','😀'])for(const uri of ['urn:a','urn:&#97;','urn:a&amp;b']){
      good(`<${prefix}:r ${prefix}:${local}='1' xmlns:${prefix}='${uri}'/>`,e);
      bad(`<r xmlns:${prefix}='${uri}' xmlns:q='${uri}' ${prefix}:${local}='1' q:${local}='2'/>`,e);
    }
    const raw=xmlEncode("<p:r xmlns:p='urn:a'><p:a/></p:r>",e);
    for(let end=0;end<raw.length;end++){assert.throws(()=>call(124,xmlNamespacePrefix(raw.subarray(0,end),e)));rejected++;}
  }
  for(let end=0;end<53;end++){assert.throws(()=>call(124,Buffer.alloc(end)),/UnexpectedEnd/);rejected++;}
  cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/basic/treatise sample.hwp',import.meta.url)),{strict:true});
  for(const p of historyXmlPayloads(cfb).payloads){good(p.bytes.toString('utf16le'),1);actual++;}
  good('<recovered/>',0);
  return {accepted,rejected,actual,namespacesValidated:true,uriSyntaxValidated:false};
}

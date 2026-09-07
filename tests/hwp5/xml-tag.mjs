import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {xmlEncode,xmlTagEvidence} from './xml-tag-evidence.mjs';
import {historyXmlPayloads} from './history-xml-source.mjs';
function prefix(raw,e,caps=[65536,4096,4096,65536,4096,4096]){const b=Buffer.alloc(25);b[0]=e;caps.forEach((v,i)=>b.writeUInt32LE(v,1+i*4));return Buffer.concat([b,raw]);}
export function xmlTagEdges(call,cfb){
  let accepted=0,rejected=0;const actual=[];
  const good=(text,e)=>{
    const expected=xmlTagEvidence(text,e),raw=xmlEncode(text,e),caps=[expected.bytes,expected.maxNameBytes,expected.attributes,expected.references,4096,4096];
    assert.deepEqual(call(122,prefix(raw,e,caps)),expected.wire);accepted++;
    assert.deepEqual(call(122,prefix(raw,e,caps),expected.characters),xmlTagEvidence(text,e,expected.characters).wire);
    for(let i=0;i<4;i++)if(caps[i]>0){const bad=[...caps];bad[i]--;assert.throws(()=>call(122,prefix(raw,e,bad)),/LimitExceeded/);rejected++;}
    assert.throws(()=>call(122,prefix(raw,e,caps),expected.characters-1),/LimitExceeded/);rejected++;
    return expected;
  };
  for(let e=0;e<3;e++){
    for(const quote of ['"',"'"])for(let cp=0;cp<256;cp++){
      const c=String.fromCodePoint(cp),text=`<x a=${quote}${c}${quote}/>`;
      if((cp>=32||cp===9||cp===10||cp===13)&&c!==quote&&c!=='<'&&c!=='&')good(text,e);
      else{assert.throws(()=>call(122,prefix(xmlEncode(text,e),e)));rejected++;}
    }
    good("<x a='\u0085\u2028'/>",e);
    assert.throws(()=>call(122,prefix(xmlEncode("<x a='1'\u00a0b='2'>",e),e)),/InvalidXmlTag/);rejected++;
    for(const text of ['<x>','</x >','<x/>tail','<x/>\0',"<x a='' b='> /' A='1'/>",'<한글:😀 a=" \t\r\n&#9;&#10;&#13;&lt;&amp;&quot;&apos; " b="&custom;"/>',"<x p:x='1' q:x='2'/>","<x é='1' e\u0301='2'/>"]){good(text,e);}
    for(const text of ['','<','<>','< x>','<x','<x / >','</x/>',"</x a='1'>",'<x a=1>',"<x a='1'b='2'>","<x a='1' a='2'>","<x a='<'/>","<x a='&amp'/>","<x a='&#0;'/>","<x a='unterminated",'<?xml?>','<!--x-->']){assert.throws(()=>call(122,prefix(xmlEncode(text,e),e)));rejected++;}
    const raw=xmlEncode("<x a='&#13;&quot;'/>",e);
    for(let end=0;end<raw.length;end++){assert.throws(()=>call(122,prefix(raw.subarray(0,end),e)));rejected++;}
    for(const [refCap,nameCap] of [[4,4096],[4096,2]]){assert.throws(()=>call(122,prefix(xmlEncode("<x a='&amp;'/>",e),e,[65536,4096,4096,65536,refCap,nameCap])),/LimitExceeded/);rejected++;}
  }
  for(let end=0;end<25;end++){assert.throws(()=>call(122,Buffer.alloc(end)),/UnexpectedEnd/);rejected++;}
  cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/basic/treatise sample.hwp',import.meta.url)),{strict:true});
  for(const p of historyXmlPayloads(cfb).payloads){const text=new TextDecoder('utf-16le',{fatal:true,ignoreBOM:true}).decode(p.bytes);const result=good(text,1);actual.push({kind:p.kind,index:p.index,rootTagBytes:result.bytes,attributes:result.attributes});}
  good('<recovered/>',0);
  return {accepted,rejected,actual,wholeXmlDocumentValidated:false};
}

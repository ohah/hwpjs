import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {historyXmlPayloads} from './history-xml-source.mjs';
import {xmlInputExpected} from './xml-input.mjs';
const signatures=[Buffer.from([239,187,191]),Buffer.from([255,254]),Buffer.from([254,255])];
const encode=(text,e)=>e===0?Buffer.from(text):e===1?Buffer.from(text,'utf16le'):Buffer.from(text,'utf16le').swap16();
const wire=(raw,external=0,maxDecl=4096,maxBytes=raw.length)=>{const b=Buffer.alloc(9);b[0]=external;b.writeUInt32LE(maxBytes,1);b.writeUInt32LE(maxDecl,5);return Buffer.concat([b,raw]);};
export function xmlPrologEdges(call,cfb){
  let accepted=0,rejected=0;
  const good=(raw,e,bom,decl,body,external=0)=>{
    // Independent anchored document XMLDecl grammar, never parsed from product output.
    const match=decl&&/^<\?xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(['"])(1\.\d+)\1(?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(['"])([A-Za-z][A-Za-z0-9._-]*)\3)?(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(['"])(yes|no)\5)?[ \t\r\n]*\?>$/.exec(decl);
    if(decl)assert.ok(match);
    const declBytes=encode(decl,e).length,start=bom+declBytes;
    const header=Buffer.alloc(28);[e,bom,declBytes,match?match[2].length:0,match?.[4]?.length??0,match?.[6]==='yes'?2:match?.[6]==='no'?1:0,start].forEach((v,i)=>header.writeUInt32LE(v,i*4));
    const digest=xmlInputExpected(encode(body,e),e);digest.writeUInt32LE(raw.length,8);
    const want=Buffer.concat([header,digest]);assert.deepEqual(call(119,wire(raw,external)),want);accepted++;
    const count=[...decl.replace(/\r\n?/g,'\n')].length+digest.readUInt32LE(0);
    assert.deepEqual(call(119,wire(raw,external,declBytes),count),want);
    if(count){assert.throws(()=>call(119,wire(raw,external),count-1),/LimitExceeded/);rejected++;}
    if(declBytes){assert.throws(()=>call(119,wire(raw,external,declBytes-1)),/LimitExceeded/);rejected++;}
    if(raw.length){assert.throws(()=>call(119,wire(raw,external,4096,raw.length-1)),/LimitExceeded/);rejected++;}
  };
  for(let e=0;e<3;e++)for(const bom of [false,true])for(const version of ['1.0','1.123','1.00'])for(const quote of ['"',"'"]){
    const decl=`<?xml\r\nversion = ${quote}${version}${quote} encoding=${quote}${['uTf-8','UTF-16LE','utf-16be'][e]}${quote} standalone='yes' ?>`,body='<한글>😀\r\n</한글>';
    const sig=bom?signatures[e]:Buffer.alloc(0),raw=Buffer.concat([sig,encode(decl+body,e)]);
    good(raw,e,sig.length,decl,body);good(raw,e,sig.length,decl,body,e+1);
  }
  for(let e=0;e<3;e++)good(encode('<x/>',e),e,0,'','<x/>',e+1);
  good(Buffer.alloc(0),0,0,'',''); // Prefix/character layer does not require a root element.
  for(const source of ["<?xml version='1.0'encoding='UTF-8'?>","<?xml encoding='UTF-8'?>","<?xml version='1.0' standalone='no' encoding='UTF-8'?>","<?xml version='1.0' version='1.0'?>","<?xml version='1.0' standalone='Yes'?>","<?xml version='1.'?>","<?xml version='1.0' encoding='1a'?>","<?xml version='1.0' encoding='UTF-16'?>","<?xml version='1.0' encoding='ISO-8859-1'?>"]){
    assert.throws(()=>call(119,wire(Buffer.from(source))));rejected++;
  }
  const decl="<?xml version='1.0'?>";
  for(let end=6;end<decl.length;end++){assert.throws(()=>call(119,wire(Buffer.from(decl.slice(0,end)))));rejected++;}
  for(let e=1;e<3;e++){
    const raw=encode(decl,e);
    for(let end=12;end<raw.length;end++){assert.throws(()=>call(119,wire(raw.subarray(0,end),e+1)));rejected++;}
  }
  for(let end=0;end<9;end++){assert.throws(()=>call(119,Buffer.alloc(end)),/UnexpectedEnd/);rejected++;}
  assert.throws(()=>call(119,wire(Buffer.alloc(0),255)),/InvalidXmlEncoding/);rejected++;
  assert.throws(()=>call(119,wire(Buffer.from("<?xml version\u00a0='1.0'?>"))),/InvalidXmlDeclaration/);rejected++;
  assert.deepEqual(call(119,wire(Buffer.from('<x/>'),0,0xffffffff,0xffffffff),0xffffffff),call(119,wire(Buffer.from('<x/>'))));
  for(let e=0;e<3;e++)for(let other=0;other<3;other++)if(e!==other){assert.throws(()=>call(119,wire(Buffer.concat([signatures[e],encode('<x/>',e)]),other+1)),/XmlEncodingMismatch/);rejected++;}
  for(const bytes of [Buffer.from([0,0,254,255]),Buffer.from([255,254,0,0]),Buffer.from([76,111,167,148])]){assert.throws(()=>call(119,wire(bytes)),/UnsupportedXmlEncoding/);rejected++;}
  const actual=[];
  cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/basic/treatise sample.hwp',import.meta.url)),{strict:true});
  for(const p of historyXmlPayloads(cfb).payloads){
    const text=new TextDecoder('utf-16le',{fatal:true,ignoreBOM:true}).decode(p.bytes);
    assert.ok(!text.startsWith('<?xml')&&!text.startsWith('\ufeff'));
    good(p.bytes,1,0,'',text,2);actual.push({kind:p.kind,index:p.index,bytes:p.bytes.length,declaration:false});
  }
  good(Buffer.from('<recovered/>'),0,0,'','<recovered/>');
  return {accepted,rejected,actual,xmlGrammarValidated:false};
}

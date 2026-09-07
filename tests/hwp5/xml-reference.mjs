import assert from 'node:assert/strict';
const start=':A-Z_a-z\\u00c0-\\u00d6\\u00d8-\\u00f6\\u00f8-\\u02ff\\u0370-\\u037d\\u037f-\\u1fff\\u200c-\\u200d\\u2070-\\u218f\\u2c00-\\u2fef\\u3001-\\ud7ff\\uf900-\\ufdcf\\ufdf0-\\ufffd\\u{10000}-\\u{effff}';
const more='\\-.0-9\\u00b7\\u0300-\\u036f\\u203f-\\u2040';
const first=new RegExp(`^[${start}]$`,'u'),continuing=new RegExp(`^[${start}${more}]$`,'u'),name=new RegExp(`^[${start}][${start}${more}]*`,'u');
const encode=(text,e)=>e===0?Buffer.from(text):e===1?Buffer.from(text,'utf16le'):Buffer.from(text,'utf16le').swap16();
function wire(raw,e,ref,cap=4096,nameCap=4096){const out=Buffer.alloc(10);out[0]=ref?1:0;out[1]=e;out.writeUInt32LE(cap,2);out.writeUInt32LE(nameCap,6);return Buffer.concat([out,raw]);}
export function xmlReferenceEdges(call){
  let classes=0,accepted=0,rejected=0,numericAccepted=0,numericRejected=0;
  const point=Buffer.alloc(4);
  for(let c=0;c<=0x110000;c++){
    point.writeUInt32LE(c);const text=c<=0x10ffff?String.fromCodePoint(c):'';
    assert.equal(call(120,point).readUInt32LE(0),(first.test(text)?1:0)|(continuing.test(text)?2:0));classes++;
  }
  for(let c=0;c<=0xffff;c++)for(const base of [10,16]){
    const raw=Buffer.from(base===10?`&#${c};`:`&#x${c.toString(16)};`);
    const valid=(c>=32||c===9||c===10||c===13)&&!(c>=0xd800&&c<=0xdfff)&&c<0xfffe;
    if(!valid){assert.throws(()=>call(121,wire(raw,0,true),512));numericRejected++;continue;}
    const out=call(121,wire(raw,0,true),512);
    assert.deepEqual([0,4,8,12].map(at=>out.readUInt32LE(at)),[1,c,raw.length,512-raw.length]);assert.deepEqual(out.subarray(16),raw);numericAccepted++;
  }
  const good=(source,e,ref)=>{
    let token,kind=0,value=0;
    if(!ref)token=name.exec(source)?.[0];
    else if(/^&#(?:[0-9]+|x[0-9a-fA-F]+);/.test(source)){
      token=source.slice(0,source.indexOf(';')+1);kind=1;value=Number(BigInt(token[2]==='x'?'0x'+token.slice(3,-1):token.slice(2,-1)));
    }else{const n=name.exec(source.slice(1))?.[0];assert.ok(n&&source[1+n.length]===';');token='&'+n+';';const predefined={lt:60,gt:62,amp:38,apos:39,quot:34};kind=Object.hasOwn(predefined,n)?2:3;value=kind===2?predefined[n]:0;}
    assert.ok(token);const raw=encode(source,e),consumed=encode(token,e),limit=1024;
    const expected=Buffer.alloc(16);[kind,value,consumed.length,limit-[...token].length].forEach((v,i)=>expected.writeUInt32LE(v,i*4));
    const want=Buffer.concat([expected,consumed]);assert.deepEqual(call(121,wire(raw,e,ref,consumed.length),limit),want);accepted++;
    assert.throws(()=>call(121,wire(raw,e,ref,consumed.length-1),limit),/LimitExceeded/);rejected++;
  };
  for(let e=0;e<3;e++){
    for(const s of ['한글:😀-1\u0300;tail',':a:b','a.b_0','\u{effff}','A\u00b7'])good(s,e,false);
    for(const s of ['&#13;','&#xD;','&#00065;','&#x10FFFF;','&#xFDD0;','&lt;','&gt;','&amp;','&apos;','&quot;','&AMP;','&한글;','&a:b;'])good(s,e,true);
    good('&#'+'0'.repeat(128)+'65;',e,true);
    for(const s of ['','&','&#','&#;','&#x;','&#X41;','&#-1;','&#1A;','&amp','&;','&1n;','&amp x;','&#0;','&#xD800;','&#xFFFE;','&#1114112;','&#999999999999999999999;']){assert.throws(()=>call(121,wire(encode(s,e),e,true)));rejected++;}
    const raw=encode('&amp;',e);
    for(let end=0;end<raw.length;end++){assert.throws(()=>call(121,wire(raw.subarray(0,end),e,true)));rejected++;}
    assert.throws(()=>call(121,wire(raw,e,true),4),/LimitExceeded/);rejected++;
    assert.throws(()=>call(121,wire(raw,e,true,4096,encode('am',e).length)),/LimitExceeded/);rejected++;
    for(const [s,ref] of [['&#'+'0'.repeat(4096)+'9;',true],['&'+'a'.repeat(4096)+';',true],['a'.repeat(4097),false]]){assert.throws(()=>call(121,wire(encode(s,e),e,ref)),/LimitExceeded/);rejected++;}
  }
  point.writeUInt32LE(0xffffffff);assert.equal(call(120,point).readUInt32LE(0),0);classes++;
  for(let end=0;end<10;end++){assert.throws(()=>call(121,Buffer.alloc(end)),/UnexpectedEnd/);rejected++;}
  good('&amp;',0,true);
  return {classes,accepted,rejected,numericAccepted,numericRejected,unresolvedEntitiesAreNotValidated:true};
}

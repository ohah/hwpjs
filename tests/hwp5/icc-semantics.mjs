import assert from 'node:assert/strict';
import {identifiersWire,valuesWire,v2ValuesWire} from './icc-semantics-evidence.mjs';
export function semanticHeader(major=4){
  const b=Buffer.alloc(128);b[8]=major;b[9]=0x40;b.write('mntr',12);b.write('RGB ',16);b.write('XYZ ',20);b.write('acsp',36);
  [2026,9,7,23,59,59].forEach((v,i)=>b.writeUInt16BE(v,24+2*i));[63190,65536,54061].forEach((v,i)=>b.writeInt32BE(v,68+4*i));return b;
}
export function iccSemanticEdges(call){
  let accepted=0,rejected=0,identifierMutations=0,valueMutations=0,dateCases=0,v2Mutations=0;
  function compare(mode,b,oracle,limit=b.length){let expected;try{expected=oracle(b,limit);}catch(e){if(!(e instanceof assert.AssertionError))throw e;}
    if(expected){assert.deepEqual(call(mode,b,limit),expected);accepted++;return expected;}
    assert.throws(()=>call(mode,b,limit),e=>!(e instanceof WebAssembly.RuntimeError));rejected++;
  }
  function ids(b,edition,limit=b.length+4){const p=Buffer.alloc(4);p.writeUInt32LE(edition);return compare(146,Buffer.concat([p,b]),identifiersWire,limit);}
  const val=(b,limit=b.length)=>compare(147,b,valuesWire,limit),base=semanticHeader();
  for(const major of [2,4]){const h=semanticHeader(major),edition=major===2?0:1;assert.ok(ids(h,edition));ids(h,1-edition);
    for(let at=0;at<128;at++)for(let v=0;v<256;v++){const b=Buffer.from(h);b[at]=v;ids(b,edition);identifierMutations++;}
    for(const kind of ['scnr','mntr','prtr','link','spac','abst','nmcl'])for(const pcs of ['XYZ ','Lab ','CMYK','GRAY','FCLR','nope']){const b=Buffer.from(h);b.write(kind,12);b.write(pcs,20);ids(b,edition);}
    for(const p of ['TGNT','MSFT','sgI ']){const b=Buffer.from(h);b.write(p,40);ids(b,edition);}
  }
  for(let at=0;at<128;at++)for(let v=0;v<256;v++){const b=Buffer.from(base);b[at]=v;val(b);valueMutations++;}
  for(let field=0;field<6;field++)for(let n=0;n<65536;n++){const b=Buffer.from(base);b.writeUInt16BE(n,24+2*field);val(b);dateCases++;}
  for(let axis=0;axis<3;axis++)for(let delta=-12;delta<=12;delta++){const b=Buffer.from(base);b.writeInt32BE([63190,65536,54061][axis]+delta,68+4*axis);val(b);}
  for(let size=0;size<128;size++){val(base.subarray(0,size));ids(base.subarray(0,size),1);}val(Buffer.concat([base,Buffer.from([0])]));ids(Buffer.concat([base,Buffer.from([0])]),1);
  ids(base,1,131);val(base,127);for(const policy of [2,255,0xffffffff])ids(base,policy);
  for(let n=0;n<4;n++)compare(146,Buffer.alloc(n),identifiersWire);
  const all=Buffer.from(base);all.writeUInt32BE(0xffffffff,44);all.writeBigUInt64BE(0xffffffff0000000fn,56);all.writeUInt32BE(3,64);assert.ok(val(all));
  function v2(b,policy,limit=b.length+4){const p=Buffer.alloc(4);p.writeUInt32LE(policy);return compare(148,Buffer.concat([p,b]),v2ValuesWire,limit);}
  const old=semanticHeader(2);
  for(const policy of [0,1]){
    assert.ok(v2(old,policy));
    for(let at=0;at<128;at++)for(let n=0;n<256;n++){const b=Buffer.from(old);b[at]=n;v2(b,policy);v2Mutations++;}
    for(let axis=0;axis<3;axis++)for(let delta=-16;delta<=16;delta++){const b=Buffer.from(old);b.writeInt32BE([63190,65536,54061][axis]+delta,68+axis*4);v2(b,policy);}
    const nonzero=Buffer.from(old);nonzero.fill(255,84);nonzero.writeBigUInt64BE(0xffffffffffffffffn,56);nonzero.writeUInt32BE(0xffff0003,64);assert.ok(v2(nonzero,policy));
    for(let size=0;size<128;size++)v2(old.subarray(0,size),policy);v2(Buffer.concat([old,Buffer.from([0])]),policy);v2(old,policy,131);v2(base,policy);
  }
  for(const policy of [2,255,0xffffffff])v2(old,policy);for(let size=0;size<4;size++)compare(148,Buffer.alloc(size),v2ValuesWire);
  assert.ok(v2(old,0));assert.ok(ids(base,1));assert.ok(val(base));return {accepted,rejected,identifierMutations,valueMutations,dateCases,v2Mutations};
}

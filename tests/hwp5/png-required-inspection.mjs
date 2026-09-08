import assert from 'node:assert/strict';
import {profilePng,profilePayload} from './png-profile.mjs';
export function requiredProfile(cls,data,pcs,names,major=4) {
  const end=132+12*names.length,b=Buffer.alloc(end+8*names.length);
  b.writeUInt32BE(b.length);b[8]=major;b.write(cls,12);b.write(data,16);b.write(pcs,20);b.write('acsp',36);b.writeUInt32BE(names.length,128);
  names.forEach((name,i)=>{const at=132+12*i;b.write(name,at);b.writeUInt32BE(end+8*i,at+4);b.writeUInt32BE(8,at+8);b.write('data',end+8*i);});
  return b;
}
export const requiredPngInput=(raw,model,white=0,edition=4,selected=1)=>Buffer.concat([Buffer.from([selected,edition,model,white]),profilePng(raw.toString('ascii',16,20)==='GRAY'?0:2,[profilePayload(raw)])]);
export function pngRequiredEdges(call) {
  let comparisons=0,rejected=0;
  const matrix=['rXYZ','gXYZ','bXYZ','rTRC','gTRC','bTRC'];
  const cases=[['scnr','RGB ','XYZ ',0,['A2B0']],['mntr','RGB ','Lab ',0,['A2B0','B2A0']],['prtr','RGB ','XYZ ',0,['A2B0','A2B1','A2B2','B2A0','B2A1','B2A2','gamt']],['scnr','RGB ','XYZ ',1,matrix],['mntr','RGB ','XYZ ',1,matrix],...['scnr','mntr','prtr'].map(c=>[c,'GRAY','Lab ',2,['kTRC']]),['link','RGB ','RGB ',3,['pseq','A2B0']],['spac','RGB ','XYZ ',3,['A2B0','B2A0']],['nmcl','RGB ','Lab ',3,['ncl2']]];
  function check(cls,data,pcs,model,white,names,expected) {
    const out=call(240,requiredPngInput(requiredProfile(cls,data,pcs,names),model,white));
    assert.equal(out.length,24+expected.length*8);
    [1,1,1,1,expected.length,6+(cls!=='link'&&white===0?1:0)].forEach((v,i)=>assert.equal(out.readUInt32LE(i*4),v));
    const actual=new Map();for(let at=24;at<out.length;at+=8)actual.set(out.toString('ascii',at,at+4),out.readUInt32LE(at+4));
    assert.equal(actual.size,expected.length);
    for(const name of expected)assert.equal(actual.get(name),names.includes(name)?0:1);
    comparisons++;
  }
  for(const [cls,data,pcs,model,special] of cases)for(const white of [0,1,2]){
    const expected=['desc','cprt',...(cls==='link'?[]:['wtpt']),...(cls!=='link'&&white===2?['chad']:[]),...special];
    for(let omit=-2;omit<expected.length;omit++){
      const names=omit===-2?[]:expected.filter((_,i)=>i!==omit).reverse().concat(['zzzz']);
      check(cls,data,pcs,model,white,names,expected);
    }
  }
  const reject=(input,re,limit)=>{assert.throws(()=>call(240,input,limit),re);rejected++;};
  const raw=requiredProfile('mntr','RGB ','XYZ ',[]);
  const none=call(240,requiredPngInput(raw,1,0,4,0));assert.equal(none.length,16);[1,0,1,1].forEach((v,i)=>assert.equal(none.readUInt32LE(4*i),v));comparisons++;
  reject(requiredPngInput(raw,1,0,2),/IccEditionMismatch/);
  reject(requiredPngInput(requiredProfile('mntr','RGB ','XYZ ',[],2),1,0,2),/UnsupportedIccRequiredEdition/);
  for(const [cls,data,pcs,model] of [['prtr','RGB ','XYZ ',1],['mntr','RGB ','Lab ',1],['mntr','GRAY','XYZ ',1],['mntr','RGB ','XYZ ',2],['link','RGB ','RGB ',0]])reject(requiredPngInput(requiredProfile(cls,data,pcs,[]),model),/InvalidIccRequiredModel/);
  const good=requiredPngInput(raw,1);
  for(const [at,v] of [[0,2],[1,3],[2,4],[3,3]]){const bad=Buffer.from(good);bad[at]=v;reject(bad,/InvalidProbeInput/);}
  for(let n=0;n<good.length;n++)reject(good.subarray(0,n),/Invalid|UnexpectedEnd|Missing/);
  reject(good,/LimitExceeded/,good.length-1);
  const absent=call(240,Buffer.concat([Buffer.from([1,4,1,0]),profilePng(2)]));assert.deepEqual(absent,Buffer.alloc(16));comparisons++;
  check('mntr','RGB ','XYZ ',1,0,[],['desc','cprt','wtpt',...matrix]);
  return {comparisons,rejected};
}

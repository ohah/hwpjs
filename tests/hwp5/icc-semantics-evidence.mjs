import assert from 'node:assert/strict';
import {iccWireMajor} from './icc-header-evidence.mjs';
const classes=['scnr','mntr','prtr','link','spac','abst','nmcl'];
const spaces=new Map([['XYZ ',3],['Lab ',3],['Luv ',3],['YCbr',3],['Yxy ',3],['RGB ',3],['GRAY',1],['HSV ',3],['HLS ',3],['CMYK',4],['CMY ',3],['2CLR',2],['3CLR',3],['4CLR',4],['5CLR',5],['6CLR',6],['7CLR',7],['8CLR',8],['9CLR',9],['ACLR',10],['BCLR',11],['CCLR',12],['DCLR',13],['ECLR',14],['FCLR',15]]);
function wire(values){const out=Buffer.alloc(values.length*4);values.forEach((v,i)=>out.writeUInt32LE(v,i*4));return out;}
export function identifiersWire(input,limit=input.length){
  assert.ok(input.length<=limit&&input.length>=4);const edition=input.readUInt32LE();assert.ok(edition<=1);
  const b=input.subarray(4),major=iccWireMajor(b);assert.equal(major,edition===0?2:4);
  const kind=classes.indexOf(b.toString('latin1',12,16)),data=spaces.get(b.toString('latin1',16,20)),pcsName=b.toString('latin1',20,24),pcs=spaces.get(pcsName);
  assert.ok(kind>=0&&data!==undefined&&pcs!==undefined);assert.ok(kind===3||['XYZ ','Lab '].includes(pcsName));
  assert.ok(['\0\0\0\0','APPL','MSFT','SGI ','SUNW',...(edition===0?['TGNT']:[])].includes(b.toString('latin1',40,44)));
  return wire([kind,data,pcs,[4,48,52,80].filter(at=>b.readUInt32BE(at)!==0).length]);
}
function dateComponents(b){
  const lower=[0,1,1,0,0,0],upper=[65535,12,31,23,59,59];
  for(let i=0;i<6;i++){const n=b.readUInt16BE(24+i*2);assert.ok(n>=lower[i]&&n<=upper[i]);}
}
export function valuesWire(b,limit=b.length){
  assert.ok(b.length<=limit);assert.equal(iccWireMajor(b),4);dateComponents(b);
  const attrs=b.readBigUInt64BE(56),intent=b.readUInt32BE(64),flags=b.readUInt32BE(44);
  assert.equal(attrs&0xfffffff0n,0n);assert.ok(intent<=3);
  for(let i=0;i<3;i++){const n=b.readInt32BE(68+i*4);assert.ok(n>=0);assert.equal(Math.round(n/65536*10000),[9642,10000,8249][i]);}
  assert.ok(b.subarray(100,128).every(v=>v===0));
  return wire([flags%2,Math.floor(flags/2)%2,flags&0xfffc,flags>>>16,Number(attrs&15n),Number(attrs>>32n),intent]);
}
export function v2ValuesWire(input,limit=input.length){
  assert.ok(input.length<=limit&&input.length>=4);const policy=input.readUInt32LE();assert.ok(policy<=1);
  const b=input.subarray(4);assert.equal(iccWireMajor(b),2);dateComponents(b);
  const attrs=b.readBigUInt64BE(56),intent=b.readUInt32BE(64),flags=b.readUInt32BE(44);assert.ok((intent&65535)<=3);
  for(let i=0;i<3;i++){const raw=b.readInt32BE(68+4*i),target=[0.9642,1,0.8249][i];
    if(policy===0)assert.equal(raw,Math.round(target*65536));else assert.equal(Math.round(raw/65536*10000),Math.round(target*10000));}
  return wire([flags%2,Math.floor(flags/2)%2,flags&0xfffc,flags>>>16,Number(attrs&15n),Number(attrs&0xfffffff0n),Number(attrs>>32n),intent&65535,intent>>>16,b.subarray(84,128).filter(v=>v!==0).length]);
}

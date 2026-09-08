import assert from 'node:assert/strict';
import {modelEntries,modelProfile} from './icc-model.mjs';
import {forwardReference as sampled} from './icc-forward.mjs';
export function pointInput(profile,points){const prefix=Buffer.alloc(48);points.forEach(([n,d],i)=>{prefix.writeBigUInt64BE(n,i*16);prefix.writeBigUInt64BE(d,i*16+8);});return Buffer.concat([prefix,profile]);}
export function pointEntries(matrix,kinds){const entries=modelEntries();
  for(let c=0;c<3;c++){
    for(let r=0;r<3;r++)entries[c][1].writeInt32BE(matrix[r*3+c],8+r*4);
    const kind=kinds[c],values=kind===0?[]:kind===1?[0,12345,65535]:[512],b=Buffer.alloc(kind===3?16:12+2*values.length);b.write(kind===3?'para':'curv');
    if(kind===3)b.writeInt32BE(131072,12);else{b.writeUInt32BE(values.length,8);values.forEach((v,i)=>b.writeUInt16BE(v,12+i*2));}entries[c+3][1]=b;
  }return entries;
}
export function checkPoint(out,matrix,kinds,points){
  assert.equal(out.length,140);assert.equal(out.readUInt32LE(4),1);assert.equal(out.readUInt32LE(8),1);
  const approximate=kinds.some(k=>k>=2);assert.equal(out.readUInt32LE(),Number(approximate));
  const linear=kinds.map((k,i)=>k===0?points[i]:k===1?sampled([0,12345,65535],...points[i]):(Number(points[i][0])/Number(points[i][1]))**2);
  if(approximate){const v=linear.map(x=>typeof x==='number'?x:Number(x[0])/Number(x[1]));for(let row=0;row<3;row++){const expected=matrix.slice(row*3,row*3+3).reduce((sum,a,c)=>sum+a/65536*v[c],0);const got=out.readDoubleLE(12+row*8);assert.ok(Number.isFinite(got));assert.ok(Math.abs(got-expected)<=2e-12*(1+Math.abs(expected)));}assert.ok(out.subarray(36).every(v=>v===0));}
  else{const read=o=>{let v=0n;for(let i=31;i>=0;i--)v=(v<<8n)+BigInt(out[o+i]);return v;},denominator=read(108);assert.ok(denominator>0n);
    for(let row=0;row<3;row++){let n=0n,d=1n;linear.forEach(([a,b],c)=>{const bn=b*65536n;n=n*bn+BigInt(matrix[row*3+c])*a*d;d*=bn;});assert.equal(BigInt.asIntN(256,read(12+row*32))*d,n*denominator);}
  }
}
export function modelForwardEdges(call){let comparisons=0,rejected=0;
  function check(matrix,kinds,points){const b=pointInput(modelProfile(pointEntries(matrix,kinds)),points);checkPoint(call(176,b),matrix,kinds,points);comparisons++;return b;}
  const matrices=[[65536,0,0,0,65536,0,0,0,65536],[1,2,3,4,5,6,7,8,9],[-65536,131072,0,0,-65536,0,0,0,196608],Array(9).fill(-2147483648)];
  const points=[[[0n,1n],[1n,2n],[1n,1n]],[[1n,3n],[2n,3n],[4n,7n]],[[1n,1n],[1n,1n],[1n,1n]]];
  for(const matrix of matrices)for(let variant=0;variant<64;variant++){const kinds=[variant%4,Math.floor(variant/4)%4,Math.floor(variant/16)];for(const p of points)check(matrix,kinds,p);}
  const max=(1n<<64n)-1n;
  for(const m of matrices)check(m,[0,0,0],[[max-1n,max],[max-2n,max-1n],[1n,max-2n]]);
  const identity=matrices[0],p=points[0],good=check(identity,[0,1,2],p);
  for(let c=0;c<3;c++)for(const fraction of [[0n,0n],[2n,1n]]){const changed=[...p];changed[c]=fraction;assert.throws(()=>call(176,pointInput(modelProfile(pointEntries(identity,[0,1,2])),changed)),/InvalidIccCurveCoordinate/);rejected++;}
  assert.throws(()=>call(176,pointInput(modelProfile(pointEntries(identity,[1,0,0])),[[1n,max],p[1],p[2]])),/IccFractionLimitExceeded/);rejected++;
  for(let n=0;n<good.length;n++){assert.throws(()=>call(176,good.subarray(0,n)),/InvalidProbeInput|InvalidIcc/);rejected++;}
  assert.throws(()=>call(176,good,good.length-1),/LimitExceeded/);rejected++;
  check(identity,[0,1,2],p);return {comparisons,rejected};
}

import assert from 'node:assert/strict';
import {jpegSequentialScans,jpegScanOracle,jpegScanFixture} from './jpeg-scan.mjs';
import {jpegStructureOracle,segment} from './jpeg-structure.mjs';

export function jpegFrameInput(raw,{blocks=4000000,scans=65536,restarts=65536,pixels=100000000n,trailing=false}={}){
  const b=Buffer.alloc(21);b.writeUInt32LE(blocks);b.writeUInt32LE(scans,4);b.writeUInt32LE(restarts,8);b.writeBigUInt64LE(pixels,12);b[20]=+trailing;return Buffer.concat([b,raw]);
}
export function jpegFrameOracle(raw){
  const {frame,code,height,scans,deferred}=jpegSequentialScans(raw);assert.ok(!deferred&&[192,193].includes(code));
  const structure=jpegStructureOracle(raw),seen=new Set(),parts=[];let blocks=0,restarts=0;
  for(const s of scans){
    for(let i=0;i<s.options.scan[0];i++){const id=s.options.scan[1+i*2];assert.ok(!seen.has(id));seen.add(id);}
    const result=jpegScanOracle(s.raw,{...s.options,height});blocks+=result.readUInt32LE(12);restarts+=result.readUInt32LE(20);parts.push(result.subarray(24));
  }
  for(let i=0;i<frame[5];i++)assert.ok(seen.has(frame[6+i*3]));assert.equal(seen.size,frame[5]);
  const trailing=structure.readUInt32LE(40),head=Buffer.alloc(36);
  [frame.readUInt16BE(3),frame.readUInt16BE(1),height,frame[5],scans.length,blocks,restarts,raw.length-trailing,trailing].forEach((n,i)=>head.writeUInt32LE(n,i*4));
  return Buffer.concat([head,...parts]);
}
export function jpegFrameActual(call,raw,options={}){const result=call(254,jpegFrameInput(raw,options));assert.deepEqual(result,jpegFrameOracle(raw));return {scans:result.readUInt32LE(16),blocks:result.readUInt32LE(20),restarts:result.readUInt32LE(24)};}
export function jpegFrameFileActual(call,raw){if(jpegSequentialScans(raw).deferred)return {deferred:true};return {...jpegFrameActual(call,raw),deferred:false};}

export function jpegFrameFixture({groups=[[0,1,2]],width=17,height=17,sampling=[34,17,17],precision=8,interval=0,dnl=false,redefine=false}={}){
  const fixtures=groups.map(selected=>jpegScanFixture({width,height,sampling,precision,interval,selected}));
  const first=fixtures[0].options,frame=Buffer.from(first.frame);if(dnl)frame.writeUInt16BE(0,1);
  const ri=Buffer.alloc(2);ri.writeUInt16BE(interval);
  const parts=[Buffer.from([255,216]),segment(219,first.q),segment(196,first.h),segment(first.code,frame),segment(221,ri)];
  fixtures.forEach((f,i)=>{
    if(redefine&&i){const q=Buffer.from(first.q);q[1]=3+i;parts.push(segment(219,q),segment(196,first.h));}
    parts.push(segment(218,f.options.scan),f.raw.subarray(0,-2));if(dnl&&i===0){const nl=Buffer.alloc(2);nl.writeUInt16BE(height);parts.push(segment(220,nl));}
  });
  parts.push(Buffer.from([255,217]));return Buffer.concat(parts);
}

export function jpegFrameEdges(call){
  let comparisons=0,rejected=0;
  const check=(raw,options={})=>{jpegFrameActual(call,raw,options);comparisons++;};
  const reject=(raw,error,options={},limit=67108864)=>{assert.throws(()=>call(254,jpegFrameInput(raw,options),limit),error);rejected++;};
  const partitions=[[[0,1,2]],[[0],[1],[2]],[[2],[0],[1]],[[2],[0,1]],[[1],[0,2]],[[0,2],[1]]];
  for(const groups of partitions)for(const precision of [8,12])for(const interval of [0,1,2,7])for(const dnl of [false,true])for(const redefine of [false,true])check(jpegFrameFixture({groups,precision,interval,dnl,redefine}));
  for(const groups of [[[0]],[[0,1]],[[2],[0]],[[0],[0]],[[2],[0,2]]])reject(jpegFrameFixture({groups}),groups.flat().length!==new Set(groups.flat()).size?/DuplicateJpegComponentScan/:/MissingJpegComponentScan/);
  const good=jpegFrameFixture({groups:[[2],[0],[1]],interval:1}),single=jpegFrameFixture({groups:[[0,1,2]],width:1,height:1,sampling:[17,17,17]});
  const expected=jpegFrameOracle(good);const count=expected.readUInt32LE(20),rst=expected.readUInt32LE(24);
  check(good,{blocks:count,scans:3,restarts:rst});
  reject(good,/LimitExceeded/,{blocks:count-1});reject(good,/LimitExceeded/,{scans:2});reject(good,/LimitExceeded/,{restarts:rst-1});
  reject(good,/LimitExceeded/,{pixels:288n});
  for(let n=0;n<single.length;n++)reject(single.subarray(0,n),/UnexpectedEnd|MissingJpegSoi|MissingJpegFrame|MissingJpegScan|MissingJpegEoi/);
  const extra=Buffer.concat([good,Buffer.from([1,2,3])]);reject(extra,/TrailingJpegBytes/);check(extra,{trailing:true});
  reject(single,/LimitExceeded/,{},36+3*272-1);
  // Change the DC coding model for the middle scan, then restore it. This
  // changes actual entropy interpretation, not only an unused table byte.
  const f=jpegScanFixture({width:1,height:1,sampling:[17,17,17],selected:[0]}),o=f.options;
  const dcZero=Buffer.from([0,1,...Array(15).fill(0),0]);
  const changed=Buffer.concat([Buffer.from([255,216]),segment(219,o.q),segment(196,o.h),segment(192,o.frame),
    segment(218,Buffer.from([1,9,0,0,63,0])),Buffer.from([0x5f]),segment(196,dcZero),
    segment(218,Buffer.from([1,7,0,0,63,0])),Buffer.from([0x3f]),segment(196,o.h),
    segment(218,Buffer.from([1,5,0,0,63,0])),Buffer.from([0x5f]),Buffer.from([255,217])]);
  check(changed);
  const arithmetic=Buffer.from(single);arithmetic[arithmetic.indexOf(Buffer.from([255,192]))+1]=201;
  reject(arithmetic,/UnsupportedJpegSequentialProcess/);
  const many=Buffer.alloc(6+255*3);many.set([8,0,1,0,1,255]);
  for(let i=0;i<255;i++){many[6+i*3]=(i*73)%256;many[7+i*3]=17;}
  const all=[Buffer.from([255,216]),segment(219,o.q),segment(196,o.h),segment(193,many)];
  for(let i=254;i>=0;i--)all.push(segment(218,Buffer.from([1,many[6+i*3],0,0,63,0])),Buffer.from([0x5f]));
  all.push(Buffer.from([255,217]));check(Buffer.concat(all));
  return {comparisons,rejected};
}

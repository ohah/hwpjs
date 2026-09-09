import assert from 'node:assert/strict';
import {progressiveFrameInput,progressiveFrameActual,progressiveFrameOracle} from './jpeg-progressive-frame.mjs';
import {jpegScanFixture,jpegScanGeometry} from './jpeg-scan.mjs';
import {segment} from './jpeg-structure.mjs';
import {progressiveSingle} from './jpeg-progressive-block.mjs';
import {encodeCodes} from './jpeg-codec.mjs';

const scalar=n=>{const b=Buffer.alloc(2);b.writeUInt16BE(n);return b;};
export function progressiveFrameFixture({width=17,height=9,sampling=[34,17,17],groups=[sampling.map((_,i)=>i)],precision=8,initial=2,interval=0,dnl=false,refine=true,ac=true}={}) {
  const base=jpegScanFixture({width,height,sampling,precision,selected:groups[0]}).options,frame=Buffer.from(base.frame);
  if(dnl)frame.writeUInt16BE(0,1);
  const dc=progressiveSingle(0,1),acTable=Buffer.from([16,0,2,...Array(14).fill(0),1,0]);
  const parts=[Buffer.from([255,216]),segment(219,base.q),segment(196,dc),segment(194,frame),segment(196,acTable),segment(221,scalar(interval))];
  let scans=0;
  const add=(selected,dc,ah,al)=>{
    const scan=Buffer.from([selected.length,...selected.flatMap(i=>[frame[6+i*3],0]),dc?0:1,dc?0:63,ah*16+al]);
    const g=jpegScanGeometry(frame,scan,height);parts.push(segment(218,scan));let bits=[];
    for(let m=0;m<g.columns*g.rows;m++) {
      if(m&&interval&&m%interval===0){parts.push(encodeCodes(bits),Buffer.from([255,208+(m/interval-1)%8]));bits=[];}
      for(let slot=0;slot<g.perMcu;slot++)bits.push(dc?(ah?String((m+slot)%2):'0'+String((m+slot)%2)):(ah?'011':'00'+String(m%2)+'01'));
    }
    parts.push(encodeCodes(bits));if(dnl&&scans===0)parts.push(segment(220,scalar(height)));scans++;
  };
  for(const group of groups)add(group,true,0,initial);
  if(ac)for(const i of groups.flat())add([i],false,0,initial);
  if(refine)for(let ah=initial;ah>0;ah--){for(const group of groups)add(group,true,ah,ah-1);if(ac)for(const i of groups.flat())add([i],false,ah,ah-1);}
  parts.push(Buffer.from([255,217]));return Buffer.concat(parts);
}

export function progressiveSharedQuantizationFixture() {
  const frame=Buffer.from([8,0,1,0,1,2,9,17,0,4,17,0]),q=n=>Buffer.from([0,...Array(64).fill(n)]),dc=progressiveSingle(0,1),ac=progressiveSingle(16,0);
  const parts=[Buffer.from([255,216]),segment(219,q(3)),segment(196,Buffer.concat([dc,ac])),segment(194,frame)];
  for(const [id,value] of [[9,7],[4,11]])parts.push(segment(218,Buffer.from([1,id,0,0,0,0])),encodeCodes(['01']),segment(218,Buffer.from([1,id,0,1,63,0])),encodeCodes(['0']),segment(219,q(value)));
  return Buffer.concat([...parts,Buffer.from([255,217])]);
}

export function progressiveWideQuantizationFixture(precision=12) {
  const wideQ=Buffer.from([19,...Array(64).fill([18,52]).flat()]),narrowQ=Buffer.from([2,...Array(64).fill(5)]);
  const frame=Buffer.from([precision,0,1,0,1,2,9,17,3,4,17,2]);
  const parts=[Buffer.from([255,216]),segment(219,Buffer.concat([wideQ,narrowQ])),segment(194,frame),segment(196,Buffer.concat([progressiveSingle(2,1),progressiveSingle(3,2),progressiveSingle(17,0)]))];
  for(const [id,selector,bits] of [[9,32,'01'],[4,48,'010']])parts.push(segment(218,Buffer.from([1,id,selector,0,0,0])),encodeCodes([bits]),segment(218,Buffer.from([1,id,1,1,63,0])),encodeCodes(['0']));
  return Buffer.concat([...parts,Buffer.from([255,217])]);
}

export function progressiveFrameEdges(call) {
  let comparisons=0,rejected=0;
  const check=(raw,options={})=>{progressiveFrameActual(call,raw,options);comparisons++;};
  const reject=(raw,error,options={},limit=67108864)=>{assert.throws(()=>call(281,progressiveFrameInput(raw,options),limit),error);rejected++;};
  const partitions=[[[0,1,2]],[[2],[0],[1]],[[0,2],[1]]];
  for(const groups of partitions)for(const precision of [8,12])for(const initial of [0,1,3,13])for(const interval of [0,1,3])for(const dnl of [false,true])check(progressiveFrameFixture({groups,precision,initial,interval,dnl}),{full:true});
  for(const sampling of [[17],[68],[33,18],[49,17]])for(const width of [1,8,9,31])for(const height of [1,9,17])for(const interval of [0,1,7])check(progressiveFrameFixture({sampling,width,height,interval}),{full:true});
  for(const groups of [[[0]],[[2],[0]],[[2]],[[0,2]]])for(const refine of [false,true])for(const ac of [false,true]) {
    const raw=progressiveFrameFixture({groups,refine,ac});check(raw);reject(raw,/IncompleteJpegProgressiveCoefficients/,{full:true});
  }
  for(const initial of [0,3,13])for(const ac of [false,true])check(progressiveFrameFixture({initial,ac,refine:false}));
  const good=progressiveFrameFixture({sampling:[17],width:1,height:1,initial:1}),result=progressiveFrameOracle(good);
  const stored=result.readUInt32LE(16),visits=result.readUInt32LE(20),scans=result.readUInt32LE(24);
  check(good,{full:true,stored,storageBytes:stored*256,visits,scans});
  reject(good,/LimitExceeded/,{stored:stored-1});reject(good,/LimitExceeded/,{storageBytes:stored*256-1});reject(good,/LimitExceeded/,{visits:visits-1});reject(good,/LimitExceeded/,{scans:scans-1});
  reject(good,/LimitExceeded/,{pixels:0n});reject(good,/LimitExceeded/,{},result.length-1);
  for(let length=0;length<good.length;length++)reject(good.subarray(0,length),/UnexpectedEnd|MissingJpegSoi|MissingJpegFrame|MissingJpegScan|MissingJpegEoi/);
  const trailing=Buffer.concat([good,Buffer.from([3,4,5])]);reject(trailing,/TrailingJpegBytes/);check(trailing,{full:true,trailing:true});
  // Table lifetime: a completed component retains its Q even if a shared
  // destination is reused by a later component, then replaced after both.
  check(progressiveSharedQuantizationFixture(),{full:true});
  const q=n=>Buffer.from([0,...Array(64).fill(n)]),dc=progressiveSingle(0,1),ac=progressiveSingle(16,0);
  const repeated=progressiveFrameFixture({groups:[[0],[0]],initial:0,refine:false,ac:false});reject(repeated,/DuplicateJpegInitialBand/);
  const base=[Buffer.from([255,216]),segment(219,q(1)),segment(196,Buffer.concat([dc,ac])),segment(194,Buffer.from([8,0,1,0,1,1,9,17,0]))];
  const first=[...base,segment(218,Buffer.from([1,9,0,0,0,1])),encodeCodes(['01'])];
  reject(Buffer.concat([...first,segment(219,Buffer.concat([q(2),q(1)])),segment(218,Buffer.from([1,9,0,0,0,16])),encodeCodes(['0']),Buffer.from([255,217])]),/AlteredJpegProgressiveQuantization/);
  reject(Buffer.concat([...base,segment(218,Buffer.from([1,9,0,1,63,0])),encodeCodes(['0']),Buffer.from([255,217])]),/MissingJpegInitialDcScan/);
  const badPad=Buffer.from(good);badPad[badPad.length-3]&=0xfe;reject(badPad,/InvalidJpegEntropyPadding/);
  check(progressiveWideQuantizationFixture(),{full:true});
  reject(progressiveWideQuantizationFixture(8),/InvalidJpegQuantizationPrecision/);
  return {comparisons,rejected};
}

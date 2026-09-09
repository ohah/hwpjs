import assert from 'node:assert/strict';
import {jpegFrameFixture} from './jpeg-headers.mjs';
import {jpegMarkerOracle,jpegEntropyOracle} from './jpeg-framing.mjs';
const words=ns=>{const b=Buffer.alloc(ns.length*4);ns.forEach((n,i)=>b.writeUInt32LE(n,i*4));return b;};
export function jpegStructureInput(raw,{scans=65536,restarts=65536,pixels=100000000n,trailing=false,markers=65536}={}){
  const h=Buffer.alloc(21);h.writeUInt32LE(scans,0);h.writeUInt32LE(restarts,4);h.writeBigUInt64LE(pixels,8);h[16]=+trailing;h.writeUInt32LE(markers,17);return Buffer.concat([h,raw]);
}
export function jpegStructureOracle(raw){
  let at=0,active=false;const r=Array(13).fill(0);r[12]=1;
  while(at<raw.length){
    if(active){const e=jpegEntropyOracle(raw.subarray(at));at+=e.consumed;r[3]+=e.consumed;r[4]+=e.wire.readUInt32LE(4);}
    const m=jpegMarkerOracle(raw.subarray(at)),p=m.wire.subarray(20);at+=m.consumed;r[0]++;
    if(m.code>=208&&m.code<=215){r[2]++;continue;}
    active=false;
    if(m.code>=192&&m.code<=207&&![196,200,204].includes(m.code)){r[5]=p.readUInt16BE(3);r[6]=p.readUInt16BE(1);r[7]=r[6];}
    else if(m.code===218){r[1]++;active=true;}
    else if(m.code===220){r[7]=p.readUInt16BE(0);r[8]=1;}
    else if(m.code===221)r[9]=p.readUInt16BE(0);
    else if(m.code===217){r[10]=raw.length-at;return words(r);}
    else if([196,219,204,254].includes(m.code)||(m.code>=224&&m.code<=239))r[11]++;
  }
  throw Error('Missing EOI');
}
export function jpegStructureActual(call,raw,options={}){assert.deepEqual(call(250,jpegStructureInput(raw,options)),jpegStructureOracle(raw));}
export function jpegStructureFixture({height=1,between=[],entropy=Buffer.from([18,255,0,52]),end=[]}={}){
  return Buffer.concat([Buffer.from([255,216]),segment(192,jpegFrameFixture({height})),...between,segment(218,Buffer.from([1,9,0,0,63,0])),entropy,...end,Buffer.from([255,217])]);
}
export function segment(code,payload){const h=Buffer.alloc(4);h[0]=255;h[1]=code;h.writeUInt16BE(payload.length+2,2);return Buffer.concat([h,payload]);}
const scalar=n=>{const b=Buffer.alloc(2);b.writeUInt16BE(n);return b;};
export function jpegStructureEdges(call){
  let comparisons=0,rejected=0;const good=jpegStructureFixture();
  const check=(raw,options={})=>{jpegStructureActual(call,raw,options);comparisons++;};
  const reject=(raw,error,options={})=>{assert.throws(()=>call(250,jpegStructureInput(raw,options)),error);rejected++;check(good);};
  for(let value=0;value<65536;value++){
    check(jpegStructureFixture({between:[segment(221,scalar(value))]}));
    const dnl=jpegStructureFixture({height:0,end:[segment(220,scalar(value))]});
    if(value)check(dnl);else reject(dnl,/InvalidJpegNumberOfLines/);
  }
  for(const code of [220,221])for(const length of [0,1,3,4]){
    const m=segment(code,Buffer.alloc(length,1));
    reject(jpegStructureFixture(code===220?{end:[m]}:{between:[m]}),length<2?/UnexpectedEnd/:/InvalidJpegScanFieldLength/);
  }
  const dri=segment(221,scalar(1)),dnl=segment(220,scalar(3)),sos=segment(218,Buffer.from([1,9,0,0,63,0]));
  const rst=code=>Buffer.from([255,code]),data=Buffer.from([18]);
  for(let first=208;first<=215;first++){
    const raw=jpegStructureFixture({between:[dri],entropy:Buffer.concat([data,rst(first),data])});
    if(first===208)check(raw);else reject(raw,/InvalidJpegRestartSequence/);
  }
  const cycle=Buffer.concat([data,...Array.from({length:17},(_,i)=>Buffer.concat([rst(208+i%8),data]))]);
  check(jpegStructureFixture({between:[dri],entropy:cycle}));
  const two=jpegStructureFixture({between:[dri],entropy:Buffer.concat([data,rst(208),data,sos,data,rst(208),data])});check(two);
  reject(two,/LimitExceeded/,{restarts:1});reject(two,/LimitExceeded/,{scans:1});
  reject(jpegStructureFixture({entropy:Buffer.concat([data,rst(208),data])}),/InvalidJpegRestartPosition/);
  reject(jpegStructureFixture({between:[rst(208)]}),/InvalidJpegRestartPosition/);
  reject(jpegStructureFixture({height:0}),/MissingJpegDnl/);
  reject(jpegStructureFixture({height:0,end:[segment(254,Buffer.alloc(0)),dnl]}),/MissingJpegDnl/);
  reject(jpegStructureFixture({between:[dnl]}),/InvalidJpegDnlPosition/);
  reject(jpegStructureFixture({end:[dnl,dnl]}),/InvalidJpegDnlPosition/);
  reject(jpegStructureFixture({end:[sos,data,dnl]}),/InvalidJpegDnlPosition/);
  reject(jpegStructureFixture({end:[dnl,data]}),/InvalidJpegMarker/);
  check(jpegStructureFixture({end:[dnl]}),{pixels:6n});
  reject(jpegStructureFixture({end:[dnl]}),/LimitExceeded/,{pixels:5n});
  const tail=Buffer.concat([good,Buffer.from([42])]);reject(tail,/TrailingJpegBytes/);check(tail,{trailing:true});
  for(let n=0;n<good.length;n++)reject(good.subarray(0,n),/MissingJpeg|UnexpectedEnd/);
  check(good,{markers:4});reject(good,/LimitExceeded/,{markers:3});
  return {comparisons,rejected};
}

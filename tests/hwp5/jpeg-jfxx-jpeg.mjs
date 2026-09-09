import assert from 'node:assert/strict';
import {jpegMarkerOracle,jpegEntropyOracle} from './jpeg-framing.mjs';
import {jpegFrameFixture} from './jpeg-frame.mjs';
import {jpegPlanesInput,jpegPlanesOracle} from './jpeg-planes.mjs';
import {segment} from './jpeg-structure.mjs';

function markers(raw) {
  let at=0,entropy=false;const result=[];
  while(at<raw.length){
    if(entropy)at+=jpegEntropyOracle(raw.subarray(at)).consumed;
    const m=jpegMarkerOracle(raw.subarray(at));
    result.push({code:m.code,start:at,payload:at+m.consumed-(m.wire.length-20),end:at+m.consumed});
    at+=m.consumed;entropy=m.code===218||(m.code>=208&&m.code<=215);
    if(m.code===217)break;
  }
  return result;
}

export function jpegJfxxJpegFixture(options={}) {
  const raw=jpegFrameFixture(options),ids=new Map();
  for(const m of markers(raw)){
    if(m.code===192||m.code===193){for(let i=0;i<raw[m.payload+5];i++){const at=m.payload+6+i*3;ids.set(raw[at],i+1);raw[at]=i+1;}}
    if(m.code===218)for(let i=0;i<raw[m.payload];i++){const at=m.payload+1+i*2;raw[at]=ids.get(raw[at]);}
  }
  return raw;
}

export function jpegJfxxJpegOracle(raw) {
  assert.ok(raw.length<=65527);
  for(const m of markers(raw)){
    if(m.code>=192&&m.code<=207&&![196,200,204].includes(m.code)){
      assert.equal(m.code,192);const f=raw.subarray(m.payload,m.end);assert.equal(f[0],8);assert.ok([1,3].includes(f[5]));
      for(let i=0;i<f[5];i++)assert.equal(f[6+i*3],i+1);
    }
    if(m.code===224)assert.ok(!['JFIF\0','JFXX\0'].includes(raw.subarray(m.payload,m.payload+5).toString('latin1')));
  }
  return jpegPlanesOracle(raw);
}

export function jpegJfxxJpegActual(call,raw,maximum=64000000){assert.deepEqual(call(264,jpegPlanesInput(raw,maximum)),jpegJfxxJpegOracle(raw));}

export function jpegJfxxJpegEdges(call) {
  let comparisons=0,rejected=0;
  const check=raw=>{jpegJfxxJpegActual(call,raw);comparisons++;};
  const reject=(raw,error,maximum=64000000,limit=67108864)=>{assert.throws(()=>call(264,jpegPlanesInput(raw,maximum),limit),error);rejected++;};
  for(const width of [1,8,17])for(const height of [1,9,17])for(const sampling of [[17],[34,17,17],[49,17,18]])
    for(const groups of sampling.length===1?[[[0]]]:[[[0,1,2]],[[2],[0],[1]]])for(const interval of [0,1,3])for(const dnl of [false,true])
      check(jpegJfxxJpegFixture({width,height,sampling,groups,interval,dnl,redefine:true}));
  const raw=jpegJfxxJpegFixture({width:1,height:1,sampling:[17],groups:[[0]]});
  for(const name of ['JFIF\0','JFXX\0'])for(const at of [2,raw.length-2])reject(Buffer.concat([raw.subarray(0,at),segment(224,Buffer.from(name)),raw.subarray(at)]),/ForbiddenJfxxNestedMarker/);
  check(Buffer.concat([raw.subarray(0,2),segment(224,Buffer.from('acme\0')),raw.subarray(2)]));
  const sof=markers(raw).find(m=>m.code===192);
  for(const code of [193,194,195,201,202,203]){const bad=Buffer.from(raw);bad[sof.start+1]=code;reject(bad,/UnsupportedJfxxJpegProcess/);}
  const id=Buffer.from(raw);id[sof.payload+6]=9;reject(id,/InvalidJfifComponentId/);
  const badPad=Buffer.from(raw);badPad[badPad.length-3]=0x40;reject(badPad,/InvalidJpegEntropyPadding/);
  for(let n=0;n<raw.length;n++)reject(raw.subarray(0,n),/UnexpectedEnd|MissingJpegSoi|MissingJpegFrame|MissingJpegScan|MissingJpegEoi/);
  reject(Buffer.concat([raw,Buffer.of(0)]),/TrailingJpegBytes/);
  reject(Buffer.alloc(65528),/LimitExceeded/);reject(raw,/LimitExceeded/,0);
  const large=jpegJfxxJpegFixture({width:17,height:17});reject(large,/LimitExceeded/,64000000,jpegJfxxJpegOracle(large).length-1);
  return {comparisons,rejected};
}

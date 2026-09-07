import assert from 'node:assert/strict';
import {deflateSync,gzipSync,deflateRawSync} from 'node:zlib';
import {iccHeaderWire,iccDigest} from './icc-header-evidence.mjs';
import {iccTableWire} from './icc-table-evidence.mjs';
import {profileEnvelopeWire} from './png-profile-evidence.mjs';
import {iccFixture} from './icc-fixture.mjs';
export function iccEdges(call){
  let accepted=0,rejected=0,headerMutations=0,tableMutations=0,envelopeMutations=0;
  function compare(mode,input,expectedFn,limit){let expected;try{expected=expectedFn();}catch{}
    if(expected){assert.deepEqual(call(mode,input,limit),expected);accepted++;return expected;}
    assert.throws(()=>call(mode,input,limit),e=>!(e instanceof WebAssembly.RuntimeError));rejected++;
  }
  const head=(b,limit=b.length)=>compare(143,b,()=>iccHeaderWire(b,limit),limit);
  const table=(b,policy,maxTags=100000,limit=b.length)=>{const options=Buffer.alloc(8);options.writeUInt32LE(maxTags);options.writeUInt32LE(policy,4);return compare(144,Buffer.concat([options,b]),()=>iccTableWire(b,policy,maxTags,limit),limit);};
  const envelope=(b,max=65536,limit=b.length)=>{const option=Buffer.alloc(4);option.writeUInt32LE(max);return compare(145,Buffer.concat([option,b]),()=>profileEnvelopeWire(b,max,limit),limit);};
  const base=iccFixture();for(let at=0;at<128;at++)for(let v=0;v<256;v++){const b=Buffer.from(base);b[at]=v;head(b);headerMutations++;}
  for(const major of [2,4]){const b=iccFixture([],132,major);for(let at=0;at<128;at++)if(![0,1,2,3,8,9,10,11,36,37,38,39].includes(at))b[at]=at;
    if(major===4)b.fill(0,84,100);assert.ok(head(b));head(b,b.length-1);
  }
  const signed=iccFixture();iccDigest(signed).copy(signed,84);assert.ok(head(signed));
  for(let at=44;at<100;at++)for(const v of [1,127,255]){const b=Buffer.from(signed);b[at]^=v;head(b);}
  for(let len=0;len<base.length;len++)head(base.subarray(0,len));head(Buffer.concat([base,Buffer.from([0])]));
  const ordered=iccFixture([['zzzz',168,12],['aaaa',156,12]],180);
  for(const policy of [0,1]){
    assert.ok(table(ordered,policy));table(ordered,policy,1);table(ordered,policy,2,179);
    for(let at=128;at<ordered.length;at++)for(let v=0;v<256;v++){const b=Buffer.from(ordered);b[at]=v;table(b,policy);tableMutations++;}
    for(const length of [132,136])table(iccFixture([],length),policy,0);
    for(const entries of [[['aTag',156,24],['bTag',168,8]],[['aTag',156,24],['bTag',156,8]],[['aTag',156,24],['bTag',156,24]],[['aTag',156,24],['aTag',156,24]]])table(iccFixture(entries,180),policy);
    for(const [offset,size,length] of [[144,9,153],[144,9,156],[148,8,160],[144,8,156]])table(iccFixture([['aTag',offset,size]],length),policy);
    for(const field of [128,136,140])for(const value of [0,1,7,8,12,128,132,144,156,180,0x7fffffff,0xfffffffc,0xffffffff]){const b=Buffer.from(ordered);b.writeUInt32BE(value,field);table(b,policy,0xffffffff);}
  }
  const binary=Buffer.from(Array.from({length:256},(_,i)=>i)),payload=Buffer.concat([Buffer.from('Profile\0\0'),deflateSync(binary)]);
  assert.ok(envelope(payload,256));envelope(payload,255);envelope(payload,256,payload.length-1);
  for(let at=0;at<payload.length;at++)for(const v of [0,1,127,128,255]){const b=Buffer.from(payload);b[at]=v;envelope(b,256);envelopeMutations++;}
  for(let method=0;method<256;method++){const b=Buffer.from(payload);b[8]=method;envelope(b,256);}
  for(let len=0;len<payload.length;len++)envelope(payload.subarray(0,len),256);
  for(const compressed of [gzipSync(binary),deflateRawSync(binary),Buffer.concat([deflateSync(binary),Buffer.from([0])])])envelope(Buffer.concat([Buffer.from('K\0\0'),compressed]),256);
  assert.ok(envelope(Buffer.concat([Buffer.from('K\0\0'),deflateSync(Buffer.alloc(0))]),0));
  for(const key of [Buffer.alloc(79,255),Buffer.alloc(80,65),Buffer.from(' Leading'),Buffer.from('Two  spaces'),Buffer.from([160])])envelope(Buffer.concat([key,Buffer.from([0,0]),deflateSync(binary)]),256);
  assert.ok(head(base));assert.ok(table(ordered,1));assert.ok(envelope(payload,256));return {accepted,rejected,headerMutations,tableMutations,envelopeMutations};
}

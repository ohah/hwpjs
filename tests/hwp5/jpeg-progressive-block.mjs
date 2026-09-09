import assert from 'node:assert/strict';
import {unstuff,huffmanCodewords,encodeCodes} from './jpeg-codec.mjs';
import {jpegFrameFixture} from './jpeg-headers.mjs';

const sized=b=>{const n=Buffer.alloc(2);n.writeUInt16LE(b.length);return Buffer.concat([n,b]);};
export const progressiveZero=()=>Array(64).fill(0);
export const progressiveSingle=(cls,symbol)=>Buffer.from([cls,1,...Array(15).fill(0),symbol]);
export function progressiveBlockInput(raw,{frame=jpegFrameFixture(),code=194,start=0,end=0,ah=0,al=0,table=null,blocks=[progressiveZero()],predictor=0,eob=0,skip=0,finish=false,scan=null}={}) {
  const h=Buffer.alloc(13);h[0]=code;h[1]=+finish;h[2]=skip;h.writeInt32LE(predictor,3);h.writeUInt16LE(eob,7);h.writeUInt32LE(blocks.length,9);
  const rows=Buffer.alloc(blocks.length*256);blocks.forEach((b,i)=>b.forEach((v,k)=>rows.writeInt32LE(v,i*256+k*4)));
  return Buffer.concat([h,sized(frame),sized(scan??Buffer.from([1,frame[6],0,start,end,ah*16+al])),sized(table??Buffer.alloc(0)),rows,raw]);
}

export function progressiveBlockOracle(raw,{frame=jpegFrameFixture(),code=194,start=0,end=0,ah=0,al=0,table=null,blocks=[progressiveZero()],predictor=0,eob=0,skip=0,finish=false}={}) {
  assert.equal(code,194);assert.ok([8,12].includes(frame[0]));
  assert.ok(start<=end&&end<=63&&(start!==0||end===0));assert.ok(al<=13&&ah<=13&&(ah===0||ah===al+1));assert.ok(eob<=32767);
  const {text,ends}=unstuff(raw);let at=skip;assert.ok(at<=text.length);
  const read=n=>{assert.ok(at+n<=text.length,'truncated bits');const s=text.slice(at,at+n);at+=n;return n?parseInt(s,2):0;};
  const receive=n=>{const v=read(n);return n&&v<2**(n-1)?v-(2**n-1):v;};
  const map=table===null?null:new Map(huffmanCodewords(table).map(c=>[c.bits,c.symbol]));
  if(!(start===0&&ah!==0)){assert.ok(map);assert.equal(table[0]>>4,start===0?0:1);}
  const symbol=()=>{let prefix='';for(let n=0;n<16;n++){prefix+=String(read(1));if(map.has(prefix))return map.get(prefix);}assert.fail('bad code');};
  const integer=v=>{assert.ok(Number.isInteger(v)&&v>=-2147483648&&v<=2147483647,'i32 overflow');return v;};
  const step=2**al,rows=[];
  for(const prior of blocks) {
    assert.equal(prior.length,64);const b=prior.slice();
    for(let k=start;k<=end;k++){if(ah===0)assert.equal(b[k],0);else assert.equal(Math.abs(b[k])%(step*2),0);}
    if(start===0) {
      assert.equal(eob,0);
      if(ah===0){const size=symbol();assert.ok(size<=frame[0]+3);predictor=integer(predictor+receive(size));b[0]=integer(predictor*step);}
      else b[0]=integer(b[0]+read(1)*step);
    } else {
      let cursor=start;
      const correction=(from,to)=>{for(let k=from;k<=to;k++)if(b[k]!==0)b[k]=integer(b[k]+read(1)*Math.sign(b[k])*step);};
      if(eob===0)while(cursor<=end) {
        const rs=symbol(),run=Math.floor(rs/16),size=rs%16;
        if(size===0&&run!==15){eob=2**run+read(run);break;}
        if(ah===0) {
          if(size===0){cursor+=16;assert.ok(cursor<=end+1);}
          else {assert.ok(size<=frame[0]+2);cursor+=run;assert.ok(cursor<=end);b[cursor++]=integer(receive(size)*step);}
        } else {
          assert.ok(size===0||size===1);const sign=size?read(1)*2-1:0;
          // Resolve the target from an index list before applying correction
          // bits, independently of the product's decrementing zero-run loop.
          const zeros=Array.from({length:end-cursor+1},(_,i)=>cursor+i).filter(k=>b[k]===0);
          const target=zeros[size?run:15];assert.notEqual(target,undefined,'AC run beyond band');
          correction(cursor,target);if(size)b[target]=sign*step;cursor=target+1;
        }
      }
      if(eob){if(ah!==0)correction(cursor,end);eob--;}
    }
    rows.push(b);
  }
  const offset=at?ends[Math.ceil(at/8)-1]:0;let remaining=(8-at%8)%8;
  if(finish){assert.equal(eob,0);assert.equal(offset,raw.length);assert.ok(/^1*$/.test(text.slice(at)));remaining=0;}
  const out=Buffer.alloc(20+rows.length*256);out.writeUInt32LE(offset);out.writeUInt32LE(remaining,4);out.writeInt32LE(predictor,8);out.writeUInt32LE(eob,12);out.writeUInt32LE(rows.length,16);
  rows.forEach((b,i)=>b.forEach((v,k)=>out.writeInt32LE(v,20+i*256+k*4)));return out;
}

export function progressiveBlockActual(call,raw,options){assert.deepEqual(call(279,progressiveBlockInput(raw,options)),progressiveBlockOracle(raw,options));}
export function progressiveBlockEdges(call) {
  let comparisons=0,rejected=0;
  const check=(raw,options)=>{progressiveBlockActual(call,raw,options);comparisons++;};
  const reject=(raw,options,error,limit=67108864)=>{assert.throws(()=>call(279,progressiveBlockInput(raw,options),limit),error);rejected++;};
  for(const precision of [8,12])for(const al of [0,1,6,13]) {
    const frame=jpegFrameFixture({precision});
    for(let size=0;size<=precision+3;size++)for(const value of [0,2**size-1]) {
      const raw=encodeCodes(['0',size?value.toString(2).padStart(size,'0'):'']);
      check(raw,{frame,al,predictor:7,table:progressiveSingle(0,size),finish:true});
    }
    for(let rs=0;rs<256;rs++) {
      const size=rs%16,run=rs>>4,options={frame,start:1,end:63,al,table:progressiveSingle(16,rs)};
      if(!size&&run!==15)check(encodeCodes(['0','1'.repeat(run)]),options);
      else if(!size)check(encodeCodes(['0','0','0','0']),{...options,end:16,finish:false});
      else if(size>precision+2)reject(encodeCodes(['0']),options,/InvalidJpegAcSymbol/);
      else for(const sign of [0,1])check(encodeCodes(['0',String(sign).repeat(size)]),{...options,end:1+run,finish:true});
    }
  }
  const ac=Buffer.from([16,0,0,4,...Array(13).fill(0),0,1,16,240]);
  for(let al=0;al<=12;al++)for(let skip=0;skip<8;skip++)for(const signs of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
    const step=2**al,b=progressiveZero();b[1]=signs[0]*4*step;b[18]=signs[1]*4*step;
    check(encodeCodes(['011','1','000','1'],skip),{start:1,end:18,ah:al+1,al,table:ac,blocks:[b],skip,finish:true});
    const dc=progressiveZero();dc[0]=signs[0]*4*step;
    check(encodeCodes(['1'],skip),{ah:al+1,al,blocks:[dc],skip,finish:true});
  }
  const prior=progressiveZero();prior[1]=-4;prior[3]=4;
  for(let start=1;start<=63;start++)for(let end=start;end<=63;end++) {
    const distance=end-start,table=Buffer.from([16,0,2,...Array(14).fill(0),240,(distance%16)*16+1]),al=(start+end)%13;
    const b=progressiveZero();b[0]=91;
    check(encodeCodes(['00'.repeat(Math.floor(distance/16)),'01',String(start%2)]),{start,end,al,table,blocks:[b],finish:true});
    const correction=[];for(let k=start;k<=end;k++)if(k%3){b[k]=(k%2?-2:2)*2**al;correction.push(String(k%2));}
    check(encodeCodes(['0',...correction]),{start,end,ah:al+1,al,table:progressiveSingle(16,0),blocks:[b],finish:true});
  }
  for(let run=0;run<16;run++)for(let al=0;al<13;al++)for(const sign of [0,1]) {
    const b=progressiveZero();for(let k=1;k<=63;k++)if(k%3===0)b[k]=(k%2?-4:4)*2**al;
    const zeros=Array.from({length:63},(_,i)=>i+1).filter(k=>b[k]===0),target=zeros[run];
    const before=Array.from({length:target-1},(_,i)=>i+1).filter(k=>b[k]!==0).map(()=> '1');
    const after=Array.from({length:63-target},(_,i)=>target+1+i).filter(k=>b[k]!==0).map(()=> '1');
    const table=Buffer.from([16,0,2,...Array(14).fill(0),run*16+1,0]);
    check(encodeCodes(['00',String(sign),...before,'01',...after]),{start:1,end:63,ah:al+1,al,table,blocks:[b],finish:true});
  }
  check(encodeCodes(['001','0','1','000','1']),{start:1,end:4,ah:1,al:0,table:ac,blocks:[prior],finish:true});
  const rows=[4,-4,8].map(n=>{const b=progressiveZero();b[1]=n;return b;});
  check(encodeCodes(['010','1','0','1','1']),{start:1,end:1,ah:1,table:ac,blocks:rows,finish:true});
  const max=progressiveSingle(16,224),run=encodeCodes(['0','1'.repeat(14)]);
  check(run,{start:1,end:63,table:max,blocks:Array.from({length:32767},progressiveZero),finish:true});
  reject(run,{start:1,end:63,table:max,finish:true},/UnfinishedJpegEobRun/);
  for(let size=2;size<16;size++)reject(encodeCodes(['0']),{start:1,end:63,ah:1,table:progressiveSingle(16,size)},/InvalidJpegAcRefinementSymbol/);
  const good=encodeCodes(['001','0','1','000','1']),options={start:1,end:4,ah:1,table:ac,blocks:[prior],finish:true};
  for(let n=0;n<good.length;n++)reject(good.subarray(0,n),options,/UnexpectedEnd/);
  reject(good,options,/LimitExceeded/,275);
  return {comparisons,rejected};
}

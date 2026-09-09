import assert from 'node:assert/strict';
import {jpegScanInput,jpegScanGeometry,jpegScanFixture,headerBytes,blockBytes} from './jpeg-scan.mjs';
import {jpegMarkerOracle,jpegEntropyOracle} from './jpeg-framing.mjs';
import {jpegStoreOracle} from './jpeg-store.mjs';
import {progressiveBlockOracle,progressiveZero,progressiveSingle} from './jpeg-progressive-block.mjs';
import {encodeCodes} from './jpeg-codec.mjs';

export function progressiveScanInput(raw,options) {
  const rows=options.prior,bytes=Buffer.alloc(4+256*rows.length);bytes.writeUInt32LE(rows.length);
  rows.forEach((b,i)=>b.forEach((v,k)=>bytes.writeInt32LE(v,4+256*i+4*k)));
  return jpegScanInput(Buffer.concat([bytes,raw]),{...options,code:options.code??194});
}

// Independent scheduling: build each interval's ordered grid entries, batch
// consecutive components, and use the bit-string block oracle. Product layout,
// predictor state and restart offsets are never used as expected values.
export function progressiveScanOracle(raw,options) {
  const {code=194,frame,scan,q,h,prior,height=frame.readUInt16BE(1),interval=0}=options;
  assert.equal(code,194);assert.ok(height>0);
  jpegStoreOracle(code,frame,[...(q.length?[[0,q]]:[]),...(h.length?[[1,h]]:[]),[2,scan]]);
  const start=scan.at(-3),end=scan.at(-2),ah=scan.at(-1)>>4,al=scan.at(-1)&15;
  const g=jpegScanGeometry(frame,scan,height),mcus=g.columns*g.rows,count=mcus*g.perMcu;
  assert.equal(prior.length,count);assert.ok(count<=(options.blocks??4000000));
  const tables=new Map();
  for(let at=0;at<h.length;){const n=17+h.subarray(at+1,at+17).reduce((a,b)=>a+b,0);assert.ok(at+n<=h.length);tables.set(h[at],h.subarray(at,at+n));at+=n;}
  const out=Buffer.alloc(headerBytes+blockBytes*count);[g.columns,g.rows,g.perMcu,count].forEach((n,i)=>out.writeUInt32LE(n,i*4));
  let at=0,rst=0,index=0;
  for(let first=0;first<mcus;first+=interval||mcus) {
    const segment=jpegEntropyOracle(raw.subarray(at)),entropy=raw.subarray(at,at+segment.consumed);at+=segment.consumed;
    const stop=Math.min(mcus,first+(interval||mcus)),entries=[];
    for(let mcu=first;mcu<stop;mcu++)for(const c of g.components)for(let y=0;y<(g.single?1:c.v);y++)for(let x=0;x<(g.single?1:c.h);x++) {
      const mx=mcu%g.columns,my=Math.floor(mcu/g.columns);
      entries.push({c,x:g.single?mx:mx*c.h+x,y:g.single?my:my*c.v+y});
    }
    const predictors=new Map();let cursor=0,rawAt=0,skip=0;
    while(cursor<entries.length) {
      const from=cursor,c=entries[cursor].c;
      while(cursor<entries.length&&entries[cursor].c.index===c.index)cursor++;
      const n=cursor-from,table=start===0&&ah!==0?null:tables.get(start===0?c.tables>>4:16+(c.tables&15));
      const result=progressiveBlockOracle(entropy.subarray(rawAt),{frame,start,end,ah,al,table,blocks:prior.slice(index,index+n),predictor:predictors.get(c.index)??0,skip,finish:cursor===entries.length});
      assert.equal(result.readUInt32LE(12),0);predictors.set(c.index,result.readInt32LE(8));
      for(let i=0;i<n;i++) {
        const e=entries[from+i],base=headerBytes+blockBytes*index++;
        [c.id,c.index,e.x,e.y].forEach((v,k)=>out.writeUInt32LE(v,base+k*4));
        result.copy(out,base+16,20+i*256,20+(i+1)*256);
      }
      rawAt+=result.readUInt32LE(0);const remaining=result.readUInt32LE(4);
      if(remaining){rawAt-=entropy[rawAt-1]===0&&entropy[rawAt-2]===255?2:1;skip=8-remaining;}else skip=0;
    }
    assert.equal(rawAt,entropy.length);assert.equal(skip,0);
    const marker=jpegMarkerOracle(raw.subarray(at));
    if(stop<mcus){assert.equal(marker.code,208+rst%8);at+=marker.consumed;rst++;assert.ok(rst<=(options.restarts??65536));}
    else assert.ok(marker.code<208||marker.code>215);
  }
  out.writeUInt32LE(at,16);out.writeUInt32LE(rst,20);return out;
}

export function progressiveScanActual(call,raw,options) {
  const expected=progressiveScanOracle(raw,options);assert.deepEqual(call(280,progressiveScanInput(raw,options)),expected);
  return {blocks:expected.readUInt32LE(12),restarts:expected.readUInt32LE(20)};
}

export function progressiveScanFixture(options={}) {
  const {kind='dcFirst',al=0,...geometry}=options;
  const base=jpegScanFixture(geometry).options,scan=Buffer.from(base.scan),dc=kind.startsWith('dc'),refine=kind.endsWith('Refine');
  scan[scan.length-3]=dc?0:1;scan[scan.length-2]=dc?0:63;scan[scan.length-1]=(refine?al+1:0)*16+al;
  const g=jpegScanGeometry(base.frame,scan,base.frame.readUInt16BE(1)),prior=[],parts=[];let bits=[];
  for(let mcu=0;mcu<g.columns*g.rows;mcu++) {
    if(mcu&&base.interval&&mcu%base.interval===0){parts.push(encodeCodes(bits),Buffer.from([255,208+(mcu/base.interval-1)%8]));bits=[];}
    for(let i=0;i<g.perMcu;i++) {
      const b=progressiveZero(),sign=(mcu+i)%2?-1:1;
      // Sentinel outside the selected band must survive every block call.
      if(dc)b[63]=97+prior.length;else b[0]=97+prior.length;
      if(refine){if(dc)b[0]=sign*4*2**al;else for(let k=1;k<=63;k++)if(k%3===0)b[k]=(k%2?-4:4)*2**al;}
      prior.push(b);
      if(dc)bits.push(refine?String((mcu+i)%2):'0'+String(sign>0?1:0));
      else if(refine)bits.push('0'+Array.from({length:21},(_,k)=>String((k+mcu)%2)).join(''));
      else bits.push('0');
    }
  }
  parts.push(encodeCodes(bits),Buffer.from([255,217]));
  return {raw:Buffer.concat(parts),options:{...base,code:194,scan,prior,h:refine&&dc?Buffer.alloc(0):progressiveSingle(dc?0:16,dc?1:0)}};
}

export function progressiveScanEdges(call) {
  let comparisons=0,rejected=0;
  const check=f=>{progressiveScanActual(call,f.raw,f.options);comparisons++;};
  const reject=(f,error,limit=67108864)=>{assert.throws(()=>call(280,progressiveScanInput(f.raw,f.options),limit),error);rejected++;};
  for(const precision of [8,12])for(const width of [1,8,9,17,33])for(const height of [1,9,17])for(const sampling of [[17],[68],[34,17,17],[33,18,17]])for(const selected of [sampling.map((_,i)=>i),[sampling.length-1]])for(const interval of [0,1,2,7])for(const kind of ['dcFirst','dcRefine','acFirst','acRefine']) {
    if(kind.startsWith('ac')&&selected.length!==1)continue;
    check(progressiveScanFixture({precision,width,height,sampling,selected,interval,kind,al:(width+height)%13}));
  }
  // Wrap all eight RST codes, include fill before RST and a short final interval.
  for(const kind of ['dcFirst','dcRefine','acFirst','acRefine'])check(progressiveScanFixture({width:257,height:8,sampling:[17],interval:3,kind}));
  const restart=progressiveScanFixture({width:16,height:8,sampling:[17],interval:1});
  for(let n=0;n<restart.raw.length;n++)reject({...restart,raw:restart.raw.subarray(0,n)},/UnexpectedEnd|InvalidJpegRestartSequence/);
  for(let code=209;code<=215;code++){const raw=Buffer.from(restart.raw);raw[2]=code;reject({...restart,raw},/InvalidJpegRestartSequence/);}
  check({...restart,raw:Buffer.from([0x7f,255,255,208,0x3f,255,217])});
  reject({...restart,options:{...restart.options,blocks:1}},/LimitExceeded/);
  reject({...restart,options:{...restart.options,restarts:0}},/LimitExceeded/);
  reject(restart,/LimitExceeded/,headerBytes+2*blockBytes-1);
  reject({...restart,options:{...restart.options,prior:restart.options.prior.slice(1)}},/InvalidJpegPriorBlockCount/);
  const simple=progressiveScanFixture({width:16,height:8,sampling:[17]});
  reject({...simple,raw:Buffer.from([0x40,255,217])},/InvalidJpegEntropyPadding/);
  reject({...simple,raw:Buffer.concat([simple.raw.subarray(0,-2),Buffer.from([255,0,255,217])])},/TrailingJpegEntropyBytes/);
  reject({...simple,raw:Buffer.concat([simple.raw.subarray(0,-2),Buffer.from([255,208])])},/InvalidJpegRestartPosition/);
  reject({...simple,options:{...simple.options,height:0}},/MissingJpegDnl/);
  const noHeight=Buffer.from(simple.options.frame);noHeight.writeUInt16BE(0,1);
  check({...simple,options:{...simple.options,frame:noHeight,height:8}});
  for(const code of [192,193,202])reject({...simple,options:{...simple.options,code}},/UnsupportedJpegProgressiveScan/);
  const ac=progressiveScanFixture({width:16,height:8,sampling:[17],kind:'acFirst'});
  check({...ac,raw:Buffer.from([0x3f,255,217]),options:{...ac.options,h:progressiveSingle(16,16)}});
  reject({...ac,raw:Buffer.from([0x7f,255,217]),options:{...ac.options,h:progressiveSingle(16,16)}},/UnfinishedJpegEobRun/);
  reject({...ac,raw:Buffer.from([0x3f,255,208,0x3f,255,217]),options:{...ac.options,interval:1,h:progressiveSingle(16,16)}},/UnfinishedJpegEobRun/);
  // Scan assembly must retain position-dependent priors and newly introduced
  // AC coefficients, not merely accept all-zero EOB-only scans.
  for(let band=1;band<=63;band++)for(const refine of [false,true]) {
    const scan=Buffer.from(ac.options.scan);scan[scan.length-3]=band;scan[scan.length-2]=band;scan[scan.length-1]=refine?16:0;
    check({...ac,raw:Buffer.concat([encodeCodes(['01','00']),Buffer.from([255,217])]),options:{...ac.options,scan,h:progressiveSingle(16,1)}});
  }
  const refinement=progressiveScanFixture({width:24,height:8,sampling:[17],kind:'acRefine'}),scan=Buffer.from(refinement.options.scan);
  scan[scan.length-2]=1;
  const prior=[-4,4,-8].map(n=>{const b=progressiveZero();b[1]=n;return b;});
  check({raw:Buffer.from([0x6f,255,217]),options:{...refinement.options,scan,prior,h:progressiveSingle(16,16)}}); // EOB3 + corrections 1,0,1
  // Maximum legal EOB run consumes an entire 32767-block scan with no more bits.
  const maxFrame=Buffer.from([8,0,248,33,8,1,9,17,0]); // 1057 columns * 31 rows.
  const maxScan=Buffer.from([1,9,0,1,63,0]),maxCount=32767;
  check({raw:Buffer.concat([encodeCodes(['0','1'.repeat(14)]),Buffer.from([255,217])]),options:{frame:maxFrame,scan:maxScan,q:ac.options.q,h:progressiveSingle(16,224),prior:Array.from({length:maxCount},progressiveZero)}});
  return {comparisons,rejected};
}

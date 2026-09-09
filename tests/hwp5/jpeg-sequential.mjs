import assert from 'node:assert/strict';
import {unstuff,huffmanCodewords,encodeCodes} from './jpeg-codec.mjs';
import {jpegFrameFixture} from './jpeg-headers.mjs';

const sized=b=>{const n=Buffer.alloc(2);n.writeUInt16LE(b.length);return Buffer.concat([n,b]);};
export function jpegSequentialInput(raw,{frame=jpegFrameFixture(),code=192,dc,ac,predictor=0,skip=0,finish=false}){
  const h=Buffer.alloc(7);h[0]=code;h[1]=+finish;h[2]=skip;h.writeInt32LE(predictor,3);
  return Buffer.concat([h,sized(frame),sized(dc),sized(ac),raw]);
}
export function jpegSequentialOracle(raw,{frame=jpegFrameFixture(),code=192,dc,ac,predictor=0,skip=0,finish=false}){
  assert.ok([192,193].includes(code));assert.ok([8,12].includes(frame[0]));
  assert.equal(dc[0]>>4,0);assert.equal(ac[0]>>4,1);
  const {text,ends}=unstuff(raw);let at=skip;assert.ok(at<=text.length);
  const read=width=>{assert.ok(at+width<=text.length);const s=text.slice(at,at+width);at+=width;return s;};
  const receive=width=>{const s=read(width);return width===0?0:s[0]==='1'?parseInt(s,2):-parseInt([...s].map(n=>n==='0'?'1':'0').join(''),2);};
  const lookup=t=>new Map(huffmanCodewords(t).map(c=>[c.bits,c.symbol]));
  const symbol=map=>{let prefix='';for(let n=0;n<16;n++){prefix+=read(1);if(map.has(prefix))return map.get(prefix);}assert.fail('invalid prefix');};
  const category=symbol(lookup(dc));assert.ok(category<=frame[0]+3);
  const values=[predictor+receive(category)];assert.ok(values[0]>=-2147483648&&values[0]<=2147483647);
  const acCodes=lookup(ac);
  while(values.length<64){
    const rs=symbol(acCodes);
    if(rs===0){while(values.length<64)values.push(0);break;}
    if(rs===240){values.push(...Array(16).fill(0));assert.ok(values.length<=64);continue;}
    const width=rs%16;assert.ok(width>=1&&width<=frame[0]+2);
    values.push(...Array(Math.floor(rs/16)).fill(0));assert.ok(values.length<64);values.push(receive(width));
  }
  let remaining=(8-at%8)%8;const offset=at?ends[Math.ceil(at/8)-1]:0;
  if(finish){assert.equal(offset,raw.length);assert.ok(/^1*$/.test(text.slice(at)));remaining=0;}
  const out=Buffer.alloc(264);out.writeUInt32LE(offset);out.writeUInt32LE(remaining,4);values.forEach((n,i)=>out.writeInt32LE(n,8+i*4));return out;
}
export function jpegSequentialActual(call,raw,options){assert.deepEqual(call(252,jpegSequentialInput(raw,options)),jpegSequentialOracle(raw,options));}
const single=(cls,symbol)=>Buffer.from([cls,1,...Array(15).fill(0),symbol]);
export function jpegSequentialEdges(call){
  let comparisons=0,rejected=0;
  const check=(raw,options)=>{jpegSequentialActual(call,raw,options);comparisons++;};
  const reject=(raw,options,error)=>{assert.throws(()=>call(252,jpegSequentialInput(raw,options)),error);rejected++;};
  const dc0=single(0,0),eob=single(16,0);
  for(const precision of [8,12]){
    const frame=jpegFrameFixture({precision}),code=193;
    for(let width=0;width<=precision+3;width++){
      const dc=single(0,width);
      for(let value=0;value<2**width;value++){
        const magnitude=width?value.toString(2).padStart(width,'0'):'';
        check(encodeCodes(['0',magnitude,'0']),{frame,code,dc,ac:eob,predictor:7,finish:true});
      }
    }
    for(let rs=0;rs<256;rs++){
      if(rs===0||rs===240)continue;
      const ac=Buffer.from([16,0,2,...Array(14).fill(0),rs,0]),width=rs%16;
      const options={frame,code,dc:dc0,ac,finish:true};
      if(width===0||width>precision+2){reject(encodeCodes(['0','00','0'.repeat(width),'01']),options,/InvalidJpegAcSymbol/);continue;}
      for(const magnitude of ['0'.repeat(width),'1'.repeat(width)])check(encodeCodes(['0','00',magnitude,'01']),options);
    }
    for(let category=precision+4;category<256;category++)reject(Buffer.from([0]),{frame,code,dc:single(0,category),ac:eob},/InvalidJpegDcCategory/);
  }
  const dc=Buffer.from([0,0,3,...Array(14).fill(0),0,1,2]);
  const ac=Buffer.from([16,0,0,4,...Array(13).fill(0),0,1,240,225]);
  for(let skip=0;skip<8;skip++){
    for(const codes of [['00','000'],['01','1','010','010','010','011','0'],['00','010','010','011','1','010']])check(encodeCodes(codes,skip),{dc,ac,skip,predictor:-19,finish:true});
  }
  reject(encodeCodes(['00','010','010','010','010']),{dc,ac},/InvalidJpegAcRun/);
  reject(encodeCodes(['01','1']),{dc,ac,predictor:2147483647},/InvalidJpegDcPredictor/);
  reject(encodeCodes(['01','0']),{dc,ac,predictor:-2147483648},/InvalidJpegDcPredictor/);
  const complete=encodeCodes(['01','1','010','010','010','011','0']);
  for(let n=0;n<complete.length;n++)reject(complete.subarray(0,n),{dc,ac},/UnexpectedEnd/);
  for(let n=0;n<9;n++)assert.throws(()=>call(252,jpegSequentialInput(complete,{dc,ac}).subarray(0,n)));
  return {comparisons,rejected};
}

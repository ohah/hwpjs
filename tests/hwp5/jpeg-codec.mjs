import assert from 'node:assert/strict';
import {huffmanFixture,jpegTablesOracle} from './jpeg-tables.mjs';
const words=ns=>{const b=Buffer.alloc(ns.length*4);ns.forEach((n,i)=>b.writeUInt32LE(n,i*4));return b;};
export function stuff(raw){return Buffer.from([...raw].flatMap(n=>n===255?[255,0]:[n]));}
export function unstuff(raw){const data=[],ends=[];for(let i=0;i<raw.length;i++){const n=raw[i];if(n===255){assert.equal(raw[++i],0);}data.push(n);ends.push(i+1);}return {text:data.map(n=>n.toString(2).padStart(8,'0')).join(''),ends};}
export function jpegCodecInput(raw,{widths=[],table=null,count=0,skip=0,finish=false}={}){
  const h=Buffer.alloc(7);h[0]=+(table!==null);h[1]=+finish;h[2]=skip;h.writeUInt32LE(table===null?widths.length:count,3);
  if(table===null)return Buffer.concat([h,Buffer.from(widths),raw]);
  const size=Buffer.alloc(2);size.writeUInt16LE(table.length);return Buffer.concat([h,size,table,raw]);
}
export function huffmanCodewords(table){
  jpegTablesOracle(1,table);
  let occupied=0,at=17;const codes=[];
  for(let length=1;length<=16;length++){
    const unit=2**(16-length);
    for(let n=0;n<table[length];n++){
      codes.push({bits:(occupied/unit).toString(2).padStart(length,'0'),symbol:table[at++]});occupied+=unit;
    }
  }
  assert.equal(at,table.length);return codes;
}
export function encodeCodes(codes,skip=0){const bits='0'.repeat(skip)+codes.join('');return stuff(Buffer.from((bits+'1'.repeat((8-bits.length%8)%8)).match(/.{8}/g)?.map(n=>parseInt(n,2))??[]));}
export function jpegCodecOracle(raw,{widths=[],table=null,count=0,skip=0,finish=false}={}){
  const {text,ends}=unstuff(raw);let at=skip;const values=[];assert.ok(at<=text.length);
  if(table===null){for(const width of widths){assert.ok(at+width<=text.length);values.push(width?parseInt(text.slice(at,at+width),2):0);at+=width;}}
  else{
    const codes=new Map(huffmanCodewords(table).map(c=>[c.bits,c.symbol]));
    for(let i=0;i<count;i++){
      let prefix='',found=false;
      for(let length=1;length<=16;length++){assert.ok(at<text.length);prefix+=text[at++];if(codes.has(prefix)){values.push(codes.get(prefix));found=true;break;}}
      assert.ok(found);
    }
  }
  let remaining=(8-at%8)%8;const offset=at?ends[Math.ceil(at/8)-1]:0;
  if(finish){assert.equal(offset,raw.length);assert.ok(/^1*$/.test(text.slice(at)));remaining=0;}
  return words([values.length,offset,remaining,...values]);
}
export function jpegCodecActual(call,raw,options={}){assert.deepEqual(call(251,jpegCodecInput(raw,options)),jpegCodecOracle(raw,options));}
export function jpegEntropyBitsActual(call,raw){
  const length=unstuff(raw).ends.length,widths=Array(Math.floor(length/4)).fill(32);
  if(length%4)widths.push(length%4*8);jpegCodecActual(call,raw,{widths,finish:true});
}
export function jpegHuffmanCodesActual(call,payload){
  for(let at=0;at<payload.length;){const size=17+payload.subarray(at+1,at+17).reduce((a,b)=>a+b,0),table=payload.subarray(at,at+size);at+=size;
    const codes=huffmanCodewords(table);if(codes.length)jpegCodecActual(call,encodeCodes(codes.map(c=>c.bits)),{table,count:codes.length,finish:true});
  }
}
export function jpegCodecEdges(call){
  let comparisons=0,rejected=0;
  const check=(raw,options={})=>{jpegCodecActual(call,raw,options);comparisons++;};
  const reject=(raw,options,error)=>{assert.throws(()=>call(251,jpegCodecInput(raw,options)),error);rejected++;check(Buffer.from([0]),{widths:[8],finish:true});};
  for(let byte=0;byte<256;byte++)for(let skip=0;skip<8;skip++)for(let width=0;width<=32;width++)check(stuff(Buffer.from([byte,255,0,165,105])),{skip,widths:[width]});
  for(let byte=0;byte<256;byte++)for(let width=1;width<=8;width++){
    const raw=stuff(Buffer.from([byte])),options={widths:[width],finish:true},mask=2**(8-width)-1;
    if((byte&mask)===mask)check(raw,options);else reject(raw,options,/InvalidJpegEntropyPadding/);
  }
  for(let length=1;length<=16;length++)for(let symbol=0;symbol<256;symbol++){
    const bits=Array(16).fill(0);bits[length-1]=1;const table=huffmanFixture(bits);table[17]=symbol;
    const raw=encodeCodes(['0'.repeat(length)]);check(raw,{table,count:1,finish:true});
  }
  const table=huffmanFixture([0,2,3,1,...Array(12).fill(0)]),codes=huffmanCodewords(table).map(c=>c.bits);
  for(let skip=0;skip<8;skip++)check(encodeCodes([...codes,...codes.slice().reverse()],skip),{table,count:codes.length*2,skip,finish:true});
  reject(Buffer.from([255,0]),{finish:true},/TrailingJpegEntropyBytes/);
  reject(Buffer.from([0]),{widths:[9]},/UnexpectedEnd/);
  for(let code=1;code<256;code++)reject(Buffer.from([0,255,code]),{skip:4,widths:[12]},/UnexpectedJpegEntropyMarker/);
  for(let width=33;width<64;width++)reject(Buffer.from([0]),{widths:[width]},/InvalidJpegBitCount/);
  const longBits=Array(16).fill(0);longBits[15]=1;const long=huffmanFixture(longBits);
  reject(Buffer.from([0]),{table:long,count:1,skip:1},/UnexpectedEnd/);
  reject(Buffer.from([255,0,255,0,255,0]),{table:long,count:1,skip:1},/InvalidJpegHuffmanCode/);
  reject(Buffer.alloc(0),{table:Buffer.alloc(17),count:1},/EmptyJpegHuffmanTable/);
  check(Buffer.alloc(0),{widths:[0],finish:true});
  return {comparisons,rejected};
}

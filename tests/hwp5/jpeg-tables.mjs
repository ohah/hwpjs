import assert from 'node:assert/strict';
const words=ns=>{const b=Buffer.alloc(4*ns.length);ns.forEach((n,i)=>b.writeUInt32LE(n,4*i));return b;};
export function jpegTablesInput(mode,raw,tables=4096,symbols=256){const b=Buffer.alloc(5);b[0]=mode;b.writeUInt16LE(tables,1);b.writeUInt16LE(symbols,3);return Buffer.concat([b,raw]);}
export function quantizationFixture(precision=0,id=0){const b=Buffer.alloc(1+64*(precision+1));b[0]=16*precision+id;for(let i=0;i<64;i++){if(precision)b.writeUInt16BE(257*i+1,1+2*i);else b[i+1]=i+1;}return b;}
export function huffmanFixture(bits=[1,1,...Array(14).fill(0)],selector=0){return Buffer.from([selector,...bits,...Array.from({length:bits.reduce((a,b)=>a+b,0)},(_,i)=>i&255)]);}
export function jpegTablesOracle(mode,raw){
  if(!raw.length)throw Error('EmptyJpegTableSegment');
  let at=0,count=0;const chunks=[];
  while(at<raw.length){
    const selector=raw[at++],hi=selector>>4,id=selector&15;
    if(hi>1||id>3)throw Error('InvalidJpegTableSelector');
    if(mode===0){
      const width=hi+1;if(at+64*width>raw.length)throw Error('UnexpectedEnd');
      const values=Buffer.alloc(128);
      for(let i=0;i<64;i++){const value=hi?raw[at]*256+raw[at+1]:raw[at];at+=width;if(value===0)throw Error('InvalidJpegQuantizationValue');values.writeUInt16LE(value,2*i);}
      chunks.push(words([id,hi,64]),values);
    }else{
      if(at+16>raw.length)throw Error('UnexpectedEnd');
      const bits=raw.subarray(at,at+16);at+=16;
      const symbols=bits.reduce((a,b)=>a+b,0);
      // Independent fixed-denominator Kraft sum, not the product's slot recurrence.
      const occupied=bits.reduce((sum,n,i)=>sum+n*2**(15-i),0);
      if(occupied>=65536)throw Error('InvalidJpegHuffmanCodeSpace');
      if(at+symbols>raw.length)throw Error('UnexpectedEnd');
      chunks.push(words([id,hi,symbols,65536-occupied,1]),bits,raw.subarray(at,at+symbols));at+=symbols;
    }
    count++;
  }
  return Buffer.concat([words([count]),...chunks]);
}
export function jpegTablesActual(call,mode,raw){assert.deepEqual(call(247,jpegTablesInput(mode,raw)),jpegTablesOracle(mode,raw));}
export function jpegTablesEdges(call){
  let comparisons=0,rejected=0;
  const check=(mode,raw,tables=4096,symbols=256)=>{assert.deepEqual(call(247,jpegTablesInput(mode,raw,tables,symbols)),jpegTablesOracle(mode,raw));comparisons++;};
  const reject=(mode,raw,error,tables=4096,symbols=256)=>{assert.throws(()=>call(247,jpegTablesInput(mode,raw,tables,symbols)),error);rejected++;check(0,quantizationFixture());};
  for(let selector=0;selector<256;selector++)for(const mode of [0,1]){
    const raw=mode?huffmanFixture():quantizationFixture((selector>>4)===1?1:0);raw[0]=selector;
    if((selector>>4)<=1&&(selector&15)<=3)check(mode,raw);else reject(mode,raw,/InvalidJpegTableSelector/);
  }
  for(const precision of [0,1]){
    const raw=quantizationFixture(precision);check(0,raw);
    for(let i=1;i<raw.length;i++)reject(0,raw.subarray(0,i),/UnexpectedEnd/);
    for(let index=0;index<64;index++){
      const bad=Buffer.from(raw);bad.fill(0,1+index*(precision+1),1+(index+1)*(precision+1));reject(0,bad,/InvalidJpegQuantizationValue/);
    }
  }
  for(let index=0;index<16;index++)for(let n=0;n<256;n++){
    const bits=Array(16).fill(0);bits[index]=n;const raw=huffmanFixture(bits);
    if(n>=2**(index+1))reject(1,raw,/InvalidJpegHuffmanCodeSpace/);else check(1,raw);
  }
  const h=huffmanFixture();for(let n=1;n<h.length;n++)reject(1,h.subarray(0,n),/UnexpectedEnd/);
  reject(1,h,/LimitExceeded/,4096,1);
  for(const mode of [0,1]){
    reject(mode,Buffer.alloc(0),/EmptyJpegTableSegment/);
    const one=mode?h:quantizationFixture();const twice=Buffer.concat([one,one]);check(mode,twice,2);reject(mode,twice,/LimitExceeded/,1);
    reject(mode,one,/LimitExceeded/,0);
  }
  const bits=Array(16).fill(0);bits[8]=255;bits[9]=2;const many=huffmanFixture(bits);
  reject(1,many,/LimitExceeded/);check(1,many,1,257);
  return {comparisons,rejected};
}

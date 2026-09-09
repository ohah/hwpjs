import assert from 'node:assert/strict';

// Decimal equations in T.871, evaluated independently of the product's
// combined integer coefficients. Epsilon only resolves exact rational ties;
// the minimum non-tie gap is much larger (at least 1 / 587000).
const q=x=>Math.min(255,Math.max(0,Math.floor(x+0.5+1e-9)));
export function jpegJfifColourOracle(bytes,mode) {
  if(mode===268)return Buffer.from(Array.from(bytes).flatMap(y=>[y,y,y]));
  assert.equal(bytes.length%3,0);const out=Buffer.alloc(bytes.length);
  for(let i=0;i<bytes.length;i+=3){
    const a=bytes[i],b=bytes[i+1],c=bytes[i+2];
    if(mode===266){const cb=b-128,cr=c-128;out[i]=q(a+1.402*cr);out[i+1]=q(a-(0.114*1.772*cb+0.299*1.402*cr)/0.587);out[i+2]=q(a+1.772*cb);}
    else {out[i]=q(0.299*a+0.587*b+0.114*c);out[i+1]=q((-0.299*a-0.587*b+0.886*c)/1.772+128);out[i+2]=q((0.701*a-0.587*b-0.114*c)/1.402+128);}
  }
  return out;
}
export function jpegJfifColourActual(call,bytes,mode){assert.deepEqual(call(mode,bytes),jpegJfifColourOracle(bytes,mode));}
export function jpegJfifColourEdges(call) {
  let comparisons=0,rejected=0,triples=0;
  const check=(b,m)=>{jpegJfifColourActual(call,b,m);comparisons++;};
  const batch=Buffer.alloc(65536*3);
  // All 256^3 input triples, both conversion directions. First coordinate is
  // constant per batch; every second/third coordinate pair occurs once.
  for(let a=0;a<256;a++){
    for(let b=0;b<256;b++)for(let c=0;c<256;c++){const at=(b*256+c)*3;batch[at]=a;batch[at+1]=b;batch[at+2]=c;}
    for(const mode of [266,267]){check(batch,mode);triples+=65536;}
  }
  check(Buffer.from(Array.from({length:256},(_,i)=>i)),268);
  for(const mode of [266,267,268]){check(Buffer.alloc(0),mode);assert.throws(()=>call(mode,Buffer.of(0,1,2),2),/LimitExceeded/);rejected++;}
  for(const mode of [266,267])for(const n of [1,2,4,5]){assert.throws(()=>call(mode,Buffer.alloc(n)),/InvalidColourTriples/);rejected++;}
  return {comparisons,rejected,triples,grayscaleSamples:256};
}

import assert from 'node:assert/strict';
import {deflateSync,inflateSync,constants} from 'node:zlib';
import {readFileSync,readdirSync} from 'node:fs';
import {signature,pngStructureEvidence} from './png-structure-evidence.mjs';

function header(bytes, info, level=0, dictionary=false) {
  const b=Buffer.from(bytes); b[0]=info*16+8;
  const flags=level*64+(dictionary?32:0);
  b[1]=flags+(31-(b[0]*256+flags)%31)%31; return b;
}
// Independent fixed Huffman bit writer: literal history, then a length=3 match.
function distanceStream(distance) {
  const bits=[];
  const little=(n,k)=>{for(let i=0;i<k;i++)bits.push((n>>i)&1);};
  const code=(n,k)=>{for(let i=k-1;i>=0;i--)bits.push((n>>i)&1);};
  little(3,3); // BFINAL=1, BTYPE=01
  for(let i=0;i<distance;i++)code(0x30+65,8);
  code(1,7); // fixed symbol 257 => length 3
  const bases=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const symbol=bases.findLastIndex(base=>base<=distance);
  code(symbol,5); little(distance-bases[symbol],symbol<4?0:(symbol>>1)-1);
  code(0,7); // end of block
  const raw=Buffer.alloc(Math.ceil(bits.length/8));bits.forEach((v,i)=>{raw[i>>3]|=v<<(i&7);});
  const valid=deflateSync(Buffer.alloc(distance+3,65));
  return Buffer.concat([valid.subarray(0,2),raw,valid.subarray(-4)]);
}

export function zlibEdges(call,cfb) {
  let accepted=0,rejected=0,actualPng=0,actualBytes=0;
  const good=(b,expected=inflateSync(b))=>{assert.deepEqual(call(127,b,expected.length),expected);accepted++;
    if(expected.length){assert.throws(()=>call(127,b,expected.length-1),/LimitExceeded/);rejected++;}};
  const bad=(b,error)=>{assert.throws(()=>call(127,b,67108864),error);rejected++;};
  const empty=deflateSync(Buffer.alloc(0));
  for(let h=0;h<65536;h++){
    const b=Buffer.from(empty); b.writeUInt16BE(h);
    if(((h>>8)&15)!==8||(h>>12)>7||h%31)bad(b,/InvalidZlibHeader/);
    else if(h&32)bad(b,/UnsupportedZlibDictionary/);
    else good(b);
  }
  const seed=Buffer.alloc(300);let state=1729;
  for(let i=0;i<seed.length;i++){state=(Math.imul(state,1664525)+1013904223)>>>0;seed[i]=state>>>24;}
  const repeated=Buffer.concat(Array.from({length:100},()=>seed));
  for(const plain of [Buffer.alloc(0),Buffer.from('abc'),Buffer.alloc(70000,65),repeated])
    for(const options of [{level:0},{strategy:constants.Z_FIXED},{level:9}]) {
      const b=deflateSync(plain,options);good(b,plain);
      // Every truncation for small vectors; every footer boundary for larger ones.
      const starts=b.length<100?0:b.length-6;
      for(let i=starts;i<b.length;i++)bad(b.subarray(0,i));
      for(let i=b.length-4;i<b.length;i++){const damaged=Buffer.from(b);damaged[i]^=1;bad(damaged,/InvalidChecksum/);}
      bad(Buffer.concat([b,Buffer.from([0])]),/TrailingData/);
      bad(Buffer.concat([b,empty]),/TrailingData/);
      for(const tail of [Buffer.alloc(0),Buffer.from([0,255,0]),empty]) {
        const input=Buffer.concat([b,tail]);const out=call(128,input,plain.length);
        assert.equal(out.readUInt32LE(0),b.length);assert.deepEqual(out.subarray(4),plain);accepted++;
      }
    }
  const fixed=distanceStream(257);good(fixed,Buffer.alloc(260,65));
  bad(header(fixed,0),/InvalidDeflate/);good(header(fixed,1));
  for(let info=0;info<8;info++) {
    const window=2**(info+8);good(header(distanceStream(window),info),Buffer.alloc(window+3,65));
    if(info<7)bad(header(distanceStream(window+1),info),/InvalidDeflate/);
  }
  const dynamic=deflateSync(repeated,{level:9});assert.equal((dynamic[2]>>1)&3,2);
  good(dynamic,repeated);bad(header(dynamic,0),/InvalidDeflate/);
  for(let info=0;info<8;info++)for(let level=0;level<4;level++)good(header(deflateSync(Buffer.from('abc')),info,level));
  bad(deflateSync(Buffer.from('abc'),{dictionary:Buffer.from('abc')}),/UnsupportedZlibDictionary/);
  const dir=new URL('../../legacy/rust/crates/hwp-core/tests/fixtures/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.hwp'))) {
    cfb.parse(readFileSync(new URL(name,dir)),{strict:true});const entry=cfb.findExact('/PrvImage');
    if(!entry)continue;const bytes=Buffer.from(entry.content);if(!bytes.subarray(0,8).equals(signature))continue;
    pngStructureEvidence(bytes);const parts=[];
    for(let p=8;p<bytes.length;){const n=bytes.readUInt32BE(p);if(bytes.toString('ascii',p+4,p+8)==='IDAT')parts.push(bytes.subarray(p+8,p+8+n));p+=12+n;}
    const compressed=Buffer.concat(parts);const expected=inflateSync(compressed);good(compressed,expected);actualPng++;actualBytes+=expected.length;
  }
  good(empty);return {accepted,rejected,actualPng,actualBytes};
}

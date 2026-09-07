import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {signature,pngChunk as chunk,pngHeader as header,png} from './png-structure-evidence.mjs';
import {passes,predict,pngPixelsEvidence} from './png-pixels-evidence.mjs';

const prefix=(raw,max=268435456)=>{const p=Buffer.alloc(4);p.writeUInt32LE(max);return Buffer.concat([p,raw]);};
function make(width,height,depth,color,interlace,filter=4) {
  const channels=({0:1,2:3,3:1,4:2,6:4})[color],stride=Math.ceil(channels*depth/8),filtered=[],restored=[];
  for(const [index,pass] of passes(width,height,interlace).entries()) {
    if(!pass.width||!pass.height)continue;let previous=null;
    for(let y=0;y<pass.height;y++) {
      const row=Buffer.from(Array.from({length:Math.ceil(pass.width*channels*depth/8)},(_,x)=>(x*71+y*113+index*31+251)%256));
      const kind=filter===5?(y+index)%5:filter;
      const encoded=Buffer.from(row.map((v,x)=>(v-predict(kind,row[x-stride]??0,previous?.[x]??0,previous?.[x-stride]??0)+256)%256));
      filtered.push(Buffer.from([kind]),encoded);restored.push(Buffer.from([kind]),row);previous=row;
    }
  }
  const data=Buffer.concat(filtered),expected=Buffer.concat(restored),h=header(depth,color,width,height,interlace);
  const palette=color===3?[chunk('PLTE',Buffer.alloc(3*(1<<depth)))]:[];
  const wrap=(stream=deflateSync(data),parts=[stream])=>png(chunk('IHDR',h),...palette,...parts.map(p=>chunk('IDAT',p)),chunk('IEND'));
  return {data,expected,wrap};
}
export function pngPixelsEdges(call,cfb) {
  let accepted=0,rejected=0,actualPng=0,actualBytes=0,actualInterlaced=0;
  const good=(raw,expected)=>{const e=pngPixelsEvidence(raw);const result=call(130,prefix(raw,e.decoded.length),raw.length);assert.deepEqual(result,e.wire);if(expected)assert.deepEqual(result.subarray(32),expected);accepted++;
    assert.throws(()=>call(130,prefix(raw,e.decoded.length-1)),/LimitExceeded/);rejected++;
    assert.throws(()=>call(130,prefix(raw),raw.length-1),/LimitExceeded/);rejected++;return e;};
  const bad=(raw)=>{assert.throws(()=>pngPixelsEvidence(raw));assert.throws(()=>call(130,prefix(raw)));rejected++;};
  const combinations=[[0,[1,2,4,8,16]],[2,[8,16]],[3,[1,2,4,8]],[4,[8,16]],[6,[8,16]]];
  for(const [color,depths] of combinations)for(const depth of depths)for(const interlace of [0,1])for(const [width,height] of [[1,1],[1,9],[9,1],[2,3],[3,2],[4,4],[5,5],[7,8],[8,7],[9,9],[17,13]])for(let filter=0;filter<=5;filter++) {
    const f=make(width,height,depth,color,interlace,filter);good(f.wrap(),f.expected);
  }
  const f=make(9,9,4,3,1,5),compressed=deflateSync(f.data);
  for(let split=0;split<=compressed.length;split++)good(f.wrap(compressed,[compressed.subarray(0,split),Buffer.alloc(0),compressed.subarray(split)]),f.expected);
  good(f.wrap(compressed,Array.from(compressed,byte=>Buffer.from([byte]))),f.expected);
  for(const extra of [Buffer.from([0,255,0]),deflateSync(Buffer.from('unused'))])good(f.wrap(Buffer.concat([compressed,extra])),f.expected);
  for(let end=0;end<compressed.length;end++)bad(f.wrap(compressed.subarray(0,end)));
  for(const data of [f.data.subarray(0,-1),Buffer.concat([f.data,Buffer.from([0])]),Buffer.from([0])])bad(f.wrap(deflateSync(data)));
  let offset=0;
  const zeroRows=[],sampleOffsets=[];
  for(const pass of passes(9,9,1))if(pass.width&&pass.height)for(let y=0;y<pass.height;y++) {
    const badFilter=Buffer.from(f.data);badFilter[offset]=255;bad(f.wrap(deflateSync(badFilter)));
    const size=1+Math.ceil(pass.width*4/8);sampleOffsets.push(offset+1);zeroRows.push(Buffer.alloc(size));offset+=size;
  }
  for(let end=0;end<f.data.length;end++)bad(f.wrap(deflateSync(f.data.subarray(0,end))));
  const zeroData=Buffer.concat(zeroRows);
  const onePalette=data=>png(chunk('IHDR',header(4,3,9,9,1)),chunk('PLTE',Buffer.alloc(3)),chunk('IDAT',deflateSync(data)),chunk('IEND'));
  good(onePalette(zeroData));
  for(const at of sampleOffsets){const invalid=Buffer.from(zeroData);invalid[at]=16;bad(onePalette(invalid));}
  const original=f.wrap();good(Buffer.concat([original.subarray(0,-12),chunk('vpAg',Buffer.from('deferred')),original.subarray(-12)]),f.expected);
  const checksum=Buffer.from(compressed);checksum[checksum.length-1]^=1;bad(f.wrap(checksum));
  const huge=png(chunk('IHDR',header(16,6,50000000,1)),chunk('IDAT',deflateSync(Buffer.alloc(0))),chunk('IEND'));
  assert.throws(()=>call(130,prefix(huge)),/LimitExceeded/);rejected++;
  // One used index versus padding bits, with a one-entry palette.
  for(const depth of [1,2,4,8])for(const interlace of [0,1]){
    const build=value=>png(chunk('IHDR',header(depth,3,1,1,interlace)),chunk('PLTE',Buffer.alloc(3)),chunk('IDAT',deflateSync(Buffer.from([0,value]))),chunk('IEND'));
    good(build((1<<(8-depth))-1));bad(build(1<<(8-depth)));
  }
  const dir=new URL('../../legacy/rust/crates/hwp-core/tests/fixtures/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.hwp'))){cfb.parse(readFileSync(new URL(name,dir)),{strict:true});const entry=cfb.findExact('/PrvImage');if(!entry)continue;const bytes=Buffer.from(entry.content);if(!bytes.subarray(0,8).equals(signature))continue;const e=good(bytes);actualPng++;actualBytes+=e.decoded.length;actualInterlaced+=bytes[28]===1?1:0;}
  good(f.wrap(),f.expected);return {accepted,rejected,actualPng,actualBytes,actualInterlaced};
}

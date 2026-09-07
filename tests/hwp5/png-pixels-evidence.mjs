import assert from 'node:assert/strict';
import {inflateSync,crc32} from 'node:zlib';
import {pngStructureEvidence} from './png-structure-evidence.mjs';
import {transparencyEvidence} from './png-transparency-evidence.mjs';

// Independent Adam7 oracle uses the specification's repeated tile, not strides.
const tile=['16462646','77777777','56565656','77777777','36463646','77777777','56565656','77777777'];
export function passes(width,height,interlace) {
  if(!interlace)return [{width,height}];
  return Array.from({length:7},(_,index)=>{
    let passWidth=0,passHeight=0;
    for(let y=0;y<Math.min(height,8);y++) {
      let count=0;
      for(let x=0;x<Math.min(width,8);x++)if(Number(tile[y][x])===index+1)count+=1+Math.floor((width-1-x)/8);
      if(count){assert.ok(passWidth===0||passWidth===count);passWidth=count;passHeight+=1+Math.floor((height-1-y)/8);}
    }
    return {width:passWidth,height:passHeight};
  });
}
export function predict(kind,a,b,c) {
  if(kind===0)return 0;if(kind===1)return a;if(kind===2)return b;if(kind===3)return Math.floor((a+b)/2);
  assert.equal(kind,4);const p=a+b-c;
  return [a,b,c].map((value,index)=>({value,index,error:Math.abs(p-value)})).sort((x,y)=>x.error-y.error||x.index-y.index)[0].value;
}
export function pngPixelsEvidence(raw) {
  const structure=pngStructureEvidence(raw);const [width,height,depth,color,interlace]=structure.fields;
  const transparency=transparencyEvidence(structure);
  const chunks=structure.chunks.filter(c=>c.name==='IDAT').map(c=>c.payload);
  const compressed=Buffer.concat(chunks);const {buffer,engine}=inflateSync(compressed,{info:true,maxOutputLength:268435456});
  const decoded=Buffer.from(buffer);const channels=({0:1,2:3,3:1,4:2,6:4})[color];const stride=Math.ceil(channels*depth/8);
  let at=0,rows=0,nonempty=0,crc=0;
  for(const pass of passes(width,height,interlace)) {
    if(!pass.width||!pass.height)continue;nonempty++;let previous=null;
    const size=Math.ceil(pass.width*channels*depth/8);
    for(let y=0;y<pass.height;y++) {
      assert.ok(at+size+1<=decoded.length);const kind=decoded[at++];assert.ok(kind<=4);
      const row=decoded.subarray(at,at+size);
      for(let x=0;x<size;x++)row[x]=(row[x]+predict(kind,row[x-stride]??0,previous?.[x]??0,previous?.[x-stride]??0))%256;
      if(color===3)for(let x=0;x<pass.width;x++){const bit=x*depth;const sample=(row[Math.floor(bit/8)]>>>(8-depth-bit%8))&((1<<depth)-1);assert.ok(sample<structure.fields[8]);}
      crc=crc32(row,crc);previous=row;at+=size;rows++;
    }
  }
  assert.equal(at,decoded.length);
  const fields=[decoded.length,rows,nonempty,compressed.length-engine.bytesWritten,crc,transparency.deferredChunks,transparency.deferredBytes,1];
  const wire=Buffer.alloc(32+decoded.length);fields.forEach((value,i)=>wire.writeUInt32LE(value,i*4));decoded.copy(wire,32);
  return {wire,decoded,fields};
}

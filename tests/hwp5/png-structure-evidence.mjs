import assert from 'node:assert/strict';
import {crc32} from 'node:zlib';
export const signature=Buffer.from([137,80,78,71,13,10,26,10]);
export function pngChunk(name,payload=Buffer.alloc(0)){
  const length=Buffer.alloc(4);length.writeUInt32BE(payload.length);const body=Buffer.concat([Buffer.from(name),payload]),crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body));return Buffer.concat([length,body,crc]);
}
export function pngHeader(depth=8,color=6,width=1,height=1,interlace=0){const b=Buffer.alloc(13);b.writeUInt32BE(width);b.writeUInt32BE(height,4);b[8]=depth;b[9]=color;b[12]=interlace;return b;}
export const png=(...chunks)=>Buffer.concat([signature,...chunks]);
// Independent big-endian Buffer reads, Node CRC32, and array-based order checks.
export function pngStructureEvidence(raw){
  assert.deepEqual(raw.subarray(0,8),signature);const chunks=[];let at=8;
  while(at<raw.length){assert.ok(raw.length-at>=12);const length=raw.readUInt32BE(at);assert.ok(length<=0x7fffffff&&length<=raw.length-at-12);const name=raw.subarray(at+4,at+8).toString('latin1');assert.match(name,/^[A-Za-z]{4}$/);const end=at+8+length;assert.equal(crc32(raw.subarray(at+4,end)),raw.readUInt32BE(end));chunks.push({name,payload:raw.subarray(at+8,end)});at=end+4;}
  assert.equal(chunks[0]?.name,'IHDR');assert.equal(chunks.at(-1)?.name,'IEND');assert.equal(chunks.filter(c=>c.name==='IHDR').length,1);assert.equal(chunks.filter(c=>c.name==='IEND').length,1);assert.equal(chunks.at(-1).payload.length,0);
  const h=chunks[0].payload;assert.equal(h.length,13);const width=h.readUInt32BE(0),height=h.readUInt32BE(4),depth=h[8],color=h[9];assert.ok(width>0&&height>0&&width<=0x7fffffff&&height<=0x7fffffff);assert.ok(({0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]})[color]?.includes(depth));assert.equal(h[10],0);assert.equal(h[11],0);assert.ok(h[12]<=1);
  const ids=chunks.map((c,i)=>c.name==='IDAT'?i:-1).filter(i=>i>=0);assert.ok(ids.length);assert.equal(ids.at(-1)-ids[0]+1,ids.length);
  const palettes=chunks.map((c,i)=>c.name==='PLTE'?i:-1).filter(i=>i>=0);assert.ok(palettes.length<=1);if(color===3)assert.equal(palettes.length,1);
  let entries=0;if(palettes.length){assert.ok([2,3,6].includes(color)&&palettes[0]<ids[0]);const size=chunks[palettes[0]].payload.length;assert.ok(size>0&&size%3===0&&size<=768);entries=size/3;if(color===3)assert.ok(entries<=2**depth);}
  const ancillary=chunks.filter(c=>!['IHDR','PLTE','IDAT','IEND'].includes(c.name));for(const c of ancillary)assert.ok(c.name.charCodeAt(0)&32);
  const fields=[width,height,depth,color,h[12],chunks.length,ids.length,ids.reduce((n,i)=>n+chunks[i].payload.length,0),entries,ancillary.length,ancillary.reduce((n,c)=>n+c.payload.length,0),ancillary.filter(c=>c.name.charCodeAt(2)&32).length,0];
  const wire=Buffer.alloc(fields.length*4);fields.forEach((n,i)=>wire.writeUInt32LE(n,i*4));return {wire,fields,chunks,maxChunk:Math.max(...chunks.map(c=>c.payload.length)),pixels:BigInt(width)*BigInt(height)};
}

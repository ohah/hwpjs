import assert from "node:assert/strict";
const sizes = [73, 74, 78];
const w = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
export const pictureRun = (call, b, layout = 1, prefix = 0) => call(74, Buffer.concat([Buffer.from([layout, prefix]), b]));
export function pictureActual(call, b, layout = 1, prefix = 0, prefixes = true) {
  const size = sizes[prefix]; assert.ok(b.length >= size);
  const canonical = Buffer.from(b.subarray(0, 73));
  const points = Array.from({length: 4}, (_, i) => [b.readInt32LE(12 + 4 * (layout ? i * 2 : i)), b.readInt32LE(12 + 4 * (layout ? i * 2 + 1 : i + 4))]);
  points.forEach(([x,y],i) => {canonical.writeInt32LE(x,12+i*8);canonical.writeInt32LE(y,16+i*8);});
  const expected = Buffer.concat([canonical,w(prefix===0?0:prefix===1?1:3),w(prefix?b[73]:0),w(prefix===2?b.readUInt32LE(74):0),w(b.length-size),b.subarray(size)]);
  assert.deepEqual(pictureRun(call,b,layout,prefix),expected);
  if(prefixes)for(let cut=0;cut<size;cut++)assert.throws(()=>pictureRun(call,b.subarray(0,cut),layout,prefix),/UnexpectedEnd/);
  assert.deepEqual(pictureRun(call,b,layout,prefix),expected);
  return {points,contrast:expected.readInt8(68),brightness:expected.readInt8(69),effect:expected[70],id:expected.readUInt16LE(71),rejected:prefixes?size:0};
}
export function pictureEdges(call) {
  let accepted=0,rejected=0;
  const base=Buffer.alloc(83);for(let i=0;i<base.length;i++)base[i]=(i*79+23)&255;
  for(const layout of [0,1])for(const prefix of [0,1,2]){
    const check=b=>{rejected+=pictureActual(call,b,layout,prefix).rejected;accepted++;};
    check(base);
    for(let at=0;at<base.length;at++)for(const value of [0,128,255]){const b=Buffer.from(base);b[at]=value;check(b);}
    for(let end=sizes[prefix];end<=base.length;end++)check(base.subarray(0,end));
    const zero=Buffer.alloc(78),out=pictureRun(call,zero,layout,prefix);
    assert.equal(out.readUInt32LE(73),prefix===0?0:prefix===1?1:3);check(zero);
  }
  for(const config of [[2,0],[255,2],[0,3],[1,255]]){assert.throws(()=>call(74,Buffer.from(config)),/InvalidMode/);rejected++;}
  for(const b of [Buffer.alloc(0),Buffer.from([0])]){assert.throws(()=>call(74,b),/UnexpectedEnd/);rejected++;}
  return {accepted,rejected};
}

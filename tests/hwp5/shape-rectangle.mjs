import assert from "node:assert/strict";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const run=(call,b,mode)=>call(58,Buffer.concat([Buffer.from([mode]),b]));
export function rectangleActual(call,b,mode=1){
  assert.ok(b.length>=33);
  const pieces=[b.subarray(0,1)],points=[];
  for(let i=0;i<4;i++){
    const x=1+4*(mode?i*2:i),y=1+4*(mode?i*2+1:i+4);
    pieces.push(b.subarray(x,x+4),b.subarray(y,y+4));points.push([b.readInt32LE(x),b.readInt32LE(y)]);
  }
  const expected=Buffer.concat([...pieces,w(b.length-33),b.subarray(33)]);
  assert.deepEqual(run(call,b,mode),expected);
  for(let n=0;n<33;n++)assert.throws(()=>run(call,b.subarray(0,n),mode),/UnexpectedEnd/);
  assert.deepEqual(run(call,b,mode),expected);
  return {round:b[0],points,extra:b.length-33,rejected:33};
}
export function rectangleEdges(call){
  let accepted=0,rejected=0;
  for(const mode of [0,1])for(let at=0;at<33;at++)for(const value of [1,128,255]){
    const b=Buffer.alloc(36);b[at]=value;b.set([0,128,255],33);rejected+=rectangleActual(call,b,mode).rejected;accepted++;
  }
  assert.throws(()=>run(call,Buffer.alloc(33),2),/InvalidMode/);rejected++;
  return {accepted,rejected};
}

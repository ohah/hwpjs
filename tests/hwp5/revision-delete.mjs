import assert from 'node:assert/strict';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const frame=(tag,level,b)=>Buffer.concat([w(tag|(level<<10)|(b.length<<20)),b]);
export function revisionDeleteEdges(call){
  const command=Buffer.from('$RevisionDelete;','utf16le');let accepted=0,rejected=0;
  const props=c=>{const n=Buffer.alloc(2);n.writeUInt16LE(c.length/2);return Buffer.concat([w(0),Buffer.from([0]),n,c,w(1)]);};
  const run=(p,id=0x25252a64,header=0x25756e6b,code=3)=>{
    const token=Buffer.alloc(16);token.writeUInt16LE(code);token.writeUInt32LE(id,2);token.writeUInt16LE(code,14);
    return call(38,Buffer.concat([w(0x05000307),frame(66,0,Buffer.alloc(24)),frame(67,1,token),frame(71,1,Buffer.concat([w(header),p]))]));
  };
  const good=props(command),expected=Buffer.concat([0,1,2,0,3,0x25252a64,0x25756e6b,2].map(w));
  const check=()=>{assert.deepEqual(run(good),expected);accepted++;};check();
  for(let cut=0;cut<good.length;cut++){assert.throws(()=>run(good.subarray(0,cut)),/UnexpectedEnd/);rejected++;check();}
  for(let at=0;at<command.length;at++)for(let bit=0;bit<8;bit++){const changed=Buffer.from(command);changed[at]^=1<<bit;assert.throws(()=>run(props(changed)),/ControlIdMismatch/);rejected++;}
  for(const c of [Buffer.concat([command,Buffer.alloc(2)]),command.subarray(0,command.length-2)]){assert.throws(()=>run(props(c)),/ControlIdMismatch/);rejected++;}
  for(const args of [[0x25256d65,0x25756e6b,3],[0x25252a64,0x25686c6b,3],[0x25252a64,0x25756e6b,2]]){assert.throws(()=>run(good,...args),/ControlIdMismatch/);rejected++;}
  check();return {accepted,rejected};
}

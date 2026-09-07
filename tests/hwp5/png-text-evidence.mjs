import assert from 'node:assert/strict';
export function keywordPrefixEvidence(b) {
  const end=b.indexOf(0);assert.ok(end>=1&&end<=79);
  const key=b.subarray(0,end);
  assert.ok([...key].every(v=>(v>=32&&v<=126)||v>=161));
  assert.ok(key[0]!==32&&key.at(-1)!==32&&!key.toString('latin1').includes('  '));
  return {key,remaining:b.subarray(end+1)};
}
export function latin1Evidence(text) {
  assert.ok(text.every(v=>v===10||(v>=32&&v<=126)||v>=160));
}
export function textEvidence({chunks}) {
  const entries=[];let keywordBytes=0,textBytes=0,payloadBytes=0;
  for(const {name,payload:b} of chunks){if(name!=='tEXt')continue;
    const {key,remaining:text}=keywordPrefixEvidence(b);latin1Evidence(text);
    entries.push({key,text});keywordBytes+=key.length;textBytes+=text.length;payloadBytes+=b.length;
  }
  return {entries,keywordBytes,textBytes,payloadBytes};
}
export function textWire(t){
  const m=t.text,head=Buffer.alloc(20);[m.entries.length,m.keywordBytes,m.textBytes,t.deferredChunks,t.deferredBytes].forEach((v,i)=>head.writeUInt32LE(v,i*4));
  return Buffer.concat([head,...m.entries.flatMap(({key,text})=>{const lengths=Buffer.alloc(8);lengths.writeUInt32LE(key.length);lengths.writeUInt32LE(text.length,4);return [lengths,key,text];})]);
}

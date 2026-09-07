import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
import {historyExpected} from './history.mjs';
import {consumeContainerStreams} from './container-report-wire.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export function historyContainerEvidence(base,model,o={}) {
  if(o.mode===0)return {wire:Buffer.concat([base,w(0)]),entries:[],decoded:0,records:0};
  const nodes=model.nodes,root=nodes.findIndex(n=>n.parent===0&&n.name.toLowerCase()==='dochistory');
  const declared=Number((Buffer.from(nodes.find(n=>n.parent===0&&n.name==='FileHeader').content).readUInt32LE(36)&64)!==0),last=nodes.find(n=>root>=0&&n.parent===root&&n.name.toLowerCase()==='historylastdoc');
  const sources=nodes.filter(n=>root>=0&&n.parent===root&&/^versionlog(?:0|[1-9][0-9]*)$/i.test(n.name)).map(n=>({n,index:Number(n.name.slice(10))})).sort((a,b)=>a.index-b.index);
  let decoded=0,records=0;
  const entries=sources.map(({n,index})=>{
    assert.ok(index<=0xffffffff&&n.kind===2);
    const b=o.mode===1?Buffer.from(n.content):inflateRawSync(n.content),r=historyExpected(b,1+(o.start??1)+(o.date??1)*2);
    const report=Array.from({length:12},(_,i)=>r.readUInt32LE(8+i*4));decoded+=b.length;records+=report[0];
    return [index,r.readUInt32LE(0),r.readUInt32LE(4),b.length,...report];
  });
  const changed=consumeContainerStreams(base,decoded,entries.length);
  const header=[1,Number(root>=0),declared,Number(!!last),last?.content.length??0,decoded,records,entries.length];
  return {wire:Buffer.concat([changed,...header.map(w),...entries.flat().map(w)]),entries,decoded,records};
}

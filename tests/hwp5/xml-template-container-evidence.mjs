import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
import {consumeContainerStreams} from './container-report-wire.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
export function xmlTemplateContainerEvidence(base,model,mode) {
  if(mode===0)return {wire:Buffer.concat([base,w(0)]),decoded:0};
  const nodes=model.nodes,root=nodes.findIndex(n=>n.parent===0&&n.name.toLowerCase()==='xmltemplate');
  const header=nodes.find(n=>n.parent===0&&n.name.toLowerCase()==='fileheader');
  const declared=Number((Buffer.from(header.content).readUInt32LE(36)&32)!==0);
  let decoded=0,extra=0,consumed=0;
  const fields=['_schemaname','schema','instance'].flatMap(name=>{
    const n=nodes.find(n=>root>=0&&n.parent===root&&n.name.toLowerCase()===name);
    if(!n)return [0,0];
    assert.equal(n.kind,2);
    const b=mode===1?Buffer.from(n.content):inflateRawSync(n.content),units=b.readUInt32LE(0);
    assert.ok(4+units*2<=b.length);decoded+=b.length;extra+=b.length-4-units*2;consumed++;
    return [1,units];
  });
  const changed=consumeContainerStreams(base,decoded,consumed);
  return {wire:Buffer.concat([changed,...[1,Number(root>=0),declared,decoded,extra,...fields].map(w)]),decoded};
}

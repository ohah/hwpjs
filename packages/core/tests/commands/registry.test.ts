import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandRegistry } from '../../src/commands/registry.ts';
import { createCommand } from '../../src/commands/commands.ts';
import { copyOwned } from '../../src/state/owned.ts';
test('priority ties use registration order, captured handler set survives unregister and payloads are isolated',()=>{
 const r=new CommandRegistry(),command=createCommand<{data:Uint8Array}>('x');const trace:number[]=[];let off=()=>{};
 r.register(command,p=>{p.data[0]=9;trace.push(1);off();r.register(command,()=>{trace.push(4);return true;},0);return false;},10);
 off=r.register(command,p=>{trace.push(p.data[0]);return false;},10);r.register(command,()=>{trace.push(3);return true;},0);
 const handlers=r.capture(command);assert.equal(r.run(handlers,{data:new Uint8Array([2])},copyOwned),true);assert.deepEqual(trace,[1,2,3]);
});

test('syntactically async command handler is rejected before its body can enqueue side effects',()=>{
 const r=new CommandRegistry(),command=createCommand<null>('async');let called=false;
 r.register(command,(async()=>{called=true;return true;}) as any,0);
 assert.throws(()=>r.run(r.capture(command),null,copyOwned),/AsyncCommandHandler/);assert.equal(called,false);
});

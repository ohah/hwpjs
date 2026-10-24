import test from 'node:test';
import assert from 'node:assert/strict';
import { CancellationFence, interruptible } from '../../src/scheduler/cancellation.ts';
test('successful barriers unsubscribe; abort is idempotent and releases all subscribers',async()=>{
 const fence=new CancellationFence();for(let i=0;i<100;i++){assert.equal(await interruptible(Promise.resolve(i),[{fence,error:'Detached'}]),i);assert.equal(fence.subscriberCount,0);}
 const aborted=interruptible(new Promise<void>(()=>{}),[{fence,error:'Detached'}]);assert.equal(fence.subscriberCount,1);fence.cancel();fence.cancel();await assert.rejects(aborted,/Detached/);assert.equal(fence.subscriberCount,0);
 await assert.rejects(interruptible(Promise.resolve(1),[{fence,error:'Detached'}]),/Detached/);
});

import assert from 'node:assert/strict';
import {chartObservedContentsSmoke} from './chart-observed-contents-smoke.mjs';
// Verify that the comparator itself rejects traps and corrupted returned data.
export async function chartObservedContentsGuards(call){
 let exceptions=0,corruptions=0;
 for(const ErrorType of [WebAssembly.RuntimeError,TypeError,RangeError]){
  let calls=0;
  await assert.rejects(chartObservedContentsSmoke((...args)=>{
   if(++calls===2)throw new ErrorType('UnexpectedChartTrailingBytes');
   return call(...args);
  }),e=>e.code==='ERR_ASSERTION');
  assert.equal(calls,2);exceptions++;
 }
 for(const at of [88,92,100,128,160,-1,-20,-80]){
  await assert.rejects(chartObservedContentsSmoke((...args)=>{
   const r=Buffer.from(call(...args)),offset=at<0?r.length+at:at;
   if(offset<0||offset>=r.length)throw new RangeError('Invalid corruption offset');
   r[offset]^=1;return r;
  }),e=>e.code==='ERR_ASSERTION');
  corruptions++;
 }
 return {exceptions,corruptions};
}

import test from "node:test";
import assert from "node:assert/strict";
import {clickCanvasInputPoint} from "../../tools/browser/canvas-input-pointer.mjs";

function driver(overrides={}) {
  const commands=[];
  const replies=[{x:12,y:34,inside:true,canvasHit:true},null,"text",{trusted:true,canvas:true},{caret:"0:2:0",text:"left 0"}];
  for(const [index,value] of Object.entries(overrides))replies[Number(index)]=value;
  return {commands,command(...args){commands.push(args);},evaluate(){assert(replies.length,"UnexpectedEval");return replies.shift();}};
}
const target={section:0,paragraph:2,text:"left 0"};
test("Canvas point uses mouse events and validates source identity",()=>{
  const d=driver();assert.deepEqual(clickCanvasInputPoint(d,target),{x:12,y:34,inside:true,canvasHit:true});
  assert.deepEqual(d.commands,[["scrollintoview","#canvas-input"],["mouse","move","12","34"],["mouse","down"],["mouse","up"]]);
});
test("covered or offscreen points never send mouse input",()=>{
  for(const point of [{x:12,y:34,inside:true,canvasHit:false},{x:12,y:34,inside:false,canvasHit:true},{x:NaN,y:34,inside:true,canvasHit:true},{x:-1,y:34,inside:true,canvasHit:true}]){
    const d=driver({0:point});assert.throws(()=>clickCanvasInputPoint(d,target),/InputPointMustHitCanvas/);assert.equal(d.commands.length,1);
  }
});
test("synthetic pointers and wrong source or text cannot pass",()=>{
  for(const overrides of [{3:{trusted:false,canvas:true}},{4:{caret:"0:3:0",text:"left 0"}},{4:{caret:"0:2:0",text:"other"}}]){
    assert.throws(()=>clickCanvasInputPoint(driver(overrides),target));
  }
});

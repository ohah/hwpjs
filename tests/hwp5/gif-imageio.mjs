// Optional third implementation: macOS ImageIO, never a product dependency.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
export function compareGifImageIo(executable,raw,reference) {
  // Do not confuse frame rasters with animation canvases or inferred palettes.
  assert.equal(reference.frames.length,1,'oracle comparison is single-frame only');
  const frame=reference.frames[0];
  assert.equal(frame.left,0);assert.equal(frame.top,0);
  assert.equal(frame.width,reference.width);assert.equal(frame.height,reference.height);
  assert.ok(frame.colors.length>0);
  const run=spawnSync(executable,[],{input:raw,maxBuffer:128*1024*1024,timeout:10000});
  if(run.error)throw run.error;
  assert.equal(run.status,0,run.stderr.toString());assert.equal(run.signal,null);
  const native=JSON.parse(run.stdout);assert.equal(native.length,1);
  assert.equal(native[0].width,frame.width);assert.equal(native[0].height,frame.height);
  const expected=Buffer.alloc(frame.indices.length*4);
  for(const [i,index]of frame.indices.entries())if(!(frame.control?.flags&1)||frame.control.transparent!==index){frame.colors.copy(expected,i*4,index*3,index*3+3);expected[i*4+3]=255;}
  assert.deepEqual(Buffer.from(native[0].rgba,'base64'),expected);
  return {pixels:frame.indices.length};
}

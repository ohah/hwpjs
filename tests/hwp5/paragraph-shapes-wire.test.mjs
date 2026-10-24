import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeParagraphShapes} from '../../js/paragraph-shapes-wire.mjs';
function wire(version=2, count=1) {
 const stride=version===1?48:72, bytes=new Uint8Array(8+stride*count),v=new DataView(bytes.buffer);
 v.setUint32(0,version===1?0x31535048:0x32535048,true);v.setUint32(4,count,true);
 for(let i=0;i<count;i++){const at=8+i*stride;v.setUint32(at,i,true);v.setUint32(at+4,3,true);v.setInt32(at+8,-120,true);v.setInt32(at+32,-160,true);if(version===2){v.setUint32(at+48,2,true);v.setUint32(at+52,65535,true);v.setUint32(at+56,7,true);v.setUint32(at+68,7,true);}}
 return bytes;
}
function set(bytes,offset,value){new DataView(bytes.buffer).setUint32(8+offset,value,true);return bytes;}
test('HPS1 retains signed values and absent modern spacing without inventing heading fields',()=>{
 const [shape]=decodeParagraphShapes(wire(1));assert.equal(shape.alignment,3);assert.equal(shape.left,-120);assert.equal(shape.legacySpacing,-160);assert.equal(shape.modernSpacing,null);assert.equal(Object.hasOwn(shape,'headingLevel'),false);
});
test('HPS2 keeps packed and extended heading levels distinct including present zero',()=>{
 const [packed]=decodeParagraphShapes(wire());assert.equal(packed.headingLevel,7);assert.equal(packed.extendedHeadingLevel,null);assert.equal(packed.headingId,65535);
 for(const level of [0,8,0xffffffff]){const bytes=wire();set(bytes,60,1);set(bytes,64,level);set(bytes,68,level);const [shape]=decodeParagraphShapes(bytes);assert.equal(shape.packedHeadingLevel,7);assert.equal(shape.extendedHeadingLevel,level);assert.equal(shape.headingLevel,level);}
 const bytes=wire();set(bytes,36,1);set(bytes,40,0xffffffff);set(bytes,44,0xffffffff);assert.deepEqual(decodeParagraphShapes(bytes)[0].modernSpacing,{attributes:0xffffffff,value:-1});
});
test('both versions accept exact empty windows and reject unknown, short, extra and excessive framing',()=>{
 for(const version of [1,2]){assert.deepEqual(decodeParagraphShapes(wire(version,0)),[]);const source=wire(version);for(const bytes of [source.subarray(0,7),source.subarray(0,source.length-1),new Uint8Array([...source,0])])assert.throws(()=>decodeParagraphShapes(bytes),/InvalidParagraphShapes/);}
 const bad=wire();new DataView(bad.buffer).setUint32(0,0x33535048,true);assert.throws(()=>decodeParagraphShapes(bad),/InvalidParagraphShapes/);
 const huge=wire();new DataView(huge.buffer).setUint32(4,100001,true);assert.throws(()=>decodeParagraphShapes(huge),/InvalidParagraphShapes/);
 assert.throws(()=>decodeParagraphShapes(new ArrayBuffer(8)),/InvalidParagraphShapes/);
});
test('reject mismatched identity, invalid enums, absent payloads and inconsistent effective heading',()=>{
 const patches=[[0,1],[4,8],[28,4],[36,2],[40,1],[44,1],[48,4],[52,65536],[56,8],[60,2],[64,1],[68,6]];
 for(const [at,value] of patches)assert.throws(()=>decodeParagraphShapes(set(wire(),at,value)),/InvalidParagraphShapes/,`field ${at}`);
 const bytes=wire();set(bytes,60,1);set(bytes,64,8);set(bytes,68,7);assert.throws(()=>decodeParagraphShapes(bytes),/InvalidParagraphShapes/);
 const shifted=new Uint8Array(wire().length+3);shifted.set(wire(),3);assert.equal(decodeParagraphShapes(shifted.subarray(3))[0].headingLevel,7);
});

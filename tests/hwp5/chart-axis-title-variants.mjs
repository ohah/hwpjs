import assert from 'node:assert/strict';
import {integer} from './chart-text-body-oracle.mjs';
// Shared mutation construction for standalone and whole-Contents checks.
// Caller supplies the independent observation of an actual null-title axis.
export function axisTitleVariants(bytes,e){
 const b=Buffer.from(bytes),middle=e.r.axis.rawFields.find(f=>f.n===24),at=middle.start+middle.n;
 assert.equal(e.r.axis.text,null);assert.equal(b.readUInt32LE(at),0xffffffff);
 const alias=Buffer.from(b);alias.writeUInt32LE(e.r.axis.fontName.id,at);
 const result=[{kind:'alias',bytes:alias}];
 const type=name=>[...e.types].find(([,v])=>v.name===name+'\0')[0];
 for(const text of [Buffer.alloc(0),Buffer.from([0xff,0x80,0x00])]){
  const value=Buffer.concat([integer(0xfffffffe),integer(type('VtString')),integer(text.length,2),text,integer(255,1),integer(type('VtValue')),integer(type('VtObject'))]);
  const changed=Buffer.concat([b.subarray(0,at),value,b.subarray(at+4)]);
  changed.writeUInt32LE(changed.length-36,32);
  result.push({kind:text.length?'raw':'empty',bytes:changed,text});
 }
 return result;
}

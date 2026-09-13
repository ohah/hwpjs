import {integer} from './chart-text-body-oracle.mjs';
// Fixed observed corpus layout; not a variable-version format recognizer.
export function gridPreludeWire(b,{typeCount=5,nameBytes=50}={}){
 return Buffer.concat([b.subarray(0,36),...[
  b.readUInt32LE(36),b.readUInt32LE(56),b.readUInt16LE(117),
  b.readUInt16LE(136),b.readUInt16LE(138),140,typeCount,nameBytes,
 ].map(n=>integer(n))]);
}

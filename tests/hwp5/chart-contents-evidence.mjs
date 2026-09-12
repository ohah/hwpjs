import {digest} from './hwp-corpus-evidence.mjs';

// Read-only observations, NOT a chart recognizer or object-graph parser.
export function observeChartContents(bytes) {
 const b=Buffer.from(bytes);
 return {
  bytes:b.length,
  sha256:digest(b),
  prefix:b.subarray(0,32).toString('hex'),
  firstWords:b.length>=16?[0,4,8,12].map(o=>b.readUInt32LE(o)):null,
  markers:Object.fromEntries(['VtChart','VtObject','VtDataGrid','VtChartTitle'].map(name=>[name,b.indexOf(Buffer.from(name+'\0'))])),
 };
}

import assert from 'node:assert/strict';
export function lastDocumentEvidence(bytes) {
  assert.equal(bytes[0],49);
  const size=bytes.readUInt32LE(1);
  assert.equal(size+5,bytes.length);
  assert.equal(size%2,0);
  return {records:1,text_units:size/2};
}

import assert from 'node:assert/strict';
// RFC 5646 registry date fields use RFC 3339 full-date, not only its shape.
export function registryDate(value){
  assert.match(value,/^\d{4}-\d{2}-\d{2}$/);
  const date=new Date(value+'T00:00:00Z');
  assert.ok(Number.isFinite(date.valueOf()));
  assert.equal(date.toISOString().slice(0,10),value);
}

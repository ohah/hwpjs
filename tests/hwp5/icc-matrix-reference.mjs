import assert from 'node:assert/strict';
function fraction(n,d=1n){
  assert.notEqual(d,0n);if(d<0n){n=-n;d=-d;}
  let a=n<0n?-n:n,b=d;while(b){[a,b]=[b,a%b];}return [n/a,d/a];
}
const subtract=(a,b)=>fraction(a[0]*b[1]-b[0]*a[1],a[1]*b[1]);
const multiply=(a,b)=>fraction(a[0]*b[0],a[1]*b[1]);
const divide=(a,b)=>fraction(a[0]*b[1],a[1]*b[0]);
// Rational row reduction with pivoting; no determinants or Cramer's rule.
export function inverseReference(matrix,xyz){
  const rows=Array.from({length:3},(_,r)=>[...matrix.slice(r*3,r*3+3),xyz[r]].map(v=>fraction(BigInt(v))));
  for(let column=0;column<3;column++){
    const pivot=rows.findIndex((r,index)=>index>=column&&r[column][0]!==0n);if(pivot<0)return null;
    [rows[column],rows[pivot]]=[rows[pivot],rows[column]];
    const scale=rows[column][column];rows[column]=rows[column].map(v=>divide(v,scale));
    for(let r=0;r<3;r++)if(r!==column){const factor=rows[r][column];rows[r]=rows[r].map((v,c)=>subtract(v,multiply(factor,rows[column][c])));}
  }
  return rows.map(r=>r[3]);
}
export function forwardReference(matrix,xyz){
  return [0,1,2].map(r=>fraction(matrix.slice(r*3,r*3+3).map((v,c)=>BigInt(v)*BigInt(xyz[c])).reduce((a,b)=>a+b,0n),1n<<32n));
}
export function checkVector(bytes,expected){
  assert.equal(bytes.length,64);
  const unsigned=o=>bytes.readBigUInt64LE(o)+(bytes.readBigUInt64LE(o+8)<<64n);
  const denominator=unsigned(48);assert.ok(denominator>0n);
  expected.forEach(([n,d],i)=>assert.equal(BigInt.asIntN(128,unsigned(i*16))*d,n*denominator));
}

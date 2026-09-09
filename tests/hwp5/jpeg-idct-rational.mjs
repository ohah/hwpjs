import assert from 'node:assert/strict';

// Independent symbolic check in Q[z]/(z^16+1), z=exp(i*pi/16).
// Each cosine is (z^k+z^-k)/2; C(0)=cos(pi/4). Multiply the
// four monomials and divide by 16, without the product's cosine basis.
export function jpegIdctRationalBlock(values) {
  assert.equal(values.length,64);
  const terms=values.flatMap((value,index)=>BigInt(value)===0n?[]:[{value:BigInt(value),u:index%8,v:Math.floor(index/8)}]);
  return Array.from({length:64},(_,position)=>{
    const x=position%8,y=Math.floor(position/8),polynomial=Array(16).fill(0n);
    for(const {value,u,v} of terms) {
      const a=u?(2*x+1)*u:4,b=v?(2*y+1)*v:4;
      for(const power of [a+b,a-b,-a+b,-a-b]) {
        const exponent=((power%32)+32)%32;
        polynomial[exponent%16]+=(exponent<16?value:-value);
      }
    }
    return polynomial.slice(1).every(value=>value===0n)?Number(polynomial[0])/16:null;
  });
}

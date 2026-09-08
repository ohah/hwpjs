import {fraction as F} from './icc-matrix-reference.mjs';
export const sign=n=>n<0n?-1:n>0n?1:0;
export const cmp=(a,b)=>sign(a[0]*b[1]-b[0]*a[1]);
export function exponent(g){let p=BigInt(g),q=65536n;while(q>1n&&p%2n===0n){p/=2n;q/=2n;}return [p,q];}
export function integerPower(x,p){const k=p<0n?-p:p;const n=x[0]**k,d=x[1]**k;return p<0n?F(d,n):F(n,d);}
export const base=(source,x)=>F(source.a*x[0]+source.b*x[1],65536n*x[1]);
export function rationalPowerOrder(z,g,target){
 const [p,q]=exponent(g);
 if((z[0]===0n&&p<=0n)||(z[0]<0n&&q>1n))throw Error('UndefinedIccCurvePower');
 if(p===0n)return cmp([1n,1n],target);
 if(q>1n&&target[0]<0n)return 1;
 return cmp(integerPower(z,p),integerPower(target,q));
}
// Full integer-power cross products; no symbolic-root or directed-bound implementation.
export function levelOrder(source,x,target){
 return rationalPowerOrder(base(source,x),source.g,F(BigInt(target)-source.offset,65536n));
}
export function valueOrder(source,x,y){const [p]=exponent(source.g);return cmp(integerPower(base(source,x),p),integerPower(base(source,y),p));}

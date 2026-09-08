import {fraction as F} from './icc-matrix-reference.mjs';
export const sign=n=>n<0n?-1:n>0n?1:0;
export const cmp=(a,b)=>sign(a[0]*b[1]-b[0]*a[1]);
export function exponent(g){let p=BigInt(g),q=65536n;while(q>1n&&p%2n===0n){p/=2n;q/=2n;}return [p,q];}
export function integerPower(x,p){const k=p<0n?-p:p;const n=x[0]**k,d=x[1]**k;return p<0n?F(d,n):F(n,d);}
export const base=(source,x)=>F(source.a*x[0]+source.b*x[1],65536n*x[1]);
// Full integer-power cross products; no symbolic-root or directed-bound implementation.
export function levelOrder(source,x,target){
 const ordinate=F(BigInt(target)-source.offset,65536n),z=base(source,x),[p,q]=exponent(source.g);
 if(p===0n)return cmp([1n,1n],ordinate);
 if(q>1n&&ordinate[0]<0n)return 1;
 return cmp(integerPower(z,p),integerPower(ordinate,q));
}
export function valueOrder(source,x,y){const [p]=exponent(source.g);return cmp(integerPower(base(source,x),p),integerPower(base(source,y),p));}

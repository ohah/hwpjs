import assert from 'node:assert/strict';
import {writeUnsigned} from './icc-wide-fraction-wire.mjs';
import {expected} from './icc-normalized-root-compare.mjs';
export function extendedRootInput(s, a, b, p, q, n, d, precision = 1024) {
  const out = Buffer.alloc(528); out.writeUInt32BE(precision); out.writeInt32BE(s, 4);
  writeUnsigned(out, 8, a, 128); writeUnsigned(out, 136, b, 128);
  out.writeInt32BE(p, 264); out.writeUInt32BE(q, 268);
  writeUnsigned(out, 272, BigInt.asUintN(1024, n), 128); writeUnsigned(out, 400, d, 128); return out;
}
export function extendedRootCompareEdges(call) {
  let comparisons = 0, rejected = 0, undecided = 0;
  function check(s, a, b, p, q, n, d, precision = 1024) {
    const out = call(222, extendedRootInput(s, a, b, p, q, n, d, precision));
    assert.equal(out.length, 4); assert.equal(out.readInt32LE(), expected(s, a, b, p, q, n, d)); comparisons++;
  }
  const max = (1n << 1024n) - 1n, half = (1n << 1023n) - 1n, A = (1n << 512n) - 1n, B = A - 2n;
  const ratios = [[1n, 3n], [A*A, B*B], [max, 1n], [1n, max], [9n << 900n, 49n << 900n]];
  const coords = [[0n, 1n], [1n, 1n], [-1n, 1n], [half, 1n], [-half-1n, 1n]];
  for (const [a,b] of ratios) for (const q of [32768,65536,131072,196608]) for (const p of [-65536,65536]) for (const s of [-1,1]) for (const [n,d] of coords) check(s,a,b,p,q,n,d);
  let seed = 0x524f4f54;
  const random = () => { let n = 0n; for (let i=0;i<32;i++) {seed=(Math.imul(seed,1664525)+1013904223)>>>0;n=(n<<32n)|BigInt(seed);} return n; };
  for(let i=0;i<128;i++) check(i%2?1:-1,random()|1n,random()|1n,i%3?-65536:65536,[32768,65536,131072,196608][i%4],BigInt.asIntN(1024,random()),random()|1n);
  for (const precision of [128,256,512,1024]) {
    check(1,A*A,B*B,65536,131072,A,B,precision);
    check(-1,A*A,B*B,-65536,131072,-B,A,precision);
    check(-1,1n,1n,65536,65536,-half-1n,1n<<1023n,precision);
    check(0,0n,0n,0,0,0n,1n,precision);
    check(0,0n,0n,0,0,-1n,max,precision);
    check(1,1n,2n,65536,131072,1n<<800n,1n,precision);
    check(1,1n,2n,65536,131072,1n,1n<<800n,precision);
  }
  const n=161733217200188571081311986634082331709n,d=228725309250740208744750893347264645481n;
  assert.equal(call(222,extendedRootInput(1,1n,2n,65536,131072,n,d,128)).readInt32LE(),2);undecided++;
  check(1,1n,2n,65536,131072,n,d,512);
  const good=extendedRootInput(1,9n,49n,65536,131072,3n,7n);
  for(let len=0;len<good.length;len++){assert.throws(()=>call(222,good.subarray(0,len)),/InvalidProbeInput/);rejected++;}
  assert.throws(()=>call(222,good,527),/LimitExceeded/);rejected++;
  assert.throws(()=>call(222,Buffer.concat([good,Buffer.alloc(1)])),/InvalidProbeInput/);rejected++;
  for(const [offset,value] of [[0,64],[4,2],[264,1],[268,0],[268,2147483649]]){
    const bad=Buffer.from(good);bad.writeUInt32BE(value,offset);assert.throws(()=>call(222,bad),/InvalidIccComparisonPrecision|InvalidProbeInput|InvalidIccPowerRoot/);rejected++;
  }
  for(const offset of [8,136,400]){const bad=Buffer.from(good);bad.fill(0,offset,offset+128);assert.throws(()=>call(222,bad),/InvalidIccPowerRoot|InvalidIccRootCoordinate/);rejected++;}
  const badZero=Buffer.from(good);badZero.writeInt32BE(0,4);assert.throws(()=>call(222,badZero),/InvalidProbeInput/);rejected++;
  check(1,9n,49n,65536,131072,3n,7n);return {comparisons,rejected,undecided};
}

import assert from 'node:assert/strict';
export function gammaInput(g,x){const b=Buffer.alloc(22);b.writeDoubleBE(x);b.write('curv',8);b.writeUInt32BE(1,16);b.writeUInt16BE(g,20);return b;}
export function paraInput(kind,values,x){const b=Buffer.alloc(20+values.length*4);b.writeDoubleBE(x);b.write('para',8);b.writeUInt16BE(kind,16);values.forEach((v,i)=>b.writeInt32BE(v,20+i*4));return b;}
// Independent Table 68 equations; compare numeric results, not implementation bytes.
function reference(kind,raw,x){const [g,a,b,c,d,e,f]=raw.map(v=>v/65536);let y;
  switch(kind){
    case 0:y=x**g;break;
    case 1:y=x < -b/a ? 0 : (a*x+b)**g;break;
    case 2:y=x < -b/a ? c : (a*x+b)**g+c;break;
    case 3:y=x < d ? c*x : (a*x+b)**g;break;
    case 4:y=x < d ? c*x+f : (a*x+b)**g+e;break;
    default:throw Error('kind');
  }
  return Math.max(0,Math.min(1,y));
}
export {reference as parametricReference};
export function iccAnalyticEdges(call){let comparisons=0,rejected=0;
  function compare(mode,b,expected){const out=call(mode,b);assert.equal(out.length,8);const actual=out.readDoubleLE();assert.ok(Number.isFinite(actual));assert.ok(Math.abs(actual-expected)<=2e-12,`${actual} != ${expected}`);comparisons++;}
  function reject(mode,b,pattern,limit=b.length){assert.throws(()=>call(mode,b,limit),pattern);rejected++;}
  for(let g=0;g<=65535;g++)for(const x of [0.125,0.5,1])compare(159,gammaInput(g,x),x**(g/256));
  const curves=[[65536],[131072,65536,-32768],[131072,65536,-32768,16384],[157286,69140,3604,5072,2651],[131072,65536,-16384,32768,32768,8192,-4096]];
  curves.forEach((values,kind)=>{for(let i=0;i<=1024;i++){const x=i/1024;compare(160,paraInput(kind,values,x),reference(kind,values,x));}});
  for(const x of [NaN,Infinity,-Infinity,-0.001,1.001]){
    reject(159,gammaInput(256,x),/InvalidIccCurveCoordinate/);
    reject(160,paraInput(0,[65536],x),/InvalidIccCurveCoordinate/);
  }
  reject(159,gammaInput(0,0),/UndefinedIccCurvePower/);
  reject(160,paraInput(1,[65536,0,0],0.5),/UndefinedIccCurveThreshold/);
  reject(160,paraInput(3,[32768,65536,-65536,65536,32768],0.5),/UndefinedIccCurvePower/);
  compare(160,paraInput(3,[32768,65536,-65536,65536,32768],0.25),0.25);
  compare(160,paraInput(0,[-2147483648],0.5),1);
  compare(160,paraInput(1,[32768,49,-1],1/49),0);
  reject(160,paraInput(3,[32768,-1,0,0,0],Number.MIN_VALUE),/UndefinedIccCurvePower/);
  const tiny=call(160,paraInput(3,[32768,1,0,0,0],Number.MIN_VALUE)).readDoubleLE();
  assert.equal(tiny,2**-545);comparisons++;
  for(const [mode,b] of [[159,gammaInput(512,0.5)],[160,paraInput(0,[65536],0.5)]]){
    for(let n=0;n<b.length;n++)reject(mode,b.subarray(0,n),/InvalidProbeInput|InvalidIcc/);
    reject(mode,b,/LimitExceeded/,b.length-1);
  }
  compare(159,gammaInput(512,0.5),0.25);
  return {comparisons,rejected};
}

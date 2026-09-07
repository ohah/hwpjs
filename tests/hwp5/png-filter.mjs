import assert from 'node:assert/strict';

// Forward filter of known original bytes; independent from in-place reconstruction.
function encode(kind,stride,row,previous) {
  return Buffer.from(row.map((byte,i)=>{
    const a=row[i-stride]??0,b=previous?.[i]??0,c=previous?.[i-stride]??0;
    const p=a+b-c;
    const nearest=[a,b,c].map((value,index)=>({value,index,error:Math.abs(p-value)}))
      .sort((x,y)=>x.error-y.error||x.index-y.index)[0].value;
    const prediction=[0,a,b,Math.floor((a+b)/2),nearest][kind];
    return (byte-prediction+256)%256;
  }));
}
function input(kind,stride,row,previous=null) {
  const h=Buffer.alloc(7);h[0]=kind;h[1]=stride;h[2]=previous===null?0:1;h.writeUInt32LE(row.length,3);
  return Buffer.concat([h,...(previous===null?[]:[previous]),row]);
}
export function pngFilterEdges(call) {
  let accepted=0,rejected=0;
  const good=(kind,stride,original,previous)=>{
    const encoded=input(kind,stride,encode(kind,stride,original,previous),previous);
    assert.deepEqual(call(129,encoded,original.length),original);accepted++;
    if(original.length){assert.throws(()=>call(129,encoded,original.length-1),/LimitExceeded/);rejected++;}
  };
  for(let kind=0;kind<5;kind++)for(let stride=1;stride<=8;stride++)for(let length=0;length<=65;length++) {
    const row=Buffer.from(Array.from({length},(_,i)=>(i*71+length*13+kind*37)%256));
    const previous=Buffer.from(Array.from({length},(_,i)=>(255-i*17+length*11)&255));
    good(kind,stride,row,previous);good(kind,stride,row,null);
  }
  // Full byte domain, all strides, with a known reconstructed previous row.
  for(let kind=0;kind<5;kind++)for(let stride=1;stride<=8;stride++){
    const row=Buffer.from(Array.from({length:768},(_,i)=>i%256));
    good(kind,stride,row,Buffer.from(row).reverse());
  }
  const row=Buffer.from([255,128,1,254,3,99]);
  for(let kind=5;kind<256;kind++){assert.throws(()=>call(129,input(kind,1,row)),/InvalidPngFilter/);rejected++;}
  for(const stride of [0,9,255]){assert.throws(()=>call(129,input(0,stride,row)),/InvalidPngFilterStride/);rejected++;}
  const sample=input(4,2,row,row);
  for(let end=0;end<sample.length;end++){assert.throws(()=>call(129,sample.subarray(0,end)));rejected++;}
  assert.throws(()=>call(129,Buffer.concat([sample,Buffer.from([0])])),/TrailingData/);rejected++;
  const badFlag=Buffer.from(sample);badFlag[2]=2;assert.throws(()=>call(129,badFlag),/InvalidMode/);rejected++;
  good(4,2,row,row);
  return {accepted,rejected};
}

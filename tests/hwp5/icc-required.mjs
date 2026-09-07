import assert from 'node:assert/strict';
function input(cls,model,white,data,pcs,names=[],edition=4){const b=Buffer.alloc(12+4*names.length);b.set([edition,cls,model,white]);b.write(data,4);b.write(pcs,8);names.forEach((n,i)=>b.write(n,12+4*i));return b;}
export function iccRequiredEdges(call){let comparisons=0,rejected=0;
  function reject(b,p,limit=b.length){assert.throws(()=>call(163,b,limit),p);rejected++;}
  const matrix=['rXYZ','gXYZ','bXYZ','rTRC','gTRC','bTRC'];
  const cases=[[0,0,'RGB ','XYZ ',['A2B0']],[1,0,'RGB ','Lab ',['A2B0','B2A0']],[2,0,'CMYK','Lab ',['A2B0','A2B1','A2B2','B2A0','B2A1','B2A2','gamt']],[2,0,'4CLR','XYZ ',['A2B0','A2B1','A2B2','B2A0','B2A1','B2A2','gamt','clrt']],[0,1,'3CLR','XYZ ',matrix],[1,1,'RGB ','XYZ ',matrix],...[0,1,2].map(c=>[c,2,'GRAY','Lab ',['kTRC']]),[3,3,'CMYK','RGB ',['pseq','A2B0']],[3,3,'4CLR','FCLR',['pseq','A2B0','clrt','clot']],[3,3,'RGB ','2CLR',['pseq','A2B0','clot']],[4,3,'RGB ','Lab ',['A2B0','B2A0']],[5,3,'Lab ','XYZ ',['A2B0']],[6,3,'RGB ','Lab ',['ncl2']]];
  for(const [cls,model,data,pcs,special] of cases)for(const white of [0,1,2]){
    const required=['desc','cprt',...(cls===3?[]:['wtpt']),...(cls!==3&&white===2?['chad']:[]),...special];
    for(let omit=-2;omit<required.length;omit++){
      const retained=required.filter((_,i)=>i!==omit).reverse();
      const names=omit===-2?[]:retained.concat(['zzzz',retained[0]]);
      const b=input(cls,model,white,data,pcs,names),out=call(163,b);assert.equal(out.length,8+required.length*8);assert.equal(out.readUInt32LE(),required.length);assert.equal(out.readUInt32LE(4),6+(cls!==3&&white===0?1:0));
      const actual=new Map();for(let o=8;o<out.length;o+=8)actual.set(out.toString('ascii',o,o+4),out.readUInt32LE(o+4));assert.equal(actual.size,required.length);
      for(const name of required)assert.equal(actual.get(name),names.includes(name)?0:1);comparisons++;
    }
  }
  for(const [cls,model,data,pcs] of [[2,1,'RGB ','XYZ '],[0,1,'RGB ','Lab '],[0,1,'CMYK','XYZ '],[1,2,'RGB ','XYZ '],[0,3,'RGB ','XYZ '],[3,0,'RGB ','XYZ '],[5,3,'RGB ','XYZ ']])reject(input(cls,model,0,data,pcs),/InvalidIccRequiredModel/);
  reject(input(0,0,0,'RGB ','RGB '),/InvalidIccPcs/);
  reject(input(0,0,0,'1CLR','XYZ '),/InvalidIccColorSpace/);
  reject(input(0,0,0,'RGB ','XYZ ',[],2),/UnsupportedIccRequiredEdition/);
  const spaces=['RGB ','CMYK',...'23456789ABCDEF'.split('').map(c=>c+'CLR')];
  for(const data of spaces)for(const pcs of spaces){
    const out=call(163,input(3,3,0,data,pcs));const expected=['desc','cprt','pseq','A2B0',...(data.endsWith('CLR')?['clrt']:[]),...(pcs.endsWith('CLR')?['clot']:[])];
    const actual=[];for(let o=8;o<out.length;o+=8){actual.push(out.toString('ascii',o,o+4));assert.equal(out.readUInt32LE(o+4),1);}assert.deepEqual(actual.sort(),expected.sort());assert.equal(out.readUInt32LE(4),6);comparisons++;
  }
  for(let cls=0;cls<7;cls++)for(let model=0;model<4;model++)if(!['0,0','0,1','1,0','1,1','2,0','3,3','4,3','6,3'].includes(`${cls},${model}`))reject(input(cls,model,0,'RGB ','XYZ '),/InvalidIccRequiredModel/);
  for(const [index,value] of [[0,0],[0,3],[1,7],[2,4],[3,3]]){const bad=input(0,0,0,'RGB ','XYZ ');bad[index]=value;reject(bad,/InvalidProbeInput/);}
  const b=input(0,0,0,'RGB ','XYZ ');for(let n=0;n<12;n++)reject(b.subarray(0,n),/InvalidProbeInput/);for(let extra=1;extra<=3;extra++)reject(Buffer.concat([b,Buffer.alloc(extra)]),/InvalidProbeInput/);
  reject(b,/LimitExceeded/,b.length-1);assert.ok(call(163,b));comparisons++;
  return {comparisons,rejected};
}

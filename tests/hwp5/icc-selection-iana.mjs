import assert from 'node:assert/strict';
import {selectionInput} from './icc-selection.mjs';

// Explicit expected outcomes, independent of the generated matching table.
export function iccSelectionIanaEdges(call) {
  let comparisons=0,rejected=0;
  const cases=[
    [['frFR','iwUS','heBU','heMM'],['HEMM'],2,0,1],
    [['frFR','iwUS','heBU','heMM'],['he'],1,0,2],
    [['frFR','moRO'],['roRO'],1,0,1],
    [['shRS'],['srRS'],0,0xffffffff,3],
    [['bhIN'],['biIN'],0,0xffffffff,3],
    [['enUK'],['enGB'],0,0,2],
    [['enAN'],['enCW'],0,0,2],
    [['zzUS'],['ZZUS'],0,0xffffffff,3],
    [['zzUS'],['zzUS'],0,0,1],
    [['\0\xff\0\xff'],['\0\xff\0\xff'],0,0,1],
    [['iwUS','koKR'],['heAU','koKR'],0,0,2],
    [['iwUS','koKR'],['frFR','heUS'],0,1,1],
  ];
  function check(locales,prefs,index,pi,reason,options) {
    const expected=Buffer.alloc(24);
    [1,index,pi,reason,1,1].forEach((v,i)=>expected.writeUInt32LE(v,i*4));
    assert.deepEqual(call(170,selectionInput(locales,prefs,options)),expected);comparisons++;
  }
  for(const c of cases)for(const stride of [12,13,16,32])for(const gap of [0,1,3])check(...c,{stride,gap});
  for(let index=0;index<64;index++){
    const locales=Array(64).fill('heUS');locales[index]='iwBU';
    check(locales,['HEMM'],index,0,1);
  }
  assert.deepEqual(call(170,selectionInput([],[])),Buffer.alloc(24));comparisons++;
  const good=selectionInput(['iwBU'],['heMM']);
  for(let n=0;n<good.length;n++){
    assert.throws(()=>call(170,good.subarray(0,n)),/InvalidProbeInput|InvalidIcc/);rejected++;
  }
  for(const input of [selectionInput(['iwBU'],[],{maxRecords:0}),selectionInput([],['he'],{maxPreferences:0})]){
    assert.throws(()=>call(170,input),/LimitExceeded/);rejected++;
  }
  check(['iwBU'],['heMM'],0,0,1);
  return {comparisons,rejected};
}

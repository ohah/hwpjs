import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {historyDateEvidence} from './history-date-evidence.mjs';
import {historyExpected,historyRun} from './history.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const date=fields=>{const b=Buffer.alloc(16);fields.forEach((v,i)=>b.writeUInt16LE(v,i*2));return b;};
const rec=(tag,b=Buffer.alloc(0))=>Buffer.concat([Buffer.from([tag]),w(b.length),b]);
const start=layout=>rec(16,layout===3?Buffer.from([2,0,1,0,0,0]):Buffer.from([1,0,0,0,2,0]));
const end=rec(17);
const base=[2004,9,4,16,14,25,45,733];
export function historyDateEdges(call) {
  let accepted=0,rejected=0,items=0;
  const check=b=>{const before=Buffer.from(b);assert.deepEqual(call(113,b),historyDateEvidence(b).wire);assert.deepEqual(b,before);accepted++;};
  check(date(base));check(Buffer.concat([date(base),Buffer.from([0,255,9])]));
  for(let n=0;n<16;n++){assert.throws(()=>call(113,date(base).subarray(0,n)),/UnexpectedEnd/);rejected++;check(date(base));}
  const values=[[0,1,1600,1601,30827,30828,65535],[0,1,2,12,13,65535],[0,4,6,7,65535],[0,1,28,29,30,31,32,65535],[0,23,24,65535],[0,59,60,65535],[0,59,60,65535],[0,999,1000,65535]];
  values.forEach((vs,i)=>vs.forEach(v=>{const f=[...base];f[i]=v;check(date(f));}));
  check(Buffer.alloc(16,255));check(Buffer.alloc(16));
  // One complete Gregorian leap/weekday cycle, independently enumerated by JS Date.
  let days=0;
  for(let t=Date.UTC(2000,0,1);t<Date.UTC(2400,0,1);t+=86400000){const d=new Date(t);check(date([d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDay(),d.getUTCDate(),23,59,59,999]));days++;}
  assert.equal(days,146097);
  for(let y=1601;y<=30827;y++)for(const day of [28,29])check(date([y,2,0,day,0,0,0,0]));
  for(const mode of [3,4]){
    const good=Buffer.concat([start(mode),rec(33,date(base)),end]);
    const item=b=>{assert.deepEqual(historyRun(call,b,mode),historyExpected(b,mode));items++;};
    item(good);
    for(let n=0;n<16;n++){
      const short=Buffer.concat([start(mode),rec(33,date(base).subarray(0,n)),end]);
      assert.throws(()=>historyRun(call,short,mode),/UnexpectedEnd/);rejected++;
      assert.deepEqual(historyRun(call,short,mode-2),historyExpected(short,mode-2));item(good);
    }
    const badCalendar=date([2023,2,3,29,0,0,0,0]),badWeekday=date([2004,9,5,16,14,25,45,733]);
    const mixed=Buffer.concat([start(mode),rec(33,date(base)),rec(33,Buffer.alloc(16,255)),rec(33,badCalendar),rec(33,Buffer.concat([badWeekday,Buffer.from([7])])),end]);
    const report=historyRun(call,mixed,mode);assert.deepEqual(report,historyExpected(mixed,mode));
    assert.deepEqual(Array.from({length:4},(_,i)=>report.readUInt32LE((10+i)*4)),[4,1,1,1]);
    assert.equal(report.readUInt32LE(7*4),1); // preserved date tail
    assert.equal(report.readUInt32LE(8*4),3); // duplicate presence
    items++;
    assert.throws(()=>historyRun(call,good,mode,2),/LimitExceeded/);rejected++;item(good);
    assert.deepEqual(historyRun(call,good,mode,3,16),historyExpected(good,mode));
  }
  return {accepted,rejected,items,calendarCycleDays:days};
}
export function historyDateActual(call,cfb) {
  const file=readFileSync(new URL('../../reference/rhwp/samples/basic/treatise sample.hwp',import.meta.url));cfb.parse(file,{strict:true});
  const expected=[[2004,9,4,16,14,25,45,733],[2004,9,4,16,14,26,20,433],[2004,9,6,18,8,32,36,8],[2004,9,6,18,8,46,24,419]],results=[];let rejected=0;
  for(let i=0;i<4;i++){
    const b=inflateRawSync(cfb.findExact('/DocHistory/VersionLog'+i).content),before=Buffer.from(b);
    const selected=historyRun(call,b,4);assert.deepEqual(selected,historyExpected(b,4));
    assert.equal(selected.readUInt32LE(4*4),0);assert.equal(selected.readUInt32LE(10*4),1);
    for(let at=0;at<b.length;){const tag=b[at],len=b.readUInt32LE(at+1),payload=b.subarray(at+5,at+5+len);if(tag===33){
      const e=historyDateEvidence(payload);assert.deepEqual(e.fields,expected[i]);assert.equal(e.mask,0);assert.equal(e.calendar,1);assert.equal(e.weekday,1);assert.deepEqual(call(113,payload),e.wire);
      for(const [field,value]of [[0,0],[1,13],[2,(expected[i][2]+1)%7],[3,0],[4,24],[5,60],[6,60],[7,1000]]){
        const changed=Buffer.from(b);changed.writeUInt16LE(value,at+5+field*2);
        assert.deepEqual(historyRun(call,changed,4),historyExpected(changed,4));
        assert.deepEqual(historyRun(call,changed,2),historyExpected(changed,2));
      }
      for(let n=0;n<16;n++){
        const short=Buffer.concat([b.subarray(0,at),rec(33,payload.subarray(0,n)),b.subarray(at+5+len)]);
        assert.throws(()=>historyRun(call,short,4),/UnexpectedEnd/);rejected++;
        assert.deepEqual(historyRun(call,short,2),historyExpected(short,2));
      }
      results.push({item:i,fields:e.fields});
    }at+=5+len;}
    assert.deepEqual(historyRun(call,b,4),selected);assert.deepEqual(b,before);
  }
  return {dates:results,rejected};
}

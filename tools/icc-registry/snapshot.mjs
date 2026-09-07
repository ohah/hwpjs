import assert from 'node:assert/strict';
import {urls} from './download.mjs';
import {issueReasons} from './inspect.mjs';
function keys(value,expected){assert.ok(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),[...expected].sort());}
function uint(value,min=0,max=0xffffffff){assert.ok(Number.isSafeInteger(value)&&value>=min&&value<=max);}
// Fail closed on unknown fields so contact columns cannot accidentally be persisted.
export function validateSnapshot(snapshot){
  keys(snapshot,['schemaVersion','sources','missingDeviceManufacturers']);assert.equal(snapshot.schemaVersion,1);assert.ok(Array.isArray(snapshot.sources));assert.equal(snapshot.sources.length,3);
  snapshot.sources.forEach((s,index)=>{
    const kind=Object.keys(urls)[index];keys(s,['url','byteLength','sha256','kind','sourceRows','entries','issues','complete']);assert.equal(s.kind,kind);assert.equal(s.url,urls[kind]);uint(s.byteLength,1,4*1024*1024);assert.match(s.sha256,/^[0-9a-f]{64}$/);uint(s.sourceRows,0,99999);
    assert.ok(Array.isArray(s.entries)&&Array.isArray(s.issues));assert.equal(s.sourceRows,s.entries.length+s.issues.length);assert.equal(s.complete,s.issues.length===0);
    s.entries.forEach((entry,i)=>{assert.ok(Array.isArray(entry));assert.equal(entry.length,kind==='device'?2:1);entry.forEach(v=>uint(v,1));if(i){const previous=s.entries[i-1];assert.ok(previous[0]<entry[0]||(previous[0]===entry[0]&&previous[1]<entry[1]));}});
    s.issues.forEach((issue,i)=>{keys(issue,['row','reason','ids']);uint(issue.row,2,s.sourceRows+1);if(i)assert.ok(issue.row>s.issues[i-1].row);assert.ok(issueReasons.includes(issue.reason));assert.ok(Array.isArray(issue.ids));assert.equal(issue.ids.length,kind==='manufacturer'?1:2);for(const id of issue.ids)assert.ok(typeof id==='string'&&id.length<=1024*1024&&!id.includes('\0'));});
  });
  const parents=new Set(snapshot.sources[1].entries.map(e=>e[0]));
  const missing=[...new Set(snapshot.sources[2].entries.filter(e=>!parents.has(e[0])).map(e=>e[0]))].sort((a,b)=>a-b);
  assert.deepEqual(snapshot.missingDeviceManufacturers,missing);return snapshot;
}

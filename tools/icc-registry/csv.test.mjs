import test from 'node:test';import assert from 'node:assert/strict';import {parseCsv} from './csv.mjs';import {inspectRegistry} from './inspect.mjs';
test('CSV quoting BOM empty fields and record endings',()=>{
  assert.deepEqual(parseCsv('\ufeffa,b\r\n"x,y","a""b"\r\n"multi\r\nline",\r\n'),[['a','b'],['x,y','a"b'],['multi\r\nline','']]);
  for(const [s,rows] of [['',[]],['\ufeff',[]],['""',[['']]],['\n',[['']]],[',',[['','']]],['a,',[['a','']]],['a\n',[['a']]],['a\n\n',[['a'],['']]]])assert.deepEqual(parseCsv(s),rows);
});
test('CSV malformed syntax and exact resource limits',()=>{
  for(const s of ['"x','a"b','"a"x','a\rb','a\0b'])assert.throws(()=>parseCsv(s));
  assert.deepEqual(parseCsv('a,b',{maxChars:3,maxRows:1,maxColumns:2,maxFieldChars:1}),[['a','b']]);
  for(const options of [{maxChars:2},{maxRows:0},{maxColumns:1},{maxFieldChars:0},{maxRows:-1},{maxChars:Infinity}])assert.throws(()=>parseCsv('a,b',options));
  assert.deepEqual(parseCsv('',{maxRows:0,maxColumns:0,maxChars:0}),[]);
});
test('CSV generated quoting round trips independent serializer',()=>{
  for(let i=0;i<256;i++){const rows=[['a,b','q"uote','\r\n',String.fromCharCode(32+i)],['',' tail ','x','y']];const encoded=rows.map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\r\n');assert.deepEqual(parseCsv(encoded),rows);}
});
test('Registry schema privacy duplicate and mismatched signature diagnostics',()=>{
  const head='Vendor,Hex value,ASCII,Date,Description\r\n';
  const report=inspectRegistry('cmm',head+"Private,41424320,'ABC',2026-01-01,secret\r\nPrivate,41424320,'ABC ',,secret\r\nPrivate,41424320,'ABD ',,secret\r\nPrivate,45584143h,'EXAC',,secret\r\n");
  assert.deepEqual(report.entries,[[0x41424320],[0x45584143]]);assert.equal(report.sourceRows,4);assert.equal(report.complete,false);
  assert.deepEqual(report.issues,[{row:3,reason:'DuplicateRegistryEntry',ids:['41424320',"'ABC '"]},{row:4,reason:'RegistrySignatureMismatch',ids:['41424320',"'ABD '"]}]);
  assert.ok(!JSON.stringify(report).includes('secret'));assert.ok(!JSON.stringify(report).includes('Private'));
  assert.throws(()=>inspectRegistry('cmm','Vendor,ASCII\n'));assert.throws(()=>inspectRegistry('cmm',head+'x,y\n'));assert.throws(()=>inspectRegistry('unknown',head));
});
test('Manufacturer and device IDs preserve spaces case and parent pairing',()=>{
  const manufacturer='ID,Company Name,First Name,Last Name,Address1,Address2,City,State,Country,Phone,Email Address,Comments\r\n';
  const m=inspectRegistry('manufacturer',manufacturer+['HP  -48502020','C-IT-432D4954','LNV-4C4E5600','FP-46502A2A','DNP-444E502E'].map(id=>[id,...Array(11).fill('private')].join(',')).join('\r\n'));
  assert.equal(m.sourceRows,5);assert.deepEqual(m.entries,[[0x432d4954],[0x48502020]]);assert.equal(m.issues.length,3);assert.equal(m.complete,false);assert.ok(!JSON.stringify(m).includes('private'));
  const device='Device ID,Manufacturer ID,Company Name,First Name,Last Name,Email Address,Model Name,Comments\r\n';
  const rows=[['TEST-54455354','HP  -48502020'],['TEST-54455354','C-IT-432D4954'],['6C9C-3643393','HP  -48502020'],['TEST-54455354','FP-46502A2A'],['TEST-54455354','HP  -48502020']];
  const d=inspectRegistry('device',device+rows.map(r=>[...r,...Array(6).fill('private')].join(',')).join('\r\n'));
  assert.deepEqual(d.entries,[[0x432d4954,0x54455354],[0x48502020,0x54455354]]);assert.deepEqual(d.issues.map(i=>i.reason),['InvalidRegistryId','RegistrySignatureMismatch','DuplicateRegistryEntry']);assert.ok(!JSON.stringify(d).includes('private'));
});
test('CSV input and schema prototype boundaries',()=>{
  for(const s of [null,undefined,Buffer.from('a')])assert.throws(()=>parseCsv(s),/InvalidCsvInput/);
  for(const kind of ['toString','__proto__','constructor'])assert.throws(()=>inspectRegistry(kind,''),/InvalidRegistryKind/);
  assert.throws(()=>parseCsv('\ufeffa',{maxChars:1}),/CsvLimitExceeded/);
  assert.throws(()=>parseCsv('"a""b"',{maxFieldChars:2}),/CsvLimitExceeded/);
  assert.deepEqual(parseCsv('"a""b"',{maxFieldChars:3}),[['a"b']]);
});

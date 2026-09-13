import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes,digest} from './hwp-corpus-evidence.mjs';

const expectedDigest='b672049cbc647c8e5ca847a2b5d5e7691ac7f3bdf9d562d979a441644f25ce4b';
const expectedSource='issue5724/2689441_wmf_contents_ole.hwp';
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
let selected;
try {
 await oleContainerSurvey((_,payload,source)=>{
  if(selected)return;
  cfb.parse(Buffer.from(payload),{strict:true});
  const entry=cfb.findExact('/CONTENTS');
  if(!entry)return;
  const bytes=Buffer.from(streamBytes(entry));
  if(digest(bytes)!==expectedDigest)return;
  assert.equal(source.name,expectedSource);
  assert.equal(source.path,'/BinData/BIN0001.OLE');
  assert.equal(source.type,2);
  assert.equal(source.extension,'OLE');
  assert.equal(source.kind,'size_prefixed');
  selected=bytes;
 });
} finally {cfb.close();}
assert(selected,'Required placeable WMF CONTENTS fixture is missing');
assert.ok(selected.length>0&&selected.length<1024*1024);
const escaped=selected.toString('hex').replace(/../g,p=>'\\x'+p);
assert.equal(createHash('sha256').update(selected).digest('hex'),expectedDigest);
process.stdout.write(`pub const bytes = "${escaped}";\npub const sha256 = "${expectedDigest}";\n`);

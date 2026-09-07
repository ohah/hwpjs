import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registryEvidence,catalog} from './bcp47-registry-evidence.mjs';
import {grandfathered} from './bcp47-evidence.mjs';
import {tables,records,expand} from '../../tools/language-registry.mjs';
export function registryEdges(call){
  let accepted=0,rejected=0;
  for(const [name,body] of Object.entries(tables(catalog)))assert.equal(readFileSync(new URL('../../src/text/bcp47/data/'+name,import.meta.url),'utf8'),body);
  assert.deepEqual(records('Contact_Email: a\n more\n%%\nIdentifier: t\n'),[{Contact_Email:['a more']},{Identifier:['t']}]);
  assert.deepEqual(expand('009..011'),['009','010','011']);
  assert.deepEqual(expand('qaz..qbb'),['qaz','qba','qbb']);
  for(const bad of ['z..a','aa..b','a..9','a..zzzzzzzz','!!!!','aa..ab..ac'])assert.throws(()=>expand(bad));
  for(const patch of [{extensions:'t t'},{extensions:'x'},{language:'a'},{script:'abc'},{region:'12'},{variant:'abcd'},{language:'qaa..qtz qaa'},{extlang:{abc:'invalid'}},{date:'bad'}])assert.throws(()=>tables({...catalog,...patch}));
  const check=(raw,maxBytes=4096,maxSubtags=512)=>{
    const bytes=Buffer.from(raw),prefix=Buffer.alloc(4);prefix.writeUInt32LE(maxSubtags);
    let expected;try{expected=registryEvidence(bytes,maxBytes,maxSubtags);}catch{}
    if(expected){assert.deepEqual(call(138,Buffer.concat([prefix,bytes]),maxBytes),expected,raw);accepted++;}
    else{assert.throws(()=>call(138,Buffer.concat([prefix,bytes]),maxBytes),undefined,raw);rejected++;}
    return !!expected;
  };
  const alphabet='abcdefghijklmnopqrstuvwxyz';
  for(const [kind,head] of [['language',''],['script','en-'],['region','en-'],['variant','en-']])for(const entry of catalog[kind].split(' '))for(const endpoint of entry.split('..'))assert.ok(check(head+endpoint));
  // Full 2/3-letter primary domain, not merely known positives.
  for(const a of alphabet)for(const b of alphabet){check(a+b);for(const c of alphabet)check(a+b+c);check('en-'+a+b);}
  for(let n=0;n<1000;n++)check('en-'+String(n).padStart(3,'0'));
  // Full 4-letter script domain includes both private range boundaries.
  for(const a of alphabet)for(const b of alphabet)for(const c of alphabet)for(const d of alphabet)check('en-'+a+b+c+d);
  for(const v of catalog.variant.split(' ')){assert.ok(check('en-'+v));assert.ok(check('EN-'+v.toUpperCase()));}
  for(const [v,p] of Object.entries(catalog.extlang)){
    assert.ok(check(p+'-'+v));assert.ok(check((p+'-'+v).toUpperCase()));
    assert.equal(check((p==='en'?'fr':'en')+'-'+v),false);
    assert.equal(check(p+'-'+v+'-'+v),false);
  }
  for(const v of '0123456789abcdefghijklmnopqrstuvwxyz')check('en-'+v+'-foobar');
  for(const v of [...grandfathered,'x-unlisted','qaa-Qaaa-QM','qtz-Qabx-XZ','en-BU','bh','en-u-zz-foobar','zh-cmn-Hans-CN-u-ca-gregory-t-en-us'])assert.ok(check(v));
  for(const v of ['en','en-Latn-US','sl-rozaj-biske-1994']){assert.equal(check(v,v.length-1),false);assert.equal(check(v,4096,v.split('-').length-1),false);assert.ok(check(v));}
  for(const v of ['','en-abcde','zzzz','zzzzz','zzzzzz','zzzzzzz','zzzzzzzz','en-u-ca-u-nu','en-1901-1901','en-abcde-x-private'])assert.equal(check(v),false);
  return {accepted,rejected};
}

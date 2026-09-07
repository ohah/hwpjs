import assert from 'node:assert/strict';
import {bcp47Evidence,grandfathered} from './bcp47-evidence.mjs';
export function bcp47Edges(call){
  let accepted=0,rejected=0,mutations=0;
  const input=(bytes,count)=>{const prefix=Buffer.alloc(4);prefix.writeUInt32LE(count);return Buffer.concat([prefix,bytes]);};
  const check=(raw,maxBytes,maxSubtags)=>{const bytes=Buffer.from(raw);maxBytes??=bytes.length;maxSubtags??=bytes.toString('latin1').split('-').length;
    let expected;try{expected=bcp47Evidence(bytes,maxBytes,maxSubtags);}catch{}
    if(expected){assert.deepEqual(call(137,input(bytes,maxSubtags),maxBytes),expected);accepted++;
      assert.throws(()=>call(137,input(bytes,maxSubtags),bytes.length-1),/LimitExceeded/);rejected++;
      assert.throws(()=>call(137,input(bytes,expected.readUInt32LE(4)-1),maxBytes),/LimitExceeded/);rejected++;
    }else{assert.throws(()=>call(137,input(bytes,maxSubtags),maxBytes));rejected++;}return expected;};
  for(const tag of grandfathered){assert.ok(check(tag));assert.ok(check(tag.toUpperCase()));for(let i=0;i<tag.length;i++){const b=Buffer.from(tag);if(b[i]>=97&&b[i]<=122)b[i]-=32;assert.ok(check(b));}}
  for(const language of ['en','abc','abcd','abcde','abcdefgh'])for(const ext of (language.length<=3?['','aaa','aaa-bbb','aaa-bbb-ccc']:['']))for(const script of ['','Latn'])for(const region of ['','US','419'])for(const variant of ['','1901','abcde-1996'])for(const extension of ['','a-foo','0-aa-u-ca-gregory','u-ca-gregory-t-en-us'])for(const privateUse of ['','x-a','x-aa-aa']){
    const tag=[language,ext,script,region,variant,extension,privateUse].filter(Boolean).join('-');assert.ok(check(tag));}
  for(const tag of ['x-a','X-a-A-12345678','en-abcde-a-abcde-abcde-x-a-a','en-a-aa-x-a-aa','en-Latn-US','sl-rozaj-biske-1994','de-CH-1901','es-419','tlh-Cyrl-AQ','ar-AE-u-nu-latn'])assert.ok(check(tag));
  for(const tag of ['', 'a','i-unknown','en_Us','en--US','-en','en-','123','abcdefghi','en-US-Latn','en-a','en-x','x','x-abcdefghi','en-aaa-bbb-ccc-ddd','abcd-aaa','en-GB-oed-x-test','en-abcde-ABCDE','de-1901-1901','en-a-aa-A-bb','en-0-aa-0-bb','en-u-ca-gregory-u-nu-latn'])assert.equal(check(tag),undefined);
  for(const base of ['en-Latn-US-1901-a-foo-x-bar','i-klingon','x-private'])for(let position=0;position<base.length;position++)for(let value=0;value<256;value++){
    const b=Buffer.from(base);b[position]=value;check(b);mutations++;}
  let seed=0xc0ffee;
  const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  const alphabet='enx-a0ZUS_1234';
  for(let i=0;i<5000;i++){const len=next()%48,bytes=Buffer.alloc(len);for(let j=0;j<len;j++)bytes[j]=alphabet.charCodeAt(next()%alphabet.length);check(bytes);mutations++;}
  const long='x-'+Array(4095).fill('a').join('-');assert.ok(check(long,long.length,4096));assert.equal(check(long,4096,4096),undefined);assert.equal(check(long,long.length,4095),undefined);
  assert.ok(check('en'));return {accepted,rejected,mutations};
}

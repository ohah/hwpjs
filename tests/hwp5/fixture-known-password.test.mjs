import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fixtureKnownPassword} from '../../tools/fixture-known-password.mjs';
test('known public password fixtures use exact content identity',()=>{
 for(const ext of ['hwp','hwpx']){
  const bytes=readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/password-12345.${ext}`),hash=createHash('sha256').update(bytes).digest('hex');
  assert.equal(fixtureKnownPassword(hash),'12345');bytes[0]^=1;assert.equal(fixtureKnownPassword(createHash('sha256').update(bytes).digest('hex')),undefined);
 }
 assert.equal(fixtureKnownPassword('93e7a62565e0f3efa4feee2812aaf518347dbbcc09d2f26a0d9385f9a4e26060'),'123456');
 for(const input of ['HWP5-password-123456.hwpx','123456','a'.repeat(64),'93E7A62565E0F3EFA4FEEE2812AAF518347DBBCC09D2F26A0D9385F9A4E26060',null,undefined,{},'../password-12345.hwp'])assert.equal(fixtureKnownPassword(input),undefined);
});

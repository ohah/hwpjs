import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {execFileSync} from '../../tools/oracle-process.mjs';

for(const flags of [[],['-O']])test(`independent field/title save oracle adversarial controls: ${flags.length?'optimized':'normal'}`,()=>{
 execFileSync('python3',[...flags,'-B',fileURLToPath(new URL('./field-title-save-oracle.test.py',import.meta.url))],{timeout:30000});
});

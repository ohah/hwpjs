import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes,digest} from './hwp-corpus-evidence.mjs';
import {titleBodyOracle} from './chart-title-body-oracle.mjs';
import {observedFixtureModule} from './chart-native-fixture-module.mjs';
const target='2e56516aabde4ff7cb73f946860e83c345d0944b0c11e0322f09b739cac1d56a';
const c=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let selected;
try{await oleContainerSurvey((_,payload)=>{
 if(selected)return;
 c.parse(Buffer.from(payload),{strict:true});const e=c.findExact('/Contents');if(!e)return;
 const b=Buffer.from(streamBytes(e));if(digest(b)!==target)return;
 const counts=titleBodyOracle(b).prior.r.series.map(s=>s.section.points.length);
 assert.deepEqual(counts,[4,4,4]);
 selected=observedFixtureModule(b,counts);
});}finally{c.close();}
assert(selected,'Required Contents fixture is missing; do not silently substitute another layout');
process.stdout.write(selected);

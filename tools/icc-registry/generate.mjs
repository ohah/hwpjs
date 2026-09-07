import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';import {createHash} from 'node:crypto';import {validateSnapshot} from './snapshot.mjs';
export function generate(snapshot){
  validateSnapshot(snapshot);
  const hash=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  let out='// Generated from registry/source.json by tools/icc-registry/generate.mjs. Do not edit.\n';
  out+=`pub const snapshot_sha256 = "${hash}";\n`;
  for(const s of snapshot.sources){const type=s.kind==='device'?'u64':'u32';
    out+=`pub const ${s.kind}_complete = ${s.complete&&(s.kind!=='device'||snapshot.missingDeviceManufacturers.length===0)};\n`;
    out+=s.entries.length?`pub const ${s.kind} = [_]${type}{\n`+s.entries.map(e=>'    0x'+(s.kind==='device'?((BigInt(e[0])<<32n)|BigInt(e[1])):BigInt(e[0])).toString(16).padStart(s.kind==='device'?16:8,'0')+',').join('\n')+'\n};\n':`pub const ${s.kind} = [_]${type}{};\n`;
  }
  return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const expected=generate(JSON.parse(readFileSync(new URL('../../src/image/icc/registry/source.json',import.meta.url),'utf8')));
  if(process.argv.length===3&&process.argv[2]==='--check'){
    if(readFileSync(new URL('../../src/image/icc/registry/data.zig',import.meta.url),'utf8')!==expected)throw Error('StaleIccRegistryData');
    console.log('ICC registry generated data matches source');
  }else if(process.argv.length===2)process.stdout.write(expected);else throw Error('Usage: node tools/icc-registry/generate.mjs [--check]');
}

import assert from 'node:assert/strict';
import {registryDate} from './language-date.mjs';
const kinds=['language','region'];
const byKey=([a],[b])=>a<b?-1:a>b?1:0;
function optional(record,key){if(!Object.hasOwn(record,key))return null;assert.equal(record[key].length,1,`duplicate ${key}`);return record[key][0];}
export function alpha2History(records){
  const out={language:{},region:{}};
  for(const r of records){const kind=optional(r,'Type'),code=optional(r,'Subtag')?.toLowerCase();if(!kinds.includes(kind)||!/^[a-z]{2}$/.test(code??''))continue;
    const deprecated=optional(r,'Deprecated'),preferred=optional(r,'Preferred-Value');if(deprecated===null&&preferred===null)continue;
    assert.ok(!Object.hasOwn(out[kind],code));if(deprecated!==null)registryDate(deprecated);
    out[kind][code]={deprecated,preferred};
  }
  for(const kind of kinds)out[kind]=Object.fromEntries(Object.entries(out[kind]).sort(byKey));
  return out;
}
export function historyTable(history,registered){
  assert.ok(history&&typeof history==='object'&&!Array.isArray(history));assert.deepEqual(Object.keys(history).sort(),[...kinds].sort());
  const declarations=[];
  for(const kind of kinds){const group=history[kind];assert.ok(group&&typeof group==='object'&&!Array.isArray(group));const lines=[];
    for(const [code,value] of Object.entries(group).sort(byKey)){
      assert.match(code,/^[a-z]{2}$/);assert.ok(registered[kind].has(code),'unregistered history key');
      assert.ok(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),['deprecated','preferred']);
      assert.ok(value.deprecated!==null||value.preferred!==null,'empty history entry');
      if(value.deprecated!==null)registryDate(value.deprecated);
      if(value.preferred!==null){assert.match(value.preferred,kind==='language'?/^[A-Za-z]{2,8}$/:/^(?:[A-Za-z]{2}|[0-9]{3})$/);assert.ok(registered[kind].has(value.preferred.toLowerCase()),'unregistered preferred value');assert.notEqual(value.preferred.toLowerCase(),code,'self preferred value');}
      lines.push(`    .{ .code = "${code}".*, .deprecated = ${JSON.stringify(value.deprecated)}, .preferred = ${JSON.stringify(value.preferred)} },`);
    }
    declarations.push(`pub const ${kind} = [_]Entry{\n${lines.join('\n')}\n};`);
  }
  return '// Generated from source.json alpha2_history. Do not edit directly.\npub const Entry = struct { code: [2]u8, deprecated: ?[]const u8, preferred: ?[]const u8 };\n'+declarations.join('\n')+'\n';
}

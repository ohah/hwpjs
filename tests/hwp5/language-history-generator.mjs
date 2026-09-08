import assert from 'node:assert/strict';
import {alpha2History,historyTable} from '../../tools/language-history.mjs';
import {records,tables,catalog as makeCatalog} from '../../tools/language-registry.mjs';
export function historyGeneratorEdges(catalog){let accepted=0,rejected=0;
  const raw='Type: language\nSubtag: aa\nDeprecated: 2024-02-29\nPreferred-Value: aaa\n%%\nType: region\nSubtag: AA\nDeprecated: 2000-02-29\n%%\nType: language\nSubtag: sh\nComments: alternatives aa, bb\n';
  const expected={language:{aa:{deprecated:'2024-02-29',preferred:'aaa'}},region:{aa:{deprecated:'2000-02-29',preferred:null}}};
  assert.deepEqual(alpha2History(records(raw)),expected);accepted++;
  const registered={language:new Set(['aa','aaa','bb']),region:new Set(['aa','bb','419'])};
  assert.ok(historyTable(expected,registered).includes('"aaa"'));accepted++;
  const preferenceOnly={language:{aa:{deprecated:null,preferred:'bb'}},region:{aa:{deprecated:null,preferred:'419'}}};
  assert.ok(historyTable(preferenceOnly,registered).includes('"419"'));accepted++;
  for(const invalid of [raw.replace('2024-02-29','2023-02-29'),raw.replace('2024-02-29','1900-02-29'),raw.replace('2024-02-29','2024-13-01'),raw.replace('Subtag: aa','Subtag: aa\nSubtag: bb'),raw.replace('Type: language','Type: language\nType: region'),raw.replace('Deprecated: 2024-02-29','Deprecated: 2024-02-29\nDeprecated: 2024-02-29'),raw.replace('Preferred-Value: aaa','Preferred-Value: aaa\nPreferred-Value: bb'),raw+'%%\nType: language\nSubtag: aa\nDeprecated: 2024-01-01\n']){
    assert.throws(()=>alpha2History(records(invalid)));rejected++;
  }
  for(const mutate of [h=>delete h.region,h=>h.region=[],h=>h.language.aa={},h=>h.language.aa={deprecated:null,preferred:null},h=>h.language.aa.preferred='zz',h=>h.language.aa.preferred='aa',h=>h.language.aa.preferred='a"',h=>h.language.aa.deprecated='2024-02-30',h=>h.language.zz=h.language.aa,h=>h.region.aa.preferred='aaa',h=>h.language.aa.extra=true]){
    const h=structuredClone(expected);mutate(h);assert.throws(()=>historyTable(h,registered));rejected++;
  }
  const source=structuredClone(catalog);source.alpha2_history.language.bh.preferred='zz';assert.throws(()=>tables(source));rejected++;
  assert.ok(tables(catalog)['alpha2_history.zig']);accepted++;
  const rawSubtags=date=>`File-Date: ${date}\n%%\nType: language\nSubtag: aa\n`;
  const rawExtensions=date=>`File-Date: ${date}\n%%\nIdentifier: t\n`;
  assert.equal(makeCatalog(rawSubtags('2000-02-29'),rawExtensions('2024-02-29')).date,'2000-02-29');accepted++;
  for(const invalid of ['2026-02-30','2014-13-01','1900-02-29','2023-02-29','2024-00-10','2024-12-32']){
    for(const field of ['date','extension_date']){assert.throws(()=>tables({...catalog,[field]:invalid}));rejected++;}
    assert.throws(()=>makeCatalog(rawSubtags(invalid),rawExtensions('2024-02-29')));rejected++;
    assert.throws(()=>makeCatalog(rawSubtags('2024-02-29'),rawExtensions(invalid)));rejected++;
  }
  return {accepted,rejected};
}

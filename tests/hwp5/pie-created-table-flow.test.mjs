import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {layoutHwp5PageContent} from '../../web/preview/hwp5-page-layout.mjs';
import {chartData} from './chart-display-wire-fixture.mjs';
import {previewHwp5ChartLayers} from '../../web/preview/hwp5-chart-layers.mjs';
import {inlineHwp5ChartIndex} from '../../web/preview/hwp5-chart-layers.mjs';
import {inlinePictureRowPlacement} from '../../web/preview/inline-picture-row-placement.mjs';
import {hwp5InlineChartFlow} from '../../web/preview/hwp5-inline-chart-flow.mjs';
const fixture=name=>JSON.parse(readFileSync(new URL('../fixtures/pie-table-flow/'+name+'-content.json',import.meta.url)));
const measure=text=>({width:text.length*8,height:16});
const layout=c=>layoutHwp5PageContent(c,measure,undefined,{oversizeInlineTablePreview:true});
for(const stage of ['before','pending','reopened']) {
 test('actual public pie '+stage+' retains physical page flow and unchanged source',()=>{
  const content=fixture(stage),before=structuredClone(content),result=layout(content);
  assert.equal(result.state,'paginated',result.error);
  assert(result.pages.length>0);assert.equal(content.pageSources[0].width,59528);
  assert.deepEqual(content,before);
 });
}
for(const stage of ['pending','reopened']) {
 test('actual '+stage+' has 25 table cells at default480 CSS px without losing chart unit2 paint boundary',()=>{
  const content=fixture(stage),result=layout(content);assert.equal(result.state,'paginated',result.error);
  assert.equal(result.boxes.length,25);
  const left=Math.min(...result.boxes.map(b=>b.x)),right=Math.max(...result.boxes.map(b=>b.x+b.width));
  assert(Math.abs(right-left-480)<1e-8);
  const index=inlineHwp5ChartIndex(content),item=[...index.values()][0];
  assert.equal(item.picture.anchorUnit,2);
  const rows=result.rows.filter(r=>r.kind==='text'&&!r.createdCell&&r.section===0&&r.paragraph===0&&r.startUnit<=2&&r.endUnit>2);
  assert.equal(rows.length,1,'UniqueProjectedChartSourceRun');
  const placement=inlinePictureRowPlacement(item,rows[0],result.rows.indexOf(rows[0]));
  assert.equal(placement.state,'placed',placement.error);
  assert(Math.abs(placement.rectangle.width-20000/75)<1e-8);
  assert.equal(placement.rectangle.height,160);
  const painted = previewHwp5ChartLayers(content,result,result.width,()=>({value:{data:chartData()}}));
  assert.equal(painted.items.length,1,JSON.stringify(painted.unavailable));
  assert.equal(painted.items[0].target.controlNode,item.picture.controlNode);
  assert.equal(painted.items[0].x,placement.rectangle.x);
  assert.equal(painted.items[0].y,placement.rectangle.y);
  assert(result.boxes.every(b=>b.y>=placement.rectangle.y+placement.rectangle.height-1e-8),'TableMustNotOverlapChart');
 });
}
test('typed qualification refuses ambiguous anchor root mismatch and floating chart',()=>{
 for(const mutate of [
  c=>c.hwp5ChartTargets.push(structuredClone(c.hwp5ChartTargets[0])),
  c=>c.hwp5ChartTargets[0].anchorUnit=1,
  c=>c.hwp5ChartTargets[0].frame.geometry.treat_as_character=false,
  c=>c.hwp5Drawings[0].componentNode++,
  c=>c.hwp5ChartTargets[0].error_name='unproved',
 ]){const c=fixture('pending');mutate(c);assert.equal(hwp5InlineChartFlow(c).state,'unavailable');assert.equal(layout(c).state,'unavailable');}
});
test('unknown control remains rejected rather than hidden by chart feed',()=>{
 const c=fixture('pending');c.paragraphs[0].text+='\ufffc';
 assert.equal(layout(c).state,'unavailable');
});

test('page geometry stays identical across actual before pending and reopened snapshots',()=>{
 const before=layout(fixture('before'));
 for(const stage of ['pending','reopened']){
  const result=layout(fixture(stage));assert.equal(result.state,'paginated',result.error);
  assert.equal(result.pages.length,before.pages.length);
  assert.deepEqual(result.pages,before.pages);
  assert(!result.rows.some(r=>r.kind==='meta'));
 }
});

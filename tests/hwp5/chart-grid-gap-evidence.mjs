import assert from 'node:assert/strict';

// Fixed paired fixtures only. This regex extraction is not an OOXML parser.
export function chartGridGapEvidence(xml, grid){
 const series=[...xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)].map(m=>m[1]);
 assert.equal(series.length,grid.rows-1);
 const emptyIndex=series.length-2,lastIndex=series.length-1;
 assert.ok(series[emptyIndex].includes(`<c:tx><c:v>계열 ${emptyIndex+2}</c:v></c:tx>`));
 assert.ok(!series[emptyIndex].includes('<c:val>'));
 assert.ok(series[lastIndex].includes('<c:v>종가</c:v>'));
 const values=series[lastIndex].match(/<c:val>([\s\S]*?)<\/c:val>/)?.[1];
 assert.ok(values);
 assert.deepEqual([...values.matchAll(/<c:v>([^<]+)<\/c:v>/g)].map(m=>Number(m[1])),[32,35,34,35]);
 const emptyRow=(emptyIndex+1)*grid.columns,lastRow=(lastIndex+1)*grid.columns;
 assert.deepEqual(grid.cells.slice(emptyRow+1,emptyRow+5).map(c=>c.kind),[0,0,0,0]);
 assert.equal(grid.cells[lastRow].raw.toString('hex'),'c1beb0a1000085c800ac0000');
 assert.deepEqual(grid.cells.slice(lastRow+1,lastRow+5).map(c=>c.raw.readDoubleLE()),[32,35,34,35]);
}

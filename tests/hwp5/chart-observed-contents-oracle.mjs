import {titleBodyOracle,titleBodyWire} from './chart-title-body-oracle.mjs';
import {seriesCollectionWire} from './chart-series-collection-oracle.mjs';
import {observeChartTail} from './chart-tail-evidence.mjs';
import {chartGridCellsOracle} from './chart-grid-cells-oracle.mjs';
import {chartAxisContext} from './chart-axis-context.mjs';
import {integer} from './chart-text-body-oracle.mjs';
// Independent observed layout, not automatic format recognition.
export function observedContentsCase(b){
 const title=titleBodyOracle(b),tail=observeChartTail(b,title.end,title.r.types,title.r.objects),grid=chartGridCellsOracle(b),light=chartAxisContext(b).plot;
 const counts=title.prior.r.series.map(s=>s.section.points.length),stored=[...title.r.strings.values()].reduce((n,s)=>n+s.hex.length/2,0);
 const input=(bytes=b,max=tail.objects.size)=>Buffer.concat([...[max,4,2,counts.length,...counts].map(n=>integer(n)),bytes]);
 const scope={types:tail.types,objects:tail.objects,strings:title.r.strings};
 const wire=Buffer.concat([...[tail.end,tail.types.size,tail.objects.size,stored,4,2,counts.length,counts.reduce((a,b)=>a+b,0),light.sources.length].map(n=>integer(n)),b.subarray(grid.end,grid.end+26),Buffer.from(tail.raw26,'hex'),seriesCollectionWire(title.prior.r,scope),titleBodyWire(title.prior.r.title.id,title.r,scope)]);
 return {title,tail,input,wire};
}

import {titleBodyOracle,titleBodyWire} from './chart-title-body-oracle.mjs';
import {seriesCollectionWire} from './chart-series-collection-oracle.mjs';
import {observeChartTail} from './chart-tail-evidence.mjs';
import {chartGridCellsOracle,gridCellsWire} from './chart-grid-cells-oracle.mjs';
import {chartAxisContext} from './chart-axis-context.mjs';
import {integer} from './chart-text-body-oracle.mjs';
import {axesOracle,axisWire} from './chart-axes-oracle.mjs';
import {nullableTitleOracle} from './chart-nullable-title-oracle.mjs';
import {lightWire} from './chart-light-wire.mjs';
import {lineItemsOracle,lineItemsWire} from './chart-line-items-oracle.mjs';
import {postLineWire} from './chart-post-line-oracle.mjs';
import {plotSurfaceWire} from './chart-plot-surface-wire.mjs';
import {observeSurfacePrefix} from './chart-surface-evidence.mjs';
import {tailWire} from './chart-tail-wire.mjs';
import {gridPreludeWire} from './chart-grid-prelude-wire.mjs';
import {chartFootnoteOracle} from './chart-footnote-oracle.mjs';
import {chartLegendOracle,legendWire} from './chart-legend-oracle.mjs';
import {chartBackdropOracle} from './chart-backdrops.mjs';
import {typeTableWire} from './chart-type-table-wire.mjs';
import {objectTableWire} from './chart-object-table-wire.mjs';
// Independent observed layout, not automatic format recognition.
export function observedContentsCase(b,{seriesCount}={}){
 const title=titleBodyOracle(b,seriesCount),tail=observeChartTail(b,title.end,title.r.types,title.r.objects),grid=chartGridCellsOracle(b),light=chartAxisContext(b).plot;
 const counts=title.prior.r.series.map(s=>s.section.points.length),stored=[...title.r.strings.values()].reduce((n,s)=>n+s.hex.length/2,0);
 const input=(bytes=b,max=tail.objects.size)=>Buffer.concat([...[max,4,2,counts.length,...counts].map(n=>integer(n)),bytes]);
 const scope={types:tail.types,objects:tail.objects,strings:title.r.strings};
 const axes=axesOracle(b),secondary=nullableTitleOracle(b);
 const prefix=Buffer.concat([...[tail.end,tail.types.size,tail.objects.size,stored,4,2,counts.length,counts.reduce((a,b)=>a+b,0),light.sources.length].map(n=>integer(n)),b.subarray(grid.end,grid.end+26),Buffer.from(tail.raw26,'hex'),seriesCollectionWire(title.prior.r,scope),titleBodyWire(title.prior.r.title.id,title.r,scope)]);
 const axisParts=[...axes.rows.map(row=>axisWire(row.result,tail.objects.size,stored)),axisWire(secondary.r,tail.objects.size,stored)];
 const lines=lineItemsOracle(b),postLine=title.prior.prior.r;
 const surface=observeSurfacePrefix(b,axes.end,axes.rows.at(-1).result.types);
 const plotPart=plotSurfaceWire({end:light.lightStart,id:light.id,array:{...light.initialArray,end:light.initialArray.headerEnd},raws:[Buffer.from(light.raw136,'hex')]},tail.types.size,tail.objects.size);
 const surfacePart=plotSurfaceWire({end:surface.end,id:surface.objectId,array:surface.array,raws:[Buffer.from(surface.raw30,'hex'),Buffer.from(surface.raw46,'hex')]},tail.types.size,tail.objects.size);
 const boundaries=[tail.list.end,tail.window.end,light.sourcesArray.headerEnd,...title.prior.r.series.flatMap(s=>[s.section.end,s.suffix.end])];
 const nameBytes=[...tail.types.values()].reduce((n,d)=>n+Buffer.byteLength(d.name,'latin1'),0);
 const footnote=chartFootnoteOracle(b),legend=chartLegendOracle(b);
 const prefixEnds=[footnote.end,footnote.bases.at(-1),legend.end,legend.references.at(-1),legend.end];
 const transition=chartBackdropOracle(b,grid.end);
 const wire=Buffer.concat([prefix,...axisParts,lightWire(light,tail.objects.size),lineItemsWire(lines.rows,lines.word,lines.end,tail.types.size,tail.objects.size),postLineWire(postLine,tail.types.size,tail.objects.size),plotPart,surfacePart,tailWire(tail),...boundaries.map(n=>integer(n)),gridCellsWire(grid,tail.types.size),gridPreludeWire(b,{typeCount:tail.types.size,nameBytes}),footnote.wire,legendWire(legend,tail.objects.size,stored),...prefixEnds.map(n=>integer(n))]);
 // The Footnote oracle consumes two inline Strings and asserts null auxiliary.
 const footnoteFlags=[1,1,0].map(n=>integer(n));
 return {title,tail,input,wire:Buffer.concat([wire,transition.wire,integer(transition.end),typeTableWire(tail.types),objectTableWire(tail.objects,title.r.strings,secondary.r.numbers),...footnoteFlags]),axes,secondary,light,lines,postLine,surface,grid,footnote,legend,transition};
}

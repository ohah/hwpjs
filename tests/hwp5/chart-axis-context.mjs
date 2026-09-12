import {chartFootnoteOracle} from './chart-footnote-oracle.mjs';
import {chartLegendOracle} from './chart-legend-oracle.mjs';
import {observePlotPrefix} from './chart-plot-evidence.mjs';
// Scope at Axis START, not after the next declaration observed by Plot.
export function chartAxisContext(b){
 const footnote=chartFootnoteOracle(b),legend=chartLegendOracle(b),types=new Map([...footnote.block.types].map(([id,name])=>[id,{name,version:name==='VtChart\0'?6:name==='VtTextBlock\0'?2:1}]));
 for(const d of legend.declarations){const n=b.readUInt16LE(d.nameOffset-2);types.set(b.readUInt32LE(d.idOffset),{name:b.subarray(d.nameOffset,d.nameOffset+n).toString('latin1'),version:b.readUInt16LE(d.versionOffset)});}
 const plot=observePlotPrefix(b,legend.end,types);for(const d of plot.declarations)if(d.at<plot.end)types.set(d.id,{name:d.name,version:d.version});
 const value=s=>({hex:s.bytes.toString('hex'),trailer:s.trailer,lengthOffset:s.lengthOffset,payloadOffset:s.payloadOffset,trailerOffset:s.trailerOffset});
 const strings=new Map(legend.priorStrings.map(s=>[s.id,value(s)]));strings.set(legend.nameId,value(legend.name));
 return {legend,plot,types,strings};
}

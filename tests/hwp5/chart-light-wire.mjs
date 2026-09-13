import {integer} from './chart-text-body-oracle.mjs';
// Shared independent wire from observed Plot/Light fields, not product output.
export function lightWire(e,objects){
 return Buffer.concat([...[e.end,e.lightId,e.sourcesArray.id,e.sourcesArray.first,e.sourcesArray.second,e.sources.length,objects].map(n=>integer(n)),Buffer.from(e.lightRaw10,'hex'),
  ...e.sources.map(s=>Buffer.concat([...[s.id,s.start,s.end].map(n=>integer(n)),Buffer.from(s.raw16,'hex')]))]);
}

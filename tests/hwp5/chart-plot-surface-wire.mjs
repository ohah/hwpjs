import {integer} from './chart-text-body-oracle.mjs';
export function plotSurfaceWire({end,id,array,raws},typeCount,objectCount){
 return Buffer.concat([...[end,typeCount,objectCount,id,array.id,array.end].map(n=>integer(n)),integer(array.first,2),integer(array.second,2),...raws]);
}

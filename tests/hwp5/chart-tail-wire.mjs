import {integer} from './chart-text-body-oracle.mjs';
export function tailWire(r,typeCount=r.types.size,objectCount=r.objects.size){
 return Buffer.concat([...[r.end,typeCount,objectCount,r.list.id,r.list.end].map(n=>integer(n)),integer(r.list.collection.word,2),Buffer.from(r.raw26,'hex'),integer(r.window.rawWord,2)]);
}

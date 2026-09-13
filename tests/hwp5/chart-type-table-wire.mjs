import {integer} from './chart-text-body-oracle.mjs';
// Independent observed declarations, sorted numerically by unsigned ID.
export function typeTableWire(types){
 const entries=[...types].sort(([a],[b])=>a-b);
 return Buffer.concat([integer(entries.length),...entries.flatMap(([id,value])=>{
  const name=Buffer.from(value.name,'latin1');
  return [integer(id),integer(value.version,2),integer(name.length),name];
 })]);
}

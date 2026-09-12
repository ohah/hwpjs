import {chartGridCellsOracle} from './chart-grid-cells-oracle.mjs';
export const integer=(n,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);return b;};
export function valueObjectsOracle(b){
 const g=chartGridCellsOracle(b),count=g.cells.filter(c=>c.kind!==0).length;
 const wire=Buffer.concat([
  ...[g.rows,g.columns,g.cells.length,g.end,g.typeCount,count,g.stringBytes].map(n=>integer(n)),
  ...g.cells.map(c=>Buffer.concat([...[c.id,c.kind,c.start,c.end,c.trailer,c.raw.length,c.kind?1:0,0,c.kind?4:0].map(n=>integer(n)),c.raw,c.raw])),
 ]);
 return {...g,count,wire};
}

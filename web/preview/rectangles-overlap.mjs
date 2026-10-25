// Half-open rectangles: ignore only arithmetic roundoff of the computed edges,
// not a fixed layout/pixel tolerance or source-format size difference.
export function rectanglesOverlap(a,b){
  const positive=(a0,a1,b0,b1)=>Math.min(a1,b1)-Math.max(a0,b0)
    >4*Number.EPSILON*Math.max(1,Math.abs(a0),Math.abs(a1),Math.abs(b0),Math.abs(b1));
  return positive(a.x,a.x+a.width,b.x,b.x+b.width)&&positive(a.y,a.y+a.height,b.y,b.y+b.height);
}

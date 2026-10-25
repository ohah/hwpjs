import { pictureQuadTransform } from "./picture-quad-transform.mjs";

// Native corners already contain renderingInfo rotation. The integer source
// size is its bounding box, not another rotation to apply during painting.
export function rotatedPicturePlan(picture) {
  const angle=picture?.transform?.angle,g=picture?.geometry;
  if(!Number.isInteger(angle)||angle<0||angle>360||g?.widthRelative!==4||g.heightRelative!==2
    ||![g.width,g.height].every(v=>Number.isInteger(v)&&v>0&&v<=0xffffffff))return null;
  const mapped=pictureQuadTransform(picture.renderingCorners);
  if(mapped.state!=="mapped")return null;
  const [a,b,c,d]=mapped.matrix,det=a*d-b*c;
  if(det<=0||Math.abs(a*c+b*d)>1e-8*Math.hypot(a,b)*Math.hypot(c,d))return null;
  const actual=(Math.atan2(b,a)*180/Math.PI+360)%360,expected=angle%360;
  if(Math.min(Math.abs(actual-expected),360-Math.abs(actual-expected))>0.001)return null;
  const xs=picture.renderingCorners.map(p=>p[0]),ys=picture.renderingCorners.map(p=>p[1]);
  const left=Math.min(...xs),top=Math.min(...ys),right=Math.max(...xs),bottom=Math.max(...ys);
  if(Math.abs(left)>1||Math.abs(top)>1||Math.abs(right-g.width)>1||Math.abs(bottom-g.height)>1)return null;
  return {state:"quad",corners:picture.renderingCorners,width:g.width/75,height:g.height/75,
    bounds:{x:left/75,y:top/75,width:(right-left)/75,height:(bottom-top)/75}};
}

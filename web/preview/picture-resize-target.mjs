// UI eligibility only; native ownership/protection validation remains authoritative.
export function pictureResizeTarget(picture) {
  const geometry = picture?.geometry ?? (picture?.resizeRecordNode !== undefined ? picture.resizeGeometry : null);
  if (!geometry || picture.geometryError != null || picture.sizeProtectionError != null || picture.sizeProtected === true || picture.transformError != null || picture.renderingCornersError != null) return null;
  if (!Number.isInteger(picture.section) || !Number.isInteger(picture.pictureNode)) return null;
  if (picture.resizeRecordNode !== undefined && (!Number.isInteger(picture.resizeRecordNode) || picture.resizeRecordNode < 0 || picture.resizeRecordNode > 0xffffffff)) return null;
  const editIdentity = picture.resizeRecordNode === undefined ? {} : { resizeRecordNode: picture.resizeRecordNode };
  if (picture.groupResizeAvailable === true && picture.groupResizeError == null && Number.isInteger(picture.owner?.anchorNode) && picture.owner.anchorNode !== picture.pictureNode && geometry.width === null && geometry.height === null) {
    const points = picture.renderingCorners;
    if (!Array.isArray(points) || points.length !== 4 || points.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))) return null;
    const [width, height] = [1, 3].map(end => Math.round(Math.hypot(points[end][0] - points[0][0], points[end][1] - points[0][1])));
    if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= 0xffffffff)) return null;
    return { section: picture.section, pictureNode: picture.pictureNode, width, height };
  }
  if (geometry.widthRelative !== 4 || geometry.heightRelative !== 2 || ![geometry.width, geometry.height].every(value => Number.isInteger(value) && value > 0 && value <= 0xffffffff)) return null;
  if(Number.isInteger(picture.transform?.angle)&&picture.transform.angle!==0){
    const points=picture.renderingCorners;
    if(!Array.isArray(points)||points.length!==4||!Array.from(points).every(p=>Array.isArray(p)&&p.length===2&&Array.from(p).every(Number.isFinite)))return null;
    const [width,height]=[1,3].map(end=>Math.round(Math.hypot(points[end][0]-points[0][0],points[end][1]-points[0][1])));
    if(![width,height].every(v=>Number.isInteger(v)&&v>0&&v<=0xffffffff))return null;
    return {section:picture.section,pictureNode:picture.pictureNode,...editIdentity,width,height};
  }
  return { section: picture.section, pictureNode: picture.pictureNode, ...editIdentity, width: geometry.width, height: geometry.height };
}

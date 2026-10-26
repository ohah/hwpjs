// @ts-ignore Canonical renderer display policy; not document formatting units.
import {VIEW_SCALES} from '../../../web/preview/view-scale.mjs';
export const VIEW_ZOOM_LEVELS:readonly number[]=Object.freeze(VIEW_SCALES.filter((scale:number)=>scale>=0.5&&scale<=3).map((scale:number)=>scale*100));
export const isMenuZoomPercent=(value:unknown):value is number=>typeof value==='number'&&VIEW_ZOOM_LEVELS.includes(value);
export function stepViewZoom(current:number,direction:'in'|'out'):number|null {
 const levels=direction==='in'?VIEW_ZOOM_LEVELS:[...VIEW_ZOOM_LEVELS].reverse();
 return levels.find(value=>direction==='in'?value>current:value<current)??null;
}

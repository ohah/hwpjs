import {hasFinitePictureCrop,hasPictureSourceErrors} from "./picture-source-validation.mjs";
import {picturePaintPlan} from "./picture-paint-plan.mjs";
import {signedInt32} from "./signed-int32.mjs";
import {projectFloatingPicturePage} from "./picture-page-projection.mjs";

// Non-wrapping body layers have an anchor, but do not occupy inline ink space.
export function selectInlineGroupLayeredPictures(content,pictures,section){
  const byNode=new Map(),zeroWidthAnchors=new Map(),remaining=[],ids=new Set(),units=new Set();
  const fail=(p,policyReason)=>({state:"unavailable",error:"UnsupportedInlineGroupPictures",policyReason,
    section:p?.section,paragraph:p?.paragraph,pictureNode:p?.pictureNode});
  for(const picture of pictures){
    if(!picture||![picture.section,picture.paragraph,picture.pictureNode,picture.anchorUnit].every(n=>Number.isSafeInteger(n)&&n>=0))return fail(picture,"InvalidLayeredPictureSource");
    const id=`${picture.section}:${picture.pictureNode}`,unit=`${picture.section}:${picture.paragraph}:${picture.anchorUnit}`;
    if(ids.has(id)||units.has(unit))return fail(picture,"AmbiguousStandalonePicture");ids.add(id);units.add(unit);
    if(picture.geometry?.treatAsCharacter!==false||![2,3].includes(picture.flow?.textWrap)){remaining.push(picture);continue;}
    const owners=content.paragraphs?.filter(p=>p.section===picture.section&&p.paragraph===picture.paragraph)??[];
    const owner=owners[0],flow=content.paragraphFlows?.find(f=>f.section===picture.section&&f.paragraph===picture.paragraph);
    if(picture.section!==section||owners.length!==1||owner.tableCell||owner.tableCaption||owner.drawingText||owner.drawingCaption
      ||flow&&(flow.host!=="body"||flow.top_level!==true))return fail(picture,"LayeredPictureBodyOwnerRequired");
    if(picture.state!=="located"||!Number.isSafeInteger(picture.anchorUnit)||picture.anchorUnit<0
      ||owner.text?.[picture.anchorUnit]!=="\ufffc"||picture.owner?.paragraph!==picture.paragraph||picture.owner?.anchorUnit!==picture.anchorUnit
      ||picture.caption!=null||picture.captionPartial||hasPictureSourceErrors(picture)||!hasFinitePictureCrop(picture)
      ||picturePaintPlan(picture).state==="unsupported_transform"||signedInt32(picture.flow.zOrder)===null
      ||picture.position?.flags?.[0]!==false||![picture.geometry.width,picture.geometry.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=0xffffffff))
      return fail(picture,"InvalidLayeredPictureSource");
    byNode.set(picture.pictureNode,{picture});const key=`${picture.section}:${picture.paragraph}`,anchors=zeroWidthAnchors.get(key)??[];
    anchors.push(picture.anchorUnit);zeroWidthAnchors.set(key,anchors);
  }
  return {state:"selected",byNode,zeroWidthAnchors,remaining};
}

export function projectInlineGroupLayeredPictures(selected,paragraphs,rows){
  if(!(selected instanceof Map))return {state:"unavailable",error:"InvalidLayeredPictureSelection"};
  const pictures=[];
  for(const [node,entry] of selected){
    const picture=entry?.picture;if(!picture||node!==picture.pictureNode)return {state:"unavailable",error:"InvalidLayeredPictureSelection"};
    const placed=projectFloatingPicturePage(picture,paragraphs,rows,{edgePolicy:"inside-start-outside-end"});
    if(placed.state!=="placed")return {...placed,section:picture.section,paragraph:picture.paragraph,pictureNode:picture.pictureNode};
    pictures.push({section:picture.section,pictureNode:picture.pictureNode,paragraph:picture.paragraph,
      pageOrdinal:placed.pageOrdinal,rectangle:placed.rectangle,flow:picture.flow});
  }
  return {state:"projected",pictures};
}

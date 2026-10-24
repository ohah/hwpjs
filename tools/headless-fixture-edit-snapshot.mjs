import assert from 'node:assert/strict';

// This accepts a display-budget boundary only. The caller must independently
// verify the complete saved source before claiming an edit is verified.
export function verifyEditedProjection(before, after, {section, paragraph, startUnit, text}) {
 assert(Array.isArray(before?.paragraphs)&&Array.isArray(after?.paragraphs),'MissingParagraphProjection');
 assert.equal(after.paragraphs.length,before.paragraphs.length,'ParagraphInventoryChanged');
 let targetCount=0,budgetBoundaryChanges=0;
 for(let index=0;index<before.paragraphs.length;index++){
  const a=before.paragraphs[index],b=after.paragraphs[index];
  assert.equal(b.section,a.section,'ParagraphSectionChanged');assert.equal(b.paragraph,a.paragraph,'ParagraphIdentityChanged');
  assert.equal(typeof a.text,'string');assert.equal(typeof b.text,'string');
  if(a.section===section&&a.paragraph===paragraph){
   targetCount++;assert(!a.clipped&&!b.clipped,'EditedProjectionClipped');
   assert.equal(b.text,a.text.slice(0,startUnit)+text+a.text.slice(startUnit),'SelectedTextMismatch');continue;
  }
  if(a.text===b.text)continue;
  assert(before.limited===true&&after.limited===true&&(a.clipped===true||b.clipped===true),'UnrelatedUnclippedTextChanged');
  assert(a.text.startsWith(b.text)||b.text.startsWith(a.text),'ClippedTextPrefixChanged');
  budgetBoundaryChanges++;
 }
 assert.equal(targetCount,1,'AmbiguousEditedParagraph');
 return {budgetBoundaryChanges,requiresCompleteSourceOracle:budgetBoundaryChanges>0};
}

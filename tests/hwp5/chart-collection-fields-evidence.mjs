// Collection base field order shared by selected Array/List observations.
// The word is opaque; this helper does not infer an element count.
export function readCollectionFields({type,word,offset}){
 const typeId=type('VtCollection'),wordOffset=offset(),value=word(),baseTypeId=type('VtObject');
 return {typeId,wordOffset,word:value,baseTypeId};
}

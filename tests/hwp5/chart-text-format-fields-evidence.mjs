// Shared selected field order; caller owns byte bounds, identity policy and
// type/String state. This is independent of the product TextFormat parser.
export function readTextFormatFields({offset,long,type,word,string}){
 const start=offset(),headerWord=long(),typeId=type('VtTextFormat');type('VtObject');const rawWord=word(),codeStart=offset(),code=string(),codeEnd=offset();
 return {start,headerWord,typeId,rawWord,code,codeStart,codeEnd,end:offset()};
}

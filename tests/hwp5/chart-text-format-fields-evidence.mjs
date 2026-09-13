// Shared selected field order; caller owns byte bounds, identity policy and
// type/String state. This is independent of the product TextFormat parser.
export function readTextFormatFields({offset,long,type,word,string}){
 const start=offset(),headerWord=long(),typeId=type('VtTextFormat');type('VtObject');const rawWord=word(),code=string();
 return {start,headerWord,typeId,rawWord,code,end:offset()};
}

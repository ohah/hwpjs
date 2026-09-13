// Shared observed empty-Picture field order. Caller owns scope and error names.
export function readEmptyPictureFields({object,type,raw,long,reject}){
 const id=object();type('VtPicture');const raw4=raw(4);
 if(long()!==0xffffffff)reject();type('VtObject');return {id,raw4};
}

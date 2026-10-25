import {detectDocumentFormat,PasswordAttemptError,type HeadlessEditor} from '@hwpjs/core';
export interface DocumentLoaderOptions {
 editor:Pick<HeadlessEditor,'load'|'unlock'|'cancelLoad'>;
 askPassword(signal:AbortSignal,message?:string):Promise<string|undefined>;
 askNormalization(signal:AbortSignal):Promise<boolean>;
 askObservedDocInfo?(signal:AbortSignal):Promise<boolean>;
 askDistribution?(signal:AbortSignal):Promise<boolean>;
 askAvailableSections?(signal:AbortSignal):Promise<boolean>;
}
/** Consent belongs to one open attempt, never a global default or the document model. */
export function createDocumentLoader({editor,askPassword,askNormalization,askObservedDocInfo,askDistribution,askAvailableSections}:DocumentLoaderOptions) {
 return async(bytes:Uint8Array,name:string,signal:AbortSignal)=>{
  const format=detectDocumentFormat(bytes);
  let password:string|undefined,askedPassword=false,normalizeObservedCfb=false,retainObservedDocInfo=false,distribution=false,availableSectionCopy=false,unlock=false;
  try{
   while(!signal.aborted){
    try{
     if(unlock)await editor.unlock(password!);
     else await editor.load(bytes,{format,...(availableSectionCopy?{availableSectionCopy:true}:{}),...(password===undefined?{}:{password}),
      ...((normalizeObservedCfb||retainObservedDocInfo||distribution)?{enableOptions:{...(distribution?{distribution:true}:{}),...(normalizeObservedCfb?{normalizeObservedCfb:true}:{}),...(retainObservedDocInfo?{retainObservedDocInfo:true}:{})}}:{})});
     return;
    }catch(error){
     if(signal.aborted)return;
     if(!(error instanceof Error))throw error;
     if(error instanceof PasswordAttemptError){
      password=await askPassword(signal,'암호를 확인할 수 없습니다. 다시 입력하거나 취소하세요.');
      if(signal.aborted)return;
      if(password===undefined){await editor.cancelLoad();throw Error('문서 열기를 취소했습니다.');}
      unlock=true;continue;
     }
     if(['EncryptedDocument','UnsupportedEncryption'].includes(error.message)&&!askedPassword){
      askedPassword=true;password=await askPassword(signal);
      if(signal.aborted)return;
      if(password===undefined){await editor.cancelLoad();throw Error('문서 열기를 취소했습니다.');}
      unlock=true;continue;
     }
     if(format==='hwp5'&&error.message==='UnsupportedDistribution'&&!distribution&&!availableSectionCopy&&!retainObservedDocInfo&&askDistribution){
      const accepted=await askDistribution(signal);
      if(signal.aborted)return;
      if(!accepted)throw Error('배포용 문서 편집을 취소했습니다. 기존 문서는 유지됩니다.');
      distribution=true;unlock=false;continue;
     }
     if(format==='hwp5'&&error.message==='SectionCountMismatch'&&!availableSectionCopy&&!distribution&&!normalizeObservedCfb&&!retainObservedDocInfo&&askAvailableSections){
      const accepted=await askAvailableSections(signal);
      if(signal.aborted)return;
      if(!accepted)throw Error('저장된 구역 사본 열기를 취소했습니다. 기존 문서는 유지됩니다.');
      availableSectionCopy=true;unlock=false;continue;
     }
     if(format==='hwp5'&&!availableSectionCopy&&error.message==='RepairedSourceUnsupported'&&!normalizeObservedCfb){
      const accepted=await askNormalization(signal);
      if(signal.aborted)return;
      if(!accepted)throw Error('보정본 편집을 취소했습니다. 기존 문서는 유지됩니다.');
      normalizeObservedCfb=true;unlock=false;continue;
     }
     if(format==='hwp5'&&!availableSectionCopy&&!distribution&&!retainObservedDocInfo&&askObservedDocInfo
      &&['UnexpectedEnd','ResourceCountMismatch'].includes(error.message)){
      const accepted=await askObservedDocInfo(signal);
      if(signal.aborted)return;
      if(!accepted)throw Error('원본 서식 보존 편집을 취소했습니다. 기존 문서는 유지됩니다.');
      retainObservedDocInfo=true;unlock=false;continue;
     }
     throw error;
    }
   }
  }finally{password=undefined;}
 };
}

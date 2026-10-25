/** Explicit UI cancellation is an outcome, not a transport/runtime failure. */
export class DocumentOpenCancelledError extends Error {
 constructor(){super('문서 열기를 취소했습니다. 기존 문서는 유지됩니다.');this.name='DocumentOpenCancelledError';}
}

// Boolean source-policy prompts run after the failed candidate is released.
// Password prompts retain a locked candidate and keep their separate cleanup.
export async function requireOpenConsent(signal:AbortSignal,prompt:()=>Promise<boolean>):Promise<boolean>{
 const accepted=await prompt();
 if(accepted===false&&!signal.aborted)throw new DocumentOpenCancelledError();
 return accepted;
}

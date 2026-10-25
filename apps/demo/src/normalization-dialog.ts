// @ts-ignore Canonical wording shared with the original preview.
import {NORMALIZATION_WARNING} from '../../../web/preview/normalization-consent.mjs';
import {askConsent} from './consent-dialog.ts';
export function askNormalizationConsent(root:HTMLElement,signal:AbortSignal){
 return askConsent(root,signal,{role:'normalization-consent',label:'CFB 보정본 편집',message:NORMALIZATION_WARNING,
  accept:'보정본으로 편집',acceptRole:'accept-normalization',cancelRole:'cancel-normalization'});
}

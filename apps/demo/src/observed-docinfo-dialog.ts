// @ts-ignore Canonical native observed-mode warning; no app-specific policy copy.
import { OBSERVED_DOCINFO_WARNING } from "../../../web/preview/observed-docinfo-consent.mjs";
import { askConsent } from "./consent-dialog.ts";
export function askObservedDocInfoConsent(root: HTMLElement, signal: AbortSignal) {
  return askConsent(root, signal, {
    role: "observed-docinfo-consent",
    label: "원본 서식 보존 편집",
    message: OBSERVED_DOCINFO_WARNING,
    accept: "원본 서식 보존 모드로 편집",
    acceptRole: "accept-observed-docinfo",
    cancelRole: "cancel-observed-docinfo",
  });
}

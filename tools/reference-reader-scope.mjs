// Requested audit scope: HWP5/HWPX; HWP3 stays visible but is not a failure gate.
import { detectDocumentFormat } from "../js/document-format.mjs";
export function referenceReaderScope(bytes) {
  try {
    return { format: detectDocumentFormat(bytes), inScope: true };
  } catch (error) {
    if (error.message === "UnsupportedHwp3Document")
      return { format: "hwp3", inScope: false, reason: "Hwp3OutsideRequestedScope" };
    throw error;
  }
}

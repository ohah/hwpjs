// Prepared real-browser runner, not executed evidence. Uses actual factory,
// experimental editor and optional ABI; does not override SDK registration.
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { createNewDocumentBytes } from '../../js/new-document.mjs';
const hex = (bytes) =>
  [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, '0')).join('');
const sha = async (bytes) => hex(await crypto.subtle.digest('SHA-256', bytes));
function require(value, message) {
  if (!value) throw Error(message);
}
function refuses(action, pattern) {
  try {
    action();
  } catch (error) {
    if (!pattern.test(String(error))) throw error;
    return;
  }
  throw Error('ExpectedStrictRefusal');
}
async function rejects(action, pattern) {
  try {
    await action();
  } catch (error) {
    if (!pattern.test(String(error))) throw error;
    return;
  }
  throw Error('ExpectedStrictRefusal');
}
export async function runStrictLayoutBrowserRoster({
  wasmBytes,
  expectedWasmSHA256,
  fontBytes,
  expectedFontSHA256,
}) {
  require((await sha(wasmBytes)) === expectedWasmSHA256, 'WasmInputPinMismatch');
  require((await sha(fontBytes)) === expectedFontSHA256, 'FontInputPinMismatch');
  const steps = [],
    artifacts = [];
  const face = await new FontFace('함초롬바탕', fontBytes).load();
  const other = await new FontFace('함초롬바탕', fontBytes).load();
  require(![...document.fonts].some(
    (f) => f.family.replace(/^(['"])(.*)\1$/, '$2') === face.family,
  ), 'ExistingFontFamilyMustBePreserved');
  document.fonts.add(face);
  let editor, reopened;
  try {
    const source = await createNewDocumentBytes(wasmBytes, 'hwp5');
    editor = await createExperimentalHwp5Editor(wasmBytes, source);
    editor.enableHistoryV2();
    editor.splice({ section: 0, paragraph: 0, startUnit: 16, endUnit: 16, text: '실제 측정 A' });
    refuses(() => editor.save(), /LayoutReflowRequired/);
    steps.push('default-dirty-guard');
    const beforeControl = editor.text(0, 0);
    const beforeControlRevision = editor.historyRevision();
    refuses(
      () => editor.splice({ section: 0, paragraph: 0, startUnit: 16, endUnit: 16, text: '\n' }),
      /UnsupportedTextControl/,
    );
    require(editor.text(0, 0) === beforeControl &&
      editor.historyRevision() === beforeControlRevision, 'RejectedControlChangedModelOrHistory');
    steps.push('raw-LF-splice-refused-atomically');
    const revision = editor.historyRevision();
    const saved = await editor.saveMeasuredPlainLayout({ fontFace: face });
    require(!saved.layoutRequiresReflow && saved.bytes.length > 0, 'MeasuredStrictSaveFailed');
    require(editor.historyRevision() === revision, 'SaveChangedHistory');
    artifacts.push({
      kind: 'measured-clean-body',
      bytes: saved.bytes,
      sha256: await sha(saved.bytes),
    });
    steps.push('real-font-measured-save');
    reopened = await createExperimentalHwp5Editor(wasmBytes, saved.bytes);
    require(reopened.text(0, 0).includes('실제 측정 A'), 'SavedTextMismatch');
    const again = reopened.save();
    require(hex(again.bytes) === hex(saved.bytes), 'UnchangedReopenBytesChanged');
    steps.push('reopen-text-and-exact-unchanged-save');
    reopened.close();
    reopened = null;
    // The async method prepares Native ownership before its first suspension.
    const pending = editor.saveMeasuredPlainLayout({ fontFace: face });
    editor.splice({ section: 0, paragraph: 0, startUnit: 16, endUnit: 16, text: 'B' });
    await rejects(() => pending, /LayoutSourceChanged/);
    refuses(() => editor.save(), /LayoutReflowRequired/);
    steps.push('edit-during-font-wait-refused');
    const travel = editor.saveMeasuredPlainLayout({ fontFace: face });
    require(editor.undo() && editor.redo(), 'HistoryTravelUnavailable');
    await rejects(() => travel, /LayoutSourceChanged/);
    steps.push('undo-redo-same-state-refused');
    const fonts = editor.saveMeasuredPlainLayout({ fontFace: face });
    document.fonts.add(other);
    try {
      await rejects(() => fonts, /AmbiguousOwnedFontFamily|FontEnvironmentChanged/);
    } finally {
      document.fonts.delete(other);
    }
    steps.push('font-set-change-refused');
    // No automatic wrapping or fallback to stale acceptance.
    editor.splice({
      section: 0,
      paragraph: 0,
      startUnit: 16,
      endUnit: 16,
      text: 'A'.repeat(10000),
    });
    await rejects(
      () => editor.saveMeasuredPlainLayout({ fontFace: face }),
      /StrictLayoutNeedsWrapOrLargerLineBox/,
    );
    refuses(() => editor.save(), /LayoutReflowRequired/);
    steps.push('overflow-guard-retained');
    return {
      passed: true,
      steps,
      artifacts,
      wasmSHA256: expectedWasmSHA256,
      fontSHA256: expectedFontSHA256,
      browser: navigator.userAgent,
      scope: 'experimental-editor-real-font-not-normal-sdk-or-official-acceptance',
    };
  } catch (error) {
    // Caller must preserve this first failure and any earlier artifacts.
    error.strictLayoutEvidence = {
      steps,
      artifacts,
      wasmSHA256: expectedWasmSHA256,
      fontSHA256: expectedFontSHA256,
      browser: navigator.userAgent,
    };
    throw error;
  } finally {
    reopened?.close();
    editor?.close();
    document.fonts.delete(other);
    document.fonts.delete(face);
  }
}

import { createFormAutoSizeFrames } from './form-autosize-frame.mjs';

// Draft geometry has its own receipts; it never replaces the painted value frame.
export function createFormTextDraftMeasurements(requestAutoSize) {
  const frames = createFormAutoSizeFrames();
  let snapshot = null,
    live = true;
  const admits = (target, currentTargets, contexts) =>
    live &&
    currentTargets.has(target) &&
    !!target.form?.autoSizeOwner &&
    target.form?.form?.editable !== false &&
    contexts.has(target.form) &&
    frames.admits(snapshot, target.form.autoSizeOwner);
  return Object.freeze({
    admits,
    begin(source, owners) {
      frames.begin(source, owners);
      snapshot = source;
    },
    measure(target, text, currentTargets, contexts) {
      if (
        !admits(target, currentTargets, contexts) ||
        typeof text !== 'string' ||
        !text.isWellFormed() ||
        text.length > 65535
      )
        return null;
      const context = contexts.get(target.form);
      if (!context) return null;
      const frame = frames.request(
        snapshot,
        target.form.autoSizeOwner,
        Object.freeze({ ...context, label: text }),
        requestAutoSize,
      );
      return frame ? Object.freeze({ ...frame, font: context.font, kind: context.kind }) : null;
    },
    dispose() {
      live = false;
      snapshot = null;
      frames.dispose();
    },
  });
}

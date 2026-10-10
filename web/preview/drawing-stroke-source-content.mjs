// Optional source diagnostics never replace a numeric paint stroke.
export function drawingStrokeSourceContent(editor, section, node) {
  try {
    if (typeof editor.drawingStrokeSource !== "function") throw new Error("HwpxDrawingStrokeSourceAbiUnavailable");
    const value = editor.drawingStrokeSource(section, node);
    if (value.sourceOnly !== true || value.node !== node) throw new Error("DrawingStrokeSourceBindingMismatch");
    return { source: value, error: null };
  } catch (error) { return { source: null, error: error.message }; }
}

// Native snapshot only: display text and textarea drafts are never serialized.
export function saveDocument(editor, format, allowStaleLayout = false) {
  if (!editor) throw new Error("EditorNotOpen");
  if (typeof allowStaleLayout !== "boolean") throw new TypeError("InvalidStaleLayoutPolicy");
  if (format === "hwpx") return { bytes: editor.save(), format, layoutRequiresReflow: true };
  if (format === "hwp5") return { ...editor.save({ allowStaleLayout }), format };
  throw new Error("UnknownDocumentFormat");
}

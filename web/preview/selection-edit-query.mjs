// Worker boundary only; native owns field spans and edit permission.
export function selectionEditQuery(message, { active, format, canEdit }) {
  return selectionQuery(message, { active, format, query: canEdit, kind: "query-edit-range" });
}

export function selectionSplitQuery(message, { active, format, canSplit }) {
  if (message.kind !== "query-split-range") throw new Error("InvalidEditPermissionRange");
  return selectionQuery(message, { active, format, query: canSplit, kind: "query-split-range" });
}

function selectionQuery(message, { active, format, query, kind }) {
  if (!Number.isSafeInteger(message.requestId) || message.requestId < 1 || !["section", "paragraph", "startUnit", "endUnit"].every(key => Number.isInteger(message[key]) && message[key] >= 0 && message[key] <= 0xffffffff) || message.paragraph === 0xffffffff || message.endUnit < message.startUnit) throw new Error("InvalidEditPermissionRange");
  if (!active) throw new Error("EditorNotOpen");
  const allowed = format === "hwpx" ? query(message.section, message.paragraph + 1, message.startUnit, message.endUnit) : false;
  if (typeof allowed !== "boolean") throw new Error("InvalidEditPermissionResponse");
  return { kind, requestId: message.requestId, section: message.section, paragraph: message.paragraph, startUnit: message.startUnit, endUnit: message.endUnit, allowed };
}

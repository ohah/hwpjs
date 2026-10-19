// Display alignment excludes only source ASCII spaces and hard line breaks.
export const lineVisibleEndUnit = (text, startUnit) => startUnit + text.replace(/[ \r\n]+$/u, "").length;

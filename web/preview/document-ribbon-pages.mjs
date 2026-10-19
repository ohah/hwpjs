// Presentation groups only; command availability belongs to the existing controls.
export const documentRibbonPages = Object.freeze([
  Object.freeze({ id: "home", label: "홈", selectors: Object.freeze([
    '.toolbar-group[aria-label="선택 글자 강조"]',
    '.toolbar-group[aria-label="기존 글자 서식"]',
    ".style-toolbar",
  ]) }),
  Object.freeze({ id: "insert", label: "삽입", selectors: Object.freeze(["#paragraph-break-tools", "#table-creation-form"]), emptyHint: "문서를 열고 편집을 시작하면 지원되는 삽입 도구가 표시됩니다." }),
  Object.freeze({ id: "view", label: "보기", selectors: Object.freeze([".view-toolbar", "#document-window-options"]) }),
]);

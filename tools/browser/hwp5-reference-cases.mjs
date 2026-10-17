// Fixture identity and UI opening policy, separate from browser orchestration.
const cases = Object.freeze({
  hwpspec: Object.freeze({ fixture: "hwpspec.hwp", section: 2, paragraph: 1, occurrence: 3, distribution: true, normalize: true }),
  roadmap: Object.freeze({ fixture: "issue5941/1490000-201600081_roadmap_research.hwp", section: 0, paragraph: 5, occurrence: 1, distribution: false, normalize: false }),
});

export function hwp5BrowserReferenceCase(name = "hwpspec") {
  if (typeof name !== "string" || !Object.hasOwn(cases, name)) throw Error("UnknownBrowserReferenceCase");
  return cases[name];
}

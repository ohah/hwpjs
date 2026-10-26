// Fixture identity and UI opening policy, separate from browser orchestration.
const cases = Object.freeze({
  'empty-cell': Object.freeze({
    fixture: '253E164F57A1BC6934-empty.hwp',
    section: 0,
    paragraph: 1,
    occurrence: 1,
    distribution: false,
    normalize: true,
    blankCell: true,
  }),
  hwpspec: Object.freeze({
    fixture: 'hwpspec.hwp',
    section: 2,
    paragraph: 1,
    occurrence: 3,
    distribution: true,
    normalize: true,
  }),
  roadmap: Object.freeze({
    fixture: 'issue5941/1490000-201600081_roadmap_research.hwp',
    section: 0,
    paragraph: 5,
    occurrence: 1,
    distribution: false,
    normalize: false,
  }),
  'observed-docinfo': Object.freeze({
    fixture: '20250130-hongbo_saved.hwp',
    section: 0,
    paragraph: 2,
    occurrence: 1,
    distribution: false,
    normalize: true,
    observedDocInfo: true,
  }),
  market: Object.freeze({
    fixture: 'task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp',
    section: 0,
    paragraph: 50000,
    occurrence: 1,
    distribution: false,
    normalize: false,
    window: Object.freeze({ offset: 50000, count: 1 }),
    timeoutMs: 120000,
  }),
});

export function hwp5BrowserReferenceCase(name = 'hwpspec') {
  if (typeof name !== 'string' || !Object.hasOwn(cases, name))
    throw Error('UnknownBrowserReferenceCase');
  return cases[name];
}

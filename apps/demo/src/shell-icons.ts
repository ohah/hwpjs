// 도형 좌표를 독립 작성한 장식 아이콘이다. 외부 코드나 이미지 자산을 사용하지 않는다.
type Part = readonly [keyof SVGElementTagNameMap, Readonly<Record<string, string>>];
const line = (d: string): Part => ['path', { d }];
const paper: Part = [
  'rect',
  { x: '7', y: '4', width: '18', height: '25', rx: '1', fill: 'var(--hwp-icon-paper, white)' },
];
const icons = {
  save: [line('M16 4v17m-6-6 6 6 6-6M6 23v5h20v-5')],
  cut: [
    ['circle', { cx: '8', cy: '23', r: '4' }],
    ['circle', { cx: '24', cy: '23', r: '4' }],
    line('m11 20 13-15M21 20 8 5m6 11 4-4'),
  ],
  copy: [
    ['rect', { x: '5', y: '4', width: '17', height: '23', rx: '1' }],
    [
      'rect',
      { x: '10', y: '8', width: '17', height: '23', rx: '1', fill: 'var(--hwp-icon-paper, white)' },
    ],
    line('M14 13h9m-9 4h9m-9 4h9m-9 4h6'),
  ],
  paste: [
    [
      'rect',
      { x: '6', y: '7', width: '21', height: '23', rx: '2', fill: 'var(--hwp-icon-warm, #f1e0b8)' },
    ],
    [
      'rect',
      { x: '11', y: '3', width: '10', height: '7', rx: '2', fill: 'var(--hwp-icon-paper, white)' },
    ],
    line('M11 15h11m-11 5h11m-11 5h8'),
  ],
  'format-copy': [paper, line('M11 10h9m-9 4h7m-7 4h5m3 8 9-12 3 3-10 11-4 1z')],
  'toggle-marks': [
    line('M5 11h22M5 21h22M11 5v22M21 5v22'),
    ['rect', { x: '2', y: '8', width: '28', height: '16', rx: '1', 'stroke-dasharray': '2 3' }],
  ],
  'toggle-paragraph-marks': [line('M25 7v12H8m5-5-5 5 5 5M6 6h2m4 0h2m4 0h2')],
  'toggle-grid': [
    ['rect', { x: '4', y: '4', width: '24', height: '24' }],
    line('M10 4v24M16 4v24M22 4v24M4 10h24M4 16h24M4 22h24'),
  ],
  'character-properties': [line('m5 26 8-20 8 20M8 20h10M25 7v15m-4-5 4 5 4-5')],
  'paragraph-properties': [line('M4 6h24M4 11h18M4 16h24M4 21h13m2 4 4 4 6-9')],
  'insert-table': [
    ['rect', { x: '3', y: '5', width: '26', height: '23', rx: '1' }],
    ['rect', { x: '3', y: '5', width: '26', height: '6', fill: 'var(--hwp-icon-accent, #6586ad)' }],
    line('M3 17h26M3 23h26M11 11v17M20 11v17'),
  ],
  'insert-shape': [
    ['rect', { x: '3', y: '4', width: '14', height: '13', rx: '1' }],
    ['circle', { cx: '23', cy: '12', r: '7', fill: 'var(--hwp-icon-paper, white)' }],
    ['path', { d: 'm9 29 9-17 10 17z', fill: 'var(--hwp-icon-accent, #6586ad)' }],
  ],
  'insert-image': [
    [
      'rect',
      { x: '3', y: '5', width: '26', height: '23', rx: '1', fill: 'var(--hwp-icon-soft, #edf3fa)' },
    ],
    ['circle', { cx: '22', cy: '12', r: '3', fill: 'var(--hwp-icon-warm, #f1e0b8)' }],
    line('m5 25 8-10 6 7 4-4 4 7'),
  ],
  'object-properties': [
    ['rect', { x: '6', y: '6', width: '20', height: '20', rx: '1' }],
    ['rect', { x: '3', y: '3', width: '26', height: '26', 'stroke-dasharray': '2 3' }],
    line('m15 21 4 4 8-11'),
  ],
  'insert-symbol': [
    line(
      'M10 27H4v-4c5-2 4-6 1-9-4-6 1-11 6-11m11 24h6v-4c-5-2-4-6-1-9 4-6-1-11-6-11M11 3h10M4 6l24 21M4 27 28 6',
    ),
  ],
  'insert-link': [
    ['circle', { cx: '13', cy: '12', r: '9' }],
    line(
      'M4 12h18M13 3c-6 5-6 13 0 18m0-18c6 5 6 13 0 18m5-1 4-4c5-4 10 2 6 6l-4 4c-4 4-10-2-6-6m1 3 7-5',
    ),
  ],
  'insert-footnote': [paper, line('M11 9h10m-10 4h10m-10 4h10M9 23h14m-12 3h8m-8-5 2-2v5')],
  'insert-endnote': [paper, line('M11 9h10m-10 4h10m-10 4h10M9 23h14m-11 3h8m-5-6v6m-2-6h4')],
  'insert-header': [
    paper,
    ['rect', { x: '10', y: '7', width: '12', height: '4', fill: 'var(--hwp-icon-warm, #f1e0b8)' }],
    line('M11 16h10m-10 4h10m-10 4h8'),
  ],
  'insert-footer': [
    paper,
    ['rect', { x: '10', y: '22', width: '12', height: '4', fill: 'var(--hwp-icon-warm, #f1e0b8)' }],
    line('M11 9h10m-10 4h10m-10 4h8'),
  ],
  find: [
    line('M3 21 7 8h5l2 11m4 0 2-11h5l4 13M8 8V5h4v3m8 0V5h4v3M14 17h4'),
    ['circle', { cx: '9', cy: '22', r: '6', fill: 'var(--hwp-icon-soft, #edf3fa)' }],
    ['circle', { cx: '23', cy: '22', r: '6', fill: 'var(--hwp-icon-soft, #edf3fa)' }],
    line('M6 22a3 3 0 0 1 3-3m11 3a3 3 0 0 1 3-3'),
  ],
  'insert-chart': [
    line('M4 4v24h25'),
    ['rect', { x: '8', y: '17', width: '4', height: '8' }],
    [
      'rect',
      { x: '16', y: '12', width: '4', height: '13', fill: 'var(--hwp-icon-accent, #6586ad)' },
    ],
    ['rect', { x: '24', y: '7', width: '4', height: '18' }],
  ],
  more: [
    ['circle', { cx: '7', cy: '16', r: '1.6', fill: 'currentColor' }],
    ['circle', { cx: '16', cy: '16', r: '1.6', fill: 'currentColor' }],
    ['circle', { cx: '25', cy: '16', r: '1.6', fill: 'currentColor' }],
  ],
} as const satisfies Readonly<Record<string, readonly Part[]>>;
export type ShellIcon = keyof typeof icons;

export function createShellIcon(doc: Document, name: ShellIcon): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 32 32',
    width: '28',
    height: '28',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.5',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  }))
    svg.setAttribute(key, value);
  svg.setAttribute('class', 'hwp-demo-symbol');
  svg.dataset.icon = name;
  for (const [tag, attributes] of icons[name]) {
    const child = doc.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) child.setAttribute(key, value);
    svg.append(child);
  }
  return svg;
}

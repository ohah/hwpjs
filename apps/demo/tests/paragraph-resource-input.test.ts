import { test, expect } from 'bun:test';
import {
  paragraphBorderDraft as border,
  paragraphBackgroundDraft as background,
  invalidResourceDraft,
} from '../src/paragraph-resource-input.ts';
import { createParagraphResourceFields } from '../src/paragraph-resource-fields.ts';
import { createParagraphShapePort } from '../src/paragraph-shape-port.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
test('빈 입력은 원본 유지', () => {
  expect(border({})).toBeUndefined();
  expect(background('', '')).toBeUndefined();
});
test('희소 한쪽과 RGB0을 그대로 전달', () =>
  expect(border({ left: { style: '', width: '', color: '#000000' } })).toEqual({
    left: { color: 0 },
  }));
test('잘못된 색은 명시invalid draft', () =>
  expect(invalidResourceDraft(border({ left: { style: '', width: '', color: '#zz0000' } }))).toBe(
    true,
  ));
test('지원목록밖 굵기와 선 종류는 조용히 대체하지 않음', () => {
  expect(invalidResourceDraft(border({ top: { style: 'invented', width: '', color: '' } }))).toBe(
    true,
  );
  expect(invalidResourceDraft(border({ left: { style: '', width: '35', color: '' } }))).toBe(true);
});
test('배경은 명시none 또는 종류와 실제색 쌍', () => {
  expect(background('none', '')).toEqual({ kind: 'none' });
  expect(background('solid', '#000000')).toEqual({ kind: 'solid', color: 0 });
  expect(invalidResourceDraft(background('', '#123456'))).toBe(true);
  expect(invalidResourceDraft(background('solid', ''))).toBe(true);
});
function fixture() {
  const f = documentFixture();
  const changes: any[] = [];
  let composing = false;
  const widget = createParagraphResourceFields(
    f.doc,
    (...v) => changes.push(v),
    () => composing,
  );
  f.root.append(widget.element as any);
  const cap = {
    atomic: true,
    fields: { 'paragraph.border': { writable: true }, 'paragraph.background': { writable: true } },
  };
  const values = {
    'paragraph.border': { state: 'known', writable: true, value: {} },
    'paragraph.background': { state: 'known', writable: true, value: { kind: 'none' } },
  };
  const model: any = {
    captured: { result: { observations: { aggregate: values } }, capabilities: cap },
    draft: new Map(),
    pending: false,
    loading: false,
    stale: false,
    refreshRequired: false,
    error: null,
  };
  widget.update(model);
  return {
    f,
    widget,
    changes,
    model,
    values,
    cap,
    compose(v: boolean) {
      composing = v;
    },
  };
}
test('모형 DOM 입력은 실제값 없는 필드를 묵시적으로 채우지 않음', () => {
  const s = fixture();
  const node = s.f.role('border-left-color');
  node.value = '#000000';
  fire(node, 'input');
  expect(s.changes).toEqual([['paragraph.border', { left: { color: 0 } }]]);
});
test('관측 또는 cap readonly는 합성 이벤트도 차단', () => {
  const s = fixture();
  s.values['paragraph.border'].writable = false;
  s.widget.update(s.model);
  const node = s.f.role('border-left-color');
  node.value = '#123456';
  fire(node, 'input');
  expect(node.disabled).toBe(true);
  expect(s.changes).toHaveLength(0);
});
test('composition과pending에서는 초안 commit안함', () => {
  const s = fixture();
  const node = s.f.role('border-left-color');
  node.value = '#123456';
  s.compose(true);
  fire(node, 'input');
  s.compose(false);
  s.widget.update({ ...s.model, pending: true });
  fire(node, 'input');
  expect(s.changes).toHaveLength(0);
});
test('dispose와 새capture의 입력 수명 분리', () => {
  const s = fixture();
  const node = s.f.role('border-left-color');
  node.value = '#123456';
  s.widget.update({ ...s.model, captured: { ...s.model.captured } });
  expect(node.value).toBe('');
  s.widget.dispose();
  node.value = '#000000';
  fire(node, 'input');
  expect(s.changes).toHaveLength(0);
});
function portFixture() {
  const calls: any[] = [];
  const state: any = { stateVersion: 3 };
  const captured: any = {
    state,
    target: { owner: 'original-paragraph', section: 0, paragraph: 0, startUnit: 0, endUnit: 1 },
    capabilities: {
      atomic: true,
      fields: {
        'paragraph.border': { writable: true },
        'paragraph.background': { writable: true },
      },
    },
    result: {
      observations: {
        aggregate: {
          'paragraph.border': { state: 'known', writable: true, value: {} },
          'paragraph.background': { state: 'known', writable: true, value: { kind: 'none' } },
        },
      },
    },
  };
  const api: any = {
    command: { name: 'apply-formatting-patch', id: Symbol() },
    target() {
      return captured.target;
    },
    async capabilities() {
      return captured.capabilities;
    },
    async query() {
      return captured.result;
    },
    dispatch(command: any, payload: any) {
      calls.push({ command, payload });
      return Promise.resolve({ applied: true });
    },
  };
  return { port: createParagraphShapePort(api), calls, state, captured };
}
test('모형port는 테두리와 배경을 한 원자 명령으로 전달', async () => {
  const s = portFixture();
  await s.port.apply(
    s.captured,
    s.state,
    new Map([
      ['paragraph.border', { left: { color: 0 } }],
      ['paragraph.background', { kind: 'solid', color: 0x123456 }],
    ] as any),
  );
  expect(s.calls).toHaveLength(1);
  expect(s.calls[0].payload.patch).toEqual({
    paragraph: { border: { left: { color: 0 } }, background: { kind: 'solid', color: 0x123456 } },
  });
});
test('불완전 resource draft는 dispatch0', () => {
  const s = portFixture();
  expect(() =>
    s.port.apply(
      s.captured,
      s.state,
      new Map([['paragraph.background', background('solid', '')!]]),
    ),
  ).toThrow();
  expect(s.calls).toHaveLength(0);
});
test('readonly와 stale는 dispatch0', () => {
  const s = portFixture();
  s.captured.result.observations.aggregate['paragraph.border'].writable = false;
  expect(() =>
    s.port.apply(s.captured, s.state, new Map([['paragraph.border', { left: { color: 0 } }]])),
  ).toThrow();
  expect(() => s.port.apply(s.captured, {} as any, new Map())).toThrow('StaleParagraphShape');
  expect(s.calls).toHaveLength(0);
});

test('InputEvent isComposing guard', () => {
  const s = fixture();
  const node = s.f.role('border-left-color');
  node.value = '#123456';
  fire(node, 'input', { isComposing: true });
  expect(s.changes).toHaveLength(0);
});

test('무늬는 세 명시값과 실제 RGB0을 보존한다', () => {
  expect(background('hatch', '#000000', { style: 'HORIZONTAL', color: '#0099ff' })).toEqual({
    kind: 'hatch',
    faceColor: 0,
    hatchColor: 0x0099ff,
    style: 'HORIZONTAL',
  });
});
test('무늬 일부입력만으로 Native 기본을 만들지 않는다', () => {
  expect(
    invalidResourceDraft(background('hatch', '#123456', { style: '', color: '#000000' })),
  ).toBe(true);
  expect(invalidResourceDraft(background('hatch', '#123456'))).toBe(true);
});

const linearRaw = {
  endColor: '#ffffff',
  angle: '0',
  centerX: '0',
  centerY: '100',
  step: '0',
  stepCenter: '100',
};
test('선형 명시 0과 상한값을 그대로 전달', () =>
  expect(background('linear', '#000000', undefined, linearRaw)).toEqual({
    kind: 'linear',
    colors: [0, 0xffffff],
    angle: 0,
    centerX: 0,
    centerY: 100,
    step: 0,
    stepCenter: 100,
  }));
test('선형 일부 누락은 기본값 생성 없이 거부', () => {
  expect(invalidResourceDraft(background('linear', '#000000'))).toBe(true);
  for (const name of Object.keys(linearRaw))
    expect(
      invalidResourceDraft(
        background('linear', '#000000', undefined, { ...linearRaw, [name]: '' }),
      ),
    ).toBe(true);
});
test('선형 범위밖 소수 비유한 표기는 거부', () => {
  for (const angle of ['360', '-1', '0.5', 'Infinity', '1e2'])
    expect(
      invalidResourceDraft(background('linear', '#123456', undefined, { ...linearRaw, angle })),
    ).toBe(true);
  expect(
    invalidResourceDraft(background('linear', '#123456', undefined, { ...linearRaw, step: '101' })),
  ).toBe(true);
});
test('선형 malformed 색과 radial은 모사하지 않음', () => {
  expect(
    invalidResourceDraft(
      background('linear', '#000000', undefined, { ...linearRaw, endColor: '#bad' }),
    ),
  ).toBe(true);
  expect(invalidResourceDraft(background('radial', '#000000'))).toBe(true);
});
test('unknown 배경은 writable 표지만으로 활성화하지 않음', () => {
  const s = fixture();
  (s.values['paragraph.background'] as any).state = 'unknown';
  s.widget.update(s.model);
  const node = s.f.role('background-linear-angle');
  node.value = '90';
  fire(node, 'input');
  expect(node.disabled).toBe(true);
  expect(s.changes).toHaveLength(0);
});
test('선형 widget은 마지막 명시값까지 모인 후 실제 intent를 전달', () => {
  const s = fixture();
  for (const [key, value] of Object.entries({
    'background-kind': 'linear',
    'background-color': '#000000',
    'background-linear-end': '#ffffff',
    'background-linear-angle': '90',
    'background-linear-centerX': '0',
    'background-linear-centerY': '100',
    'background-linear-step': '0',
    'background-linear-stepCenter': '100',
  })) {
    const node = s.f.role(key);
    node.value = value;
    fire(node, key === 'background-kind' ? 'change' : 'input');
  }
  expect(s.changes.at(-1)).toEqual([
    'paragraph.background',
    {
      kind: 'linear',
      colors: [0, 0xffffff],
      angle: 90,
      centerX: 0,
      centerY: 100,
      step: 0,
      stepCenter: 100,
    },
  ]);
});
test('선형과 테두리도 기존 단일 원자 명령에 전달', async () => {
  const s = portFixture();
  await s.port.apply(
    s.captured,
    s.state,
    new Map([
      ['paragraph.border', { top: { color: 0 } }],
      ['paragraph.background', background('linear', '#000000', undefined, linearRaw)!],
    ]),
  );
  expect(s.calls).toHaveLength(1);
  expect(s.calls[0].payload.patch.paragraph.background.kind).toBe('linear');
});

// Current core validator, not a copied range oracle or package type alias.
import { validateBackgroundPatch } from '../../../packages/core/src/commands/formatting-resource-intent.ts';
test('현재 core validator와 선형 경계값 조합이 일치한다', () => {
  for (const angle of ['0', '359'])
    for (const step of ['0', '1', '100']) {
      const value = background('linear', '#000000', undefined, { ...linearRaw, angle, step });
      expect(invalidResourceDraft(value)).toBe(false);
      expect(() => validateBackgroundPatch(value)).not.toThrow();
    }
});
test('각 선형 숫자필드의 음수와 상한초과는 invalid', () => {
  for (const name of ['centerX', 'centerY', 'step', 'stepCenter'])
    for (const raw of ['-1', '101', '0.5', 'NaN'])
      expect(
        invalidResourceDraft(
          background('linear', '#000000', undefined, { ...linearRaw, [name]: raw }),
        ),
      ).toBe(true);
});
test('캡 해제 update 후 선형 이벤트는 전달하지 않음', () => {
  const s = fixture();
  s.cap.fields['paragraph.background'].writable = false;
  s.widget.update(s.model);
  const node = s.f.role('background-linear-angle');
  node.value = '90';
  fire(node, 'input');
  expect(node.disabled).toBe(true);
  expect(s.changes).toHaveLength(0);
});
test('stale 전환 동안 선형 값은 보존하되 이벤트차단', () => {
  const s = fixture();
  const node = s.f.role('background-linear-angle');
  node.value = '90';
  s.widget.update({ ...s.model, stale: true });
  fire(node, 'input');
  expect(node.value).toBe('90');
  expect(node.disabled).toBe(true);
  expect(s.changes).toHaveLength(0);
});
test('새 선택 capture는 선형 초안을 모두 지우며 기본값을 만들지 않음', () => {
  const s = fixture();
  const node = s.f.role('background-linear-angle');
  node.value = '90';
  s.widget.update({ ...s.model, captured: { ...s.model.captured } });
  expect(node.value).toBe('');
  expect(s.f.role('background-linear-step').value).toBe('');
  expect(s.changes).toHaveLength(0);
});
test('알 수 없음에서 known 갱신 시 새 권한으로만 입력허용', () => {
  const s = fixture();
  const value = s.values['paragraph.background'] as any;
  value.state = 'unknown';
  s.widget.update(s.model);
  const node = s.f.role('background-linear-angle');
  expect(node.disabled).toBe(true);
  value.state = 'known';
  s.widget.update(s.model);
  expect(node.disabled).toBe(false);
  expect(s.changes).toHaveLength(0);
});

// Real ESM export-shape boundary, not core:{} injected after current imports.
import { readFileSync } from 'node:fs';
const esmURL = (source: string) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
async function cataloglessModules() {
  const transpiler = new Bun.Transpiler({ loader: 'ts' });
  const legacy = esmURL('export const LEGACY_CORE_WITHOUT_RESOURCE_CATALOGS = true;');
  const input = transpiler.transformSync(
    readFileSync(new URL('../src/paragraph-resource-input.ts', import.meta.url), 'utf8'),
  );
  const matched = input.match(/from\s*(['"])@hwpjs\/core\1/g);
  expect(matched).toHaveLength(1);
  const inputURL = esmURL(
    input.replace(/from\s*(['"])@hwpjs\/core\1/, 'from ' + JSON.stringify(legacy)),
  );
  const fields = transpiler.transformSync(
    readFileSync(new URL('../src/paragraph-resource-fields.ts', import.meta.url), 'utf8'),
  );
  expect(fields.includes('./paragraph-resource-input.ts')).toBe(true);
  const fieldsURL = esmURL(fields.replace('./paragraph-resource-input.ts', inputURL));
  return { input: await import(inputURL), fields: await import(fieldsURL) };
}
test('catalog 없는 실제 ESM export 경계에서도 helper가 로드되고 목록은 비어 있음', async () => {
  const { input } = await cataloglessModules();
  expect(input.resourceStyles).toEqual([]);
  expect(input.resourceWidths).toEqual([]);
  expect(input.resourceHatches).toEqual([]);
  expect(input.resourceCatalogAvailable).toEqual({ border: false, background: false });
});
test('catalog 없는 모듈의 상세 자원 필드만 비활성이고 이벤트는 전달0', async () => {
  const { fields } = await cataloglessModules();
  const f = documentFixture();
  const changes: unknown[] = [];
  const widget = fields.createParagraphResourceFields(
    f.doc,
    (...args: unknown[]) => changes.push(args),
    () => false,
  );
  f.root.append(widget.element);
  const known = { state: 'known', writable: true, value: {} };
  widget.update({
    captured: {
      capabilities: {
        atomic: true,
        fields: {
          'paragraph.border': { writable: true },
          'paragraph.background': { writable: true },
        },
      },
      result: {
        observations: { aggregate: { 'paragraph.border': known, 'paragraph.background': known } },
      },
    },
    draft: new Map(),
    pending: false,
    loading: false,
    stale: false,
    refreshRequired: false,
  });
  const left = f.role('border-left-color'),
    background = f.role('background-kind');
  expect(left.disabled).toBe(true);
  expect(background.disabled).toBe(true);
  left.value = '#123456';
  fire(left, 'input');
  expect(changes).toHaveLength(0);
  expect(f.text()).toContain('현재 버전에서는 상세 테두리·배경을 편집할 수 없습니다.');
  widget.dispose();
});

import * as officialResourceCore from '@hwpjs/core';
test('브라우저 번들의 합성 namespace에서도 공식 catalog 값을 보존한다', async () => {
  const catalog = {
    BORDER_LINE_STYLES: officialResourceCore.BORDER_LINE_STYLES,
    BORDER_WIDTHS_HUNDREDTH_MM: officialResourceCore.BORDER_WIDTHS_HUNDREDTH_MM,
    BACKGROUND_HATCH_STYLES: officialResourceCore.BACKGROUND_HATCH_STYLES,
  };
  expect(Object.values(catalog).every((value) => Array.isArray(value) && value.length > 0)).toBe(
    true,
  );
  const result = await Bun.build({
    entrypoints: [new URL('../src/paragraph-resource-input.ts', import.meta.url).pathname],
    target: 'browser',
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'official-resource-catalog-fixture',
        setup(build) {
          build.onResolve({ filter: /^@hwpjs\/core$/ }, () => ({
            path: 'official-resource-core',
            namespace: 'resource-catalog-fixture',
          }));
          build.onLoad({ filter: /.*/, namespace: 'resource-catalog-fixture' }, () => ({
            loader: 'js',
            contents: Object.entries(catalog)
              .map(
                ([name, values]) =>
                  `export const ${name} = Object.freeze(${JSON.stringify(values)});`,
              )
              .join('\n'),
          }));
        },
      },
    ],
  });
  expect(result.success).toBe(true);
  expect(result.outputs).toHaveLength(1);
  const bundled = await import(esmURL(await result.outputs[0].text()));
  expect(bundled.resourceStyles).toEqual(catalog.BORDER_LINE_STYLES);
  expect(bundled.resourceWidths).toEqual(catalog.BORDER_WIDTHS_HUNDREDTH_MM);
  expect(bundled.resourceHatches).toEqual(catalog.BACKGROUND_HATCH_STYLES);
  expect(bundled.resourceCatalogAvailable).toEqual({ border: true, background: true });
});

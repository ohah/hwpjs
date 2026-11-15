import definitions from './inline-object-insert-chart-type-options.json' with { type: 'json' };
import { checkedChartCreateProfile } from '../../../js/hwpx-inline-object-insert.mjs';
import type { ChartCreateProfile } from '../../../packages/core/src/commands/inline-object-insert.ts';

/** JSON contains labels/choices, never point data or capability assertions. */
export function createChartTypeOptions(
  host: HTMLElement,
  onChange: (profile: ChartCreateProfile | undefined) => void,
) {
  const doc = host.ownerDocument;
  const label = doc.createElement('label'),
    caption = doc.createElement('span');
  caption.textContent = '차트 종류';
  const kind = doc.createElement('select');
  kind.setAttribute('aria-label', '차트 종류');
  const nodes = new Map<string, HTMLOptionElement>();
  for (const definition of definitions) {
    const option = doc.createElement('option');
    option.value = definition.kind;
    option.textContent = definition.label;
    nodes.set(definition.kind, option);
    kind.append(option);
  }
  kind.value = 'legacy';
  const details = doc.createElement('div');
  details.className = 'inline-object-insert-chart-options';
  const help = doc.createElement('small');
  const fields = new Map<string, HTMLSelectElement>();
  const drafts = new Map<string, Map<string, string>>();
  let version = 0,
    disabled = false,
    current = 'legacy';
  function profile(): ChartCreateProfile | undefined {
    if (kind.value === 'legacy') return undefined;
    const value: Record<string, unknown> = { kind: kind.value };
    for (const [key, select] of fields)
      value[key] = key === 'wireframe' ? select.value === 'true' : select.value;
    return checkedChartCreateProfile(value);
  }
  function support() {
    kind.disabled = disabled;
    for (const [key, node] of nodes)
      node.disabled = disabled || (key !== 'legacy' && version !== 1);
    for (const select of fields.values()) select.disabled = disabled || version !== 1;
    help.textContent =
      version === 1
        ? 'X·Y·크기와 주가 역할은 직접 입력합니다. 종류 변경 시 기존 입력은 종류·옵션별로 보관합니다.'
        : '현재 엔진은 기본 막대 차트만 사용할 수 있습니다. 새 차트 종류를 지원하는 엔진이 연결되면 선택할 수 있습니다.';
  }
  function rebuild() {
    if (fields.size)
      drafts.set(current, new Map(Array.from(fields, ([key, value]) => [key, value.value])));
    current = kind.value;
    const definition = definitions.find((item) => item.kind === current);
    if (!definition) throw Error('InvalidChartCreateProfile');
    details.replaceChildren();
    fields.clear();
    for (const field of definition.fields) {
      const label = doc.createElement('label'),
        caption = doc.createElement('span'),
        select = doc.createElement('select');
      caption.textContent = field.label;
      select.setAttribute('aria-label', field.label);
      for (const choice of field.choices) {
        const option = doc.createElement('option');
        option.value = choice.value;
        option.textContent = choice.label;
        select.append(option);
      }
      select.value = drafts.get(current)?.get(field.key) ?? field.default;
      fields.set(field.key, select);
      label.append(caption, select);
      details.append(label);
      select.addEventListener('change', () => {
        if (!disabled && version === 1) onChange(profile());
      });
    }
    support();
    onChange(profile());
  }
  kind.addEventListener('change', rebuild);
  label.append(caption, kind);
  host.append(label, details, help);
  support();
  return {
    read() {
      const value = profile();
      if (value && version !== 1) throw Error('ChartCreateProfileUnavailable');
      return value;
    },
    setProfileVersion(value: unknown) {
      version = value === 1 ? 1 : 0;
      support();
    },
    setDisabled(value: boolean) {
      disabled = value;
      support();
    },
  };
}

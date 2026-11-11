import {
  EDIT_PAGE_SETTINGS_COMMAND,
  type HeadlessEditor,
  type PageSettingsRead,
  type PageSettingsSource,
  type PageSettingsValues,
} from '@hwpjs/core';
import { createDialogLayer } from './dialog-layer.ts';
const numeric = [
  'width',
  'height',
  'top',
  'bottom',
  'left',
  'right',
  'header',
  'footer',
  'gutter',
] as const;
const labels: Record<(typeof numeric)[number], string> = {
  width: '용지 폭',
  height: '용지 길이',
  top: '위쪽',
  bottom: '아래쪽',
  left: '왼쪽',
  right: '오른쪽',
  header: '머리말',
  footer: '꼬리말',
  gutter: '제본 여백',
};
const reason = (v: string | null) =>
  ({
    MissingPageSettings: '용지 설정이 없는 구역입니다.',
    AmbiguousPageSettings: '용지 설정이 여러 개여서 적용 대상을 확인할 수 없습니다.',
    DuplicatePageMargin: '여백 설정이 중복된 구역입니다.',
    UnsupportedPageSettingsOwner: '이 구역의 용지 설정은 현재 편집할 수 없습니다.',
  })[v ?? ''] ?? '설정 대상을 다시 확인하세요.';
export function createPageSettingsTool(o: {
  root: HTMLElement;
  editor: HeadlessEditor;
  onStatus: (s: string) => void;
  onClose: () => void;
}) {
  let close: undefined | ((force?: boolean) => void);
  return {
    presentation() {
      const s = o.editor.getEditorState();
      return {
        enabled:
          s.status === 'ready' &&
          ['hwpx', 'hwp5'].includes((s.content as any)?.format) &&
          (s.content as any)?.readOnly !== true &&
          (s.capabilities as any)?.readOnly !== true,
        reason: undefined,
      };
    },
    async open() {
      if (close) return;
      const d = o.root.ownerDocument;
      let busy = false,
        disposed = false,
        unsubscribe = () => {};
      const destroy = (force = false) => {
        if (busy && !force) return;
        disposed = true;
        unsubscribe();
        layer.destroy();
        close = undefined;
        o.onClose();
      };
      const layer = createDialogLayer(o.root, {
        role: 'page-settings-dialog',
        title: '편집 용지',
        mode: 'modal',
        onDismiss: destroy,
      });
      close = destroy;
      const status = d.createElement('p');
      status.setAttribute('role', 'status');
      status.textContent = '용지 설정을 읽고 있습니다.';
      layer.body.append(status);
      layer.show();
      let read: PageSettingsRead;
      try {
        read = await o.editor.getPageSettings();
      } catch (error) {
        status.textContent =
          (error as Error).message === 'PageSettingsWriteUnavailable'
            ? '현재 엔진에서는 편집 용지 설정을 지원하지 않습니다.'
            : '용지 설정을 읽지 못했습니다.';
        return;
      }
      if (disposed) return;
      if (read.state !== 'available') {
        status.textContent = '현재 문서 형식에서는 편집 용지 쓰기를 지원하지 않습니다.';
        return;
      }
      const captured = read,
        state = o.editor.getEditorState();
      const scope = d.createElement('select');
      scope.name = 'pageScope';
      scope.setAttribute('aria-label', '적용 범위');
      for (const [value, label] of [
        [
          'section',
          captured.currentSection === null
            ? '현재 구역 미선택'
            : `현재 구역 (${captured.currentSection + 1}구역)`,
        ],
        ['document', `문서 전체 (${captured.sections.length}구역)`],
      ]) {
        const option = d.createElement('option');
        option.value = value;
        option.textContent = label;
        option.disabled = value === 'section' && captured.currentSection === null;
        scope.append(option);
      }
      if (captured.currentSection === null) scope.selectedIndex = -1;
      const scopeLabel = d.createElement('label');
      scopeLabel.textContent = '적용 범위 ';
      scopeLabel.append(scope);
      const orientation = d.createElement('select');
      orientation.name = 'orientation';
      orientation.setAttribute('aria-label', '용지 방향');
      for (const [value, label] of [
        ['widely', '세로'],
        ['narrowly', '가로'],
      ]) {
        const option = d.createElement('option');
        option.value = value;
        option.textContent = label;
        orientation.append(option);
      }
      const gutter = d.createElement('select');
      gutter.name = 'gutterType';
      gutter.setAttribute('aria-label', '제본');
      for (const [value, label] of [
        ['left_only', '한쪽'],
        ['left_right', '맞쪽'],
        ['top_bottom', '위로'],
      ]) {
        const option = d.createElement('option');
        option.value = value;
        option.textContent = label;
        gutter.append(option);
      }
      const directionLabel = d.createElement('label');
      directionLabel.textContent = '용지 방향 ';
      directionLabel.append(orientation);
      const gutterLabel = d.createElement('label');
      gutterLabel.textContent = '제본 ';
      gutterLabel.append(gutter);
      const form = d.createElement('div');
      form.style.cssText =
        'display:grid;grid-template-columns:repeat(3,minmax(130px,1fr));gap:12px';
      const inputs = new Map<(typeof numeric)[number], HTMLInputElement>();
      for (const key of numeric) {
        const label = d.createElement('label'),
          input = d.createElement('input');
        input.type = 'number';
        input.name = key;
        input.min = key === 'width' || key === 'height' ? '0.0001' : '0';
        input.step = '0.0001';
        input.required = true;
        input.style.width = '7em';
        label.textContent = labels[key] + ' (mm) ';
        label.append(input);
        inputs.set(key, input);
        form.append(label);
      }
      const paper = d.createElement('select');
      paper.name = 'paperSize';
      paper.setAttribute('aria-label', '용지 종류');
      for (const [value, label] of [
        ['custom', '사용자 정의'],
        ['a4', 'A4 (210 × 297 mm)'],
        ['a3', 'A3 (297 × 420 mm)'],
        ['a5', 'A5 (148 × 210 mm)'],
      ]) {
        const p = d.createElement('option');
        p.value = value;
        p.textContent = label;
        paper.append(p);
      }
      const paperLabel = d.createElement('label');
      paperLabel.textContent = '용지 종류 ';
      paperLabel.append(paper);
      const instruction = d.createElement('p');
      instruction.textContent =
        '방향을 바꿔도 용지 규격은 유지됩니다. 변경한 설정은 선택한 구역 전체에 적용됩니다.';
      const apply = d.createElement('button'),
        cancel = d.createElement('button');
      apply.type = cancel.type = 'button';
      apply.textContent = '설정';
      cancel.textContent = '취소';
      apply.dataset.role = 'apply-page-settings';
      cancel.addEventListener('click', () => destroy());
      layer.body.prepend(scopeLabel, paperLabel, directionLabel, gutterLabel, form, instruction);
      layer.footer.append(apply, cancel);
      const source: PageSettingsSource | null =
        captured.sections.find((r) => r.section === captured.currentSection)?.source ?? null;
      const sourceValue = (key: (typeof numeric)[number]) =>
        key === 'width' || key === 'height' ? source?.[key] : source?.margin?.[key];
      for (const [key, input] of inputs) {
        const n = sourceValue(key);
        input.value = n == null ? '' : ((n * 25.4) / 7200).toFixed(4);
      }
      orientation.value = source?.orientation ?? '';
      gutter.value = source?.gutter_type ?? '';
      for (const key of ['width', 'height'] as const)
        inputs.get(key)!.addEventListener('input', () => {
          paper.value = 'custom';
        });
      paper.addEventListener('change', () => {
        const size = { a4: [210, 297], a3: [297, 420], a5: [148, 210] }[
          paper.value as 'a4' | 'a3' | 'a5'
        ];
        if (size) {
          inputs.get('width')!.value = String(size[0]);
          inputs.get('height')!.value = String(size[1]);
        }
      });
      const refresh = () => {
        const stale = o.editor.getEditorState() !== state;
        const targets =
          scope.value === 'document'
            ? captured.sections
            : captured.sections.filter((r) => r.section === captured.currentSection);
        const invalid = targets.find((r) => r.reason !== null);
        apply.disabled = busy || stale || !scope.value || targets.length === 0 || Boolean(invalid);
        if (stale && !busy)
          status.textContent = '문서나 선택이 바뀌었습니다. 창을 닫고 다시 열어주세요.';
        else if (invalid) status.textContent = reason(invalid.reason);
        else if (!busy)
          status.textContent =
            scope.value === 'document'
              ? '모든 구역에 한 번에 적용합니다.'
              : '선택한 현재 구역에 적용합니다.';
        inputs.get('left')!.parentElement!.firstChild!.textContent =
          gutter.value === 'left_right' ? '안쪽 (mm) ' : '왼쪽 (mm) ';
        inputs.get('right')!.parentElement!.firstChild!.textContent =
          gutter.value === 'left_right' ? '바깥쪽 (mm) ' : '오른쪽 (mm) ';
      };
      scope.addEventListener('change', refresh);
      gutter.addEventListener('change', refresh);
      unsubscribe = o.editor.registerStateListener(refresh);
      apply.addEventListener('click', async () => {
        refresh();
        if (apply.disabled) return;
        const numbers: Record<string, number> = {};
        for (const [key, input] of inputs) {
          if (!input.reportValidity()) return;
          numbers[key] = Math.round((Number(input.value) * 7200) / 25.4);
        }
        busy = true;
        refresh();
        try {
          const { width, height, ...margin } = numbers;
          const values = {
            orientation: orientation.value,
            width,
            height,
            gutter_type: gutter.value,
            margin,
          } as PageSettingsValues;
          const result = await o.editor.dispatchCommand(EDIT_PAGE_SETTINGS_COMMAND, {
            target: captured.target,
            scope: scope.value as 'section' | 'document',
            values,
          });
          if (result.status === 'committed-with-snapshot' || result.status === 'known-no-op') {
            busy = false;
            destroy();
            o.onStatus(
              result.status === 'known-no-op'
                ? '편집 용지 설정이 같습니다.'
                : '편집 용지를 설정했습니다.',
            );
            return;
          }
          status.textContent =
            result.status === 'committed-refresh-required'
              ? '설정이 적용됐지만 화면을 새로 확인해야 합니다. 다시 적용하지 마세요.'
              : result.error === 'UnsupportedPageLayoutCache'
                ? '기존 배치 정보의 확장을 보존할 수 없어 적용하지 않았습니다. 다른 구역을 선택하거나 창을 닫아주세요.'
                : '용지 설정을 적용하지 못했습니다. 창을 닫고 다시 확인하세요.';
        } catch {
          status.textContent = '용지 크기·여백과 적용 범위를 확인하세요.';
        } finally {
          busy = false;
          apply.disabled = o.editor.getEditorState() !== state;
        }
      });
      refresh();
    },
    dispose() {
      close?.(true);
    },
  };
}

import type { HeadlessEditor } from '@hwpjs/core';
import { createDialogLayer } from './dialog-layer.ts';
import { pictureMillimeters } from './object-properties-input.ts';
import {
  createHwp5ChartPropertiesPort,
  type Hwp5ChartPropertiesTarget,
} from './hwp5-chart-properties-port.ts';

/** HWP5 display-only information. No geometry or data edit command is installed. */
export function createHwp5ChartPropertiesTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  onStatus(text: string): void;
  onClose(): void;
  onEditData?(target: Hwp5ChartPropertiesTarget): void;
  canEditData?(target: Hwp5ChartPropertiesTarget): Promise<boolean>;
}) {
  const port = createHwp5ChartPropertiesPort(options.editor);
  type Observation = ReturnType<typeof port.observe>;
  let closed = false;
  let session: { observation: Observation; layer: ReturnType<typeof createDialogLayer> } | null =
    null;
  const close = (restore = false) => {
    const old = session;
    session = null;
    old?.layer.destroy();
    if (restore && old && !closed && port.current(old.observation)) options.onClose();
  };
  const unsubscribe = port.subscribe(() => {
    if (session && !port.current(session.observation)) close();
  });
  return {
    open(target: Hwp5ChartPropertiesTarget) {
      if (closed) return;
      let observation: Observation;
      try {
        observation = port.observe(target);
      } catch (error) {
        options.onStatus((error as Error).message);
        return;
      }
      if (
        session &&
        port.current(session.observation) &&
        session.observation.target.section === target.section &&
        session.observation.target.controlNode === target.controlNode
      )
        return;
      close();
      const layer = createDialogLayer(options.root, {
        role: 'hwp5-chart-properties',
        title: 'HWP5 차트 속성',
        mode: 'modal',
        onDismiss: () => close(true),
      });
      const current = { observation, layer };
      session = current;
      const doc = options.root.ownerDocument,
        rows = doc.createElement('dl'),
        status = doc.createElement('p'),
        button = doc.createElement('button');
      status.setAttribute('role', 'status');
      status.textContent = '차트 속성을 읽고 있습니다.';
      button.type = 'button';
      button.textContent = '닫기';
      button.addEventListener('click', () => {
        if (session === current) close(true);
      });
      layer.body.append(rows, status);
      layer.footer.append(button);
      layer.show(button);
      if (closed || session !== current || !port.current(observation)) {
        if (session === current) close();
        return;
      }
      void port
        .capture(observation)
        .then((capture) => {
          if (closed || session !== current || !port.current(observation)) return;
          const row = (name: string, value: string) => {
            const dt = doc.createElement('dt'),
              dd = doc.createElement('dd');
            dt.textContent = name;
            dd.textContent = value;
            rows.append(dt, dd);
          };
          row(
            capture.title?.shortened ? '제목 (일부)' : '제목',
            capture.title?.lines.join('\n') ?? '확인할 수 없음',
          );
          row('너비', pictureMillimeters(capture.width) + ' mm');
          row('높이', pictureMillimeters(capture.height) + ' mm');
          status.textContent = '읽기 전용 차트 속성입니다. 크기와 데이터 편집은 지원하지 않습니다.';
          if (options.canEditData && options.onEditData)
            void options
              .canEditData(target)
              .then((enabled) => {
                if (!enabled || closed || session !== current || !port.current(observation)) return;
                const edit = doc.createElement('button');
                edit.type = 'button';
                edit.textContent = '차트 데이터 편집';
                edit.addEventListener('click', () => {
                  if (session !== current || !port.current(observation)) return;
                  close();
                  options.onEditData?.(target);
                });
                layer.footer.append(edit);
                status.textContent =
                  '차트 크기는 읽기 전용입니다. 값과 범주는 데이터 편집에서 수정할 수 있습니다.';
              })
              .catch(() => {});
        })
        .catch((error) => {
          if (!closed && session === current) {
            close();
            options.onStatus((error as Error).message);
          }
        });
    },
    dispose() {
      if (closed) return;
      closed = true;
      unsubscribe();
      close();
    },
  };
}

import type { DemoPageStatusHost } from './page-status.ts';
import { pageRulerModel } from './page-ruler-model.ts';
import './page-ruler.css';

/** UI-only observer. Never measures/reflows document layout or changes editor state. */
export function mountPageRuler(
  root: HTMLElement,
  surface: HTMLElement,
  getHost: () => DemoPageStatusHost | undefined,
) {
  const doc = root.ownerDocument,
    realm = doc.defaultView!;
  const label = doc.createElement('div'),
    clip = doc.createElement('div'),
    track = doc.createElement('div');
  label.className = 'hwp-demo-ruler-label';
  clip.className = 'hwp-demo-ruler-clip';
  track.className = 'hwp-demo-ruler-track';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', '현재 쪽 용지와 여백');
  clip.setAttribute('aria-hidden', 'true');
  clip.append(track);
  root.replaceChildren(label, clip);
  let closed = false,
    pending: number | undefined,
    previous = '';
  const update = () => {
    pending = undefined;
    if (closed) return;
    const model =
      surface.clientWidth > 0 && surface.clientHeight > 0
        ? pageRulerModel(getHost()?.getPageGeometry?.())
        : null;
    if (!model) {
      root.hidden = true;
      delete root.dataset.page;
      label.textContent = '';
      previous = '';
      return;
    }
    // Screen coordinates are measured after scrollbar, stage centering and horizontal scroll.
    root.hidden = false;
    const rootLeft = root.getBoundingClientRect().left;
    clip.style.marginLeft = `${model.viewportLeft - rootLeft}px`;
    clip.style.width = `${model.viewportWidth}px`;
    track.style.left = `${model.paperLeft - model.viewportLeft}px`;
    track.style.width = `${model.width}px`;
    label.textContent = model.label;
    root.dataset.page = String(model.current);
    const key = JSON.stringify([model.width, model.leftMargin, model.rightMargin, model.ticks]);
    if (key === previous) return;
    previous = key;
    const children: HTMLElement[] = [];
    for (const [side, width] of [
      ['left', model.leftMargin],
      ['right', model.rightMargin],
    ] as const) {
      const shade = doc.createElement('span');
      shade.className = `hwp-demo-ruler-margin hwp-demo-ruler-margin-${side}`;
      shade.style.width = `${width}px`;
      children.push(shade);
    }
    for (const tick of model.ticks) {
      const node = doc.createElement('span');
      node.className = `hwp-demo-ruler-tick${tick.major ? ' major' : tick.medium ? ' medium' : ''}`;
      node.style.left = `${tick.x}px`;
      node.textContent = tick.label;
      children.push(node);
    }
    track.replaceChildren(...children);
  };
  const refresh = () => {
    if (!closed && pending === undefined) pending = realm.requestAnimationFrame(update);
  };
  surface.addEventListener('scroll', refresh, true);
  realm.addEventListener('resize', refresh);
  const observer = new realm.ResizeObserver(refresh);
  observer.observe(surface);
  const unsubscribe = getHost()?.subscribePageStatus?.(refresh);
  refresh();
  return {
    refresh,
    dispose() {
      if (closed) return;
      closed = true;
      if (pending !== undefined) realm.cancelAnimationFrame(pending);
      observer.disconnect();
      unsubscribe?.();
      surface.removeEventListener('scroll', refresh, true);
      realm.removeEventListener('resize', refresh);
      root.hidden = true;
      delete root.dataset.page;
      root.replaceChildren();
    },
  };
}

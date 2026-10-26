import assert from 'node:assert/strict';
import test from 'node:test';
import { createMenuPopupLayer } from '../../web/preview/document-menu-popup-layer.mjs';

function harness() {
  const view = new EventTarget();
  view.innerWidth = 320;
  view.innerHeight = 240;
  const panel = new EventTarget();
  panel.style = {};
  panel.open = false;
  panel.showPopover = () => {
    panel.open = true;
  };
  panel.hidePopover = () => {
    panel.open = false;
  };
  panel.matches = () => panel.open;
  panel.getBoundingClientRect = () => ({ width: 220, height: 120 });
  panel.contains = (target) => target === panel;
  const detail = new EventTarget();
  detail.open = false;
  const summary = { getBoundingClientRect: () => ({ left: 300, top: 210, bottom: 230 }) };
  detail.querySelector = (selector) => (selector === 'summary' ? summary : panel);
  const layer = createMenuPopupLayer([detail], view);
  return { panel, detail, view, layer };
}

test('menu popup mirrors details state and clamps to viewport without owning commands', () => {
  const h = harness();
  assert.equal(h.panel.open, false);
  h.detail.open = true;
  h.detail.dispatchEvent(new Event('toggle'));
  assert.equal(h.panel.open, true);
  assert.equal(h.panel.style.left, '92px');
  assert.equal(h.panel.style.top, '88px');
  assert.equal(h.panel.style.maxHeight, '200px');
  h.view.innerWidth = 640;
  h.view.dispatchEvent(new Event('resize'));
  assert.equal(h.panel.style.left, '300px');
  h.detail.open = false;
  h.detail.dispatchEvent(new Event('toggle'));
  assert.equal(h.panel.open, false);
  h.layer.close();
});

test('menu popup ignores stale native close and panel scrolling and removes late listeners', () => {
  const h = harness();
  h.detail.open = true;
  h.detail.dispatchEvent(new Event('toggle'));
  const stale = new Event('toggle');
  stale.newState = 'closed';
  h.panel.dispatchEvent(stale);
  assert.equal(h.detail.open, true);
  const ownScroll = new Event('scroll');
  Object.defineProperty(ownScroll, 'target', { value: h.panel });
  h.view.dispatchEvent(ownScroll);
  assert.equal(h.detail.open, true);
  h.view.dispatchEvent(new Event('scroll'));
  assert.equal(h.detail.open, false);
  h.detail.dispatchEvent(new Event('toggle'));
  assert.equal(h.panel.open, false);
  h.layer.close();
  h.layer.close();
  h.detail.open = true;
  h.detail.dispatchEvent(new Event('toggle'));
  assert.equal(h.panel.open, false);
});

test('menu popup keeps native details fallback when Popover is unavailable', () => {
  const detail = new EventTarget();
  detail.open = true;
  detail.querySelector = () => null;
  const layer = createMenuPopupLayer([detail]);
  assert.equal(detail.open, true);
  layer.close();
});

test('menu popup repositions below when there is room and native dismissal closes the authority', () => {
  const h = harness();
  h.view.innerHeight = 600;
  h.detail.open = true;
  h.detail.dispatchEvent(new Event('toggle'));
  assert.equal(h.panel.style.top, '232px');
  assert.equal(h.panel.style.maxHeight, '360px');
  h.panel.open = false;
  const event = new Event('toggle');
  event.newState = 'closed';
  h.panel.dispatchEvent(event);
  assert.equal(h.detail.open, false);
  h.layer.close();
});

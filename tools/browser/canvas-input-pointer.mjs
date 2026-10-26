import assert from 'node:assert/strict';

// The caret rectangle locates a point; only actual mouse events select it.
export function clickCanvasInputPoint({ command, evaluate }, { section, paragraph, text }) {
  assert(
    Number.isSafeInteger(section) &&
      section >= 0 &&
      Number.isSafeInteger(paragraph) &&
      paragraph >= 0,
  );
  assert.equal(typeof text, 'string');
  command('scrollintoview', '#canvas-input');
  const point = evaluate(`(() => {
    const input=document.querySelector('#canvas-input'),canvas=document.querySelector('#canvas');
    const r=input.getBoundingClientRect(),x=Math.round(r.left+1),y=Math.round(r.top+r.height/2);
    return {x,y,inside:x>=0&&y>=0&&x<innerWidth&&y<innerHeight,canvasHit:document.elementFromPoint(x,y)===canvas};
  })()`);
  assert(
    point?.inside === true &&
      point.canvasHit === true &&
      Number.isSafeInteger(point.x) &&
      Number.isSafeInteger(point.y) &&
      point.x >= 0 &&
      point.y >= 0,
    'InputPointMustHitCanvas',
  );
  evaluate(
    "window.__canvasInputPointer=null;document.querySelector('#canvas').addEventListener('pointerdown',event=>window.__canvasInputPointer={trusted:event.isTrusted,canvas:event.target===document.querySelector('#canvas')},{once:true})",
  );
  command('mouse', 'move', String(point.x), String(point.y));
  assert.equal(evaluate("getComputedStyle(document.querySelector('#canvas')).cursor"), 'text');
  command('mouse', 'down');
  command('mouse', 'up');
  assert.deepEqual(evaluate('window.__canvasInputPointer'), { trusted: true, canvas: true });
  const selected = evaluate(
    "({caret:document.querySelector('#canvas').dataset.caret,text:document.querySelector('#canvas-input').value})",
  );
  assert.equal(selected.text, text, 'PointerSelectedWrongText');
  assert.equal(
    selected.caret?.split(':').slice(0, 2).join(':'),
    `${section}:${paragraph}`,
    'PointerSelectedWrongSource',
  );
  return point;
}

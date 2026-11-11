const menus = new WeakMap();

/** A host binds only the menu that can act on this surface's cell block. */
export function bindCellBlockMenuFocus(menu, ownsInput) {
  menus.set(menu, ownsInput);
}

export function allowsCellBlockMenuFocus(target, input) {
  for (let node = target; node; node = node.parentElement)
    if (menus.get(node)?.(input) === true) return true;
  return false;
}

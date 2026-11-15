/** Only registered property controls may preserve an already certified Canvas selection. */
export function createObjectPropertiesControls(document: Document, current: () => boolean) {
  const controls = new Map<HTMLElement, object>();
  let closed = false;
  return {
    register(element: HTMLElement): () => void {
      if (
        closed ||
        element.ownerDocument !== document ||
        !['BUTTON', 'SUMMARY'].includes(element.tagName)
      )
        return () => {};
      const record = {};
      controls.set(element, record);
      return () => {
        if (controls.get(element) === record) controls.delete(element);
      };
    },
    retain(event: PointerEvent): boolean {
      if (
        closed ||
        !event.isTrusted ||
        !event.isPrimary ||
        event.button !== 0 ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return false;
      const path = event.composedPath();
      const control = path.find((node) => controls.has(node as HTMLElement)) as
        | HTMLElement
        | undefined;
      // Include the control itself and its composed ancestry, including shadow hosts.
      // Registration never exempts a foreign form or editable input surface.
      const foreignInput = path.some((node) => {
        const element = node as HTMLElement;
        return (
          ['INPUT', 'TEXTAREA', 'SELECT', 'FORM'].includes(element.tagName) ||
          element.isContentEditable
        );
      });
      if (
        foreignInput ||
        !control ||
        !control.isConnected ||
        control.ownerDocument !== document ||
        control.hasAttribute('disabled') ||
        !current() ||
        closed ||
        !controls.has(control)
      )
        return false;
      event.preventDefault();
      return true;
    },
    dispose() {
      closed = true;
      controls.clear();
    },
  };
}

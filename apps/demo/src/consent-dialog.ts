export function askConsent(
  root: HTMLElement,
  signal: AbortSignal,
  options: {
    role: string;
    label: string;
    message: string;
    accept: string;
    acceptRole: string;
    cancelRole: string;
  },
): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  const doc = root.ownerDocument,
    dialog = doc.createElement("dialog");
  dialog.dataset.role = options.role;
  dialog.setAttribute("aria-label", options.label);
  const message = doc.createElement("p"),
    accept = doc.createElement("button"),
    cancel = doc.createElement("button");
  message.textContent = options.message;
  accept.type = cancel.type = "button";
  accept.textContent = options.accept;
  cancel.textContent = "취소";
  accept.dataset.role = options.acceptRole;
  cancel.dataset.role = options.cancelRole;
  dialog.append(message, accept, cancel);
  root.append(dialog);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (accepted = false) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", aborted);
      dialog.close();
      dialog.remove();
      resolve(accepted);
    };
    const aborted = () => finish();
    signal.addEventListener("abort", aborted, { once: true });
    accept.addEventListener("click", () => finish(true));
    cancel.addEventListener("click", () => finish());
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish();
    });
    dialog.showModal();
    cancel.focus();
  });
}

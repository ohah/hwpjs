/** Keep the password only in this short-lived input and the caller's unlock request. */
export function askDocumentPassword(
  root: HTMLElement,
  signal: AbortSignal,
  message?: string,
): Promise<string | undefined> {
  if (signal.aborted) return Promise.resolve(undefined);
  const doc = root.ownerDocument,
    dialog = doc.createElement("dialog"),
    form = doc.createElement("form");
  const label = doc.createElement("label"),
    input = doc.createElement("input");
  const submit = doc.createElement("button"),
    cancel = doc.createElement("button");
  label.textContent = "문서 암호 ";
  input.type = "password";
  input.autocomplete = "off";
  input.required = true;
  input.setAttribute("aria-label", "문서 암호");
  label.append(input);
  submit.type = "submit";
  submit.textContent = "문서 열기";
  cancel.type = "button";
  cancel.textContent = "취소";
  if (message) {
    const error = doc.createElement("p");
    error.setAttribute("role", "alert");
    error.textContent = message;
    form.append(error);
  }
  form.append(label, submit, cancel);
  dialog.append(form);
  root.append(dialog);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value?: string) => {
      if (settled) return;
      settled = true;
      input.value = "";
      signal.removeEventListener("abort", aborted);
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const aborted = () => finish();
    signal.addEventListener("abort", aborted, { once: true });
    cancel.addEventListener("click", () => finish());
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      finish(input.value);
    });
    dialog.showModal();
    input.focus();
  });
}

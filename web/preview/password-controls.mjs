/** Password prompt and explicit plaintext-download consent, no crypto/state cache. */
export function createPasswordControls({
  form,
  input,
  submit,
  cancel,
  note,
  consentPanel,
  consent,
  request,
  onCancel,
  update,
}) {
  const events = new AbortController();
  let protectionRemoved = false,
    pending = false;
  const reset = () => {
    protectionRemoved = false;
    pending = false;
    input.value = '';
    form.hidden = true;
    submit.disabled = false;
    input.disabled = false;
    consentPanel.hidden = true;
    consent.checked = false;
    note.textContent = '';
    update();
  };
  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      if (form.hidden || pending) return;
      const password = input.value;
      input.value = '';
      pending = true;
      submit.disabled = true;
      input.disabled = true;
      note.textContent = '비밀번호 확인 중…';
      try {
        request({ kind: 'unlock', origin: 'password', password });
      } catch (error) {
        pending = false;
        submit.disabled = false;
        input.disabled = false;
        note.textContent = `열기 실패: ${error.message}`;
      }
      update();
    },
    { signal: events.signal },
  );
  cancel.addEventListener(
    'click',
    () => {
      reset();
      onCancel();
    },
    { signal: events.signal },
  );
  consent.addEventListener('change', update, { signal: events.signal });
  return {
    reset,
    required() {
      reset();
      form.hidden = false;
      note.textContent = '암호화된 문서입니다. 비밀번호를 입력하세요.';
      input.focus();
    },
    message(value) {
      if (value.kind !== 'unlock') return;
      pending = false;
      submit.disabled = false;
      input.disabled = false;
      input.value = '';
      if (value.error) {
        note.textContent = `열기 실패: ${value.error}`;
        input.focus();
      }
      update();
    },
    loaded(content) {
      reset();
      protectionRemoved = content.passwordProtectionRemoved === true;
      consentPanel.hidden = !protectionRemoved;
      update();
    },
    allowed: () => !protectionRemoved || consent.checked === true,
    removed: () => protectionRemoved,
    close() {
      input.value = '';
      events.abort();
    },
  };
}

// A confirmation card in the same style as the Pause card (replaces the browser's window.confirm).
// Usage: const ok = await confirmCard({ title, message, confirmLabel, cancelLabel });
// Cancel is focused first, Esc or a click outside cancels, and it fades in like the Pause card.
export function confirmCard({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel' }) {
  const root = document.getElementById('confirm');
  if (!root) return Promise.resolve(window.confirm(title + '\n' + message));   // no dialog in the page: fall back

  const ok = root.querySelector('#confirm-ok'), cancel = root.querySelector('#confirm-cancel');
  root.querySelector('#confirm-title').textContent = title;
  root.querySelector('#confirm-msg').textContent = message;
  ok.textContent = confirmLabel; cancel.textContent = cancelLabel;

  return new Promise((resolve) => {
    const before = document.activeElement;
    function done(value) {
      document.removeEventListener('keydown', onKey, true);
      root.removeEventListener('click', onBackdrop);
      ok.removeEventListener('click', onOk); cancel.removeEventListener('click', onCancel);
      root.classList.remove('show');
      setTimeout(() => { root.hidden = true; }, 220);
      if (before && before.focus) before.focus();
      resolve(value);
    }
    const onOk = () => done(true);
    const onCancel = () => done(false);
    const onBackdrop = (e) => { if (e.target === root) done(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }   // do not also close the dialog underneath
    };
    ok.addEventListener('click', onOk); cancel.addEventListener('click', onCancel);
    root.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey, true);

    root.hidden = false;
    requestAnimationFrame(() => { root.classList.add('show'); cancel.focus(); });
  });
}

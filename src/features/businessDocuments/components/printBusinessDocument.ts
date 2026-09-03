/**
 * Adds the `printing-business-document` body class (which `businessDocuments.css`
 * uses to hide the app and promote the sheet), fires `window.print()`, and
 * removes the class again on `afterprint` — with a timeout fallback for
 * browsers that never fire the event (or a cancelled print dialog).
 */
export function printBusinessDocument(): void {
  if (typeof window === 'undefined') return;
  const { body } = document;
  const cleanup = () => {
    body.classList.remove('printing-business-document');
    window.removeEventListener('afterprint', cleanup);
  };
  body.classList.add('printing-business-document');
  window.addEventListener('afterprint', cleanup);
  window.setTimeout(cleanup, 2000);
  window.print();
}

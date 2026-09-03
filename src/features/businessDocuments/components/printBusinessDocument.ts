/**
 * Adds the `printing-business-document` body class (which `businessDocuments.css`
 * uses to hide the app and promote the sheet), fires `window.print()`, and
 * removes the class again on `afterprint` — with a timeout fallback for
 * browsers that never fire the event (or a cancelled print dialog).
 *
 * When a `documentNumber` is passed, `document.title` is swapped to it for
 * the duration of the print so the browser's own top-centre header shows a
 * clean business string (e.g. `SO-2026-0004`) instead of the app title
 * ("Accounting Suite"). It is restored in the same `cleanup`. The other
 * three pieces of browser print chrome — the top-left date, the bottom-left
 * URL and the bottom-right page number — are NOT controllable by any web
 * API; the user must untick "Headers and footers" in the print dialog.
 */
export function printBusinessDocument(documentNumber?: string): void {
  if (typeof window === 'undefined') return;
  const { body } = document;
  const prevTitle = document.title;
  const cleanup = () => {
    body.classList.remove('printing-business-document');
    document.title = prevTitle;
    window.removeEventListener('afterprint', cleanup);
  };
  body.classList.add('printing-business-document');
  if (documentNumber) document.title = documentNumber;
  window.addEventListener('afterprint', cleanup);
  window.setTimeout(cleanup, 2000);
  window.print();
}

/**
 * Opening a stored PDF through pdf.js, normalised to ONE honest outcome
 * shape. The pdf.js library object is INJECTED (not imported) so that:
 *
 *  - the browser hands in the lazily loaded bundle with its worker attached
 *    (src/pdf/pdfEngine.ts — the only module that knows about workers and
 *    asset URLs);
 *  - `node --test` hands in `pdfjs-dist/legacy/build/pdf.mjs` directly and
 *    exercises THIS exact module against real PDF bytes — multi-page and
 *    corrupt alike — with no bundler in the loop.
 *
 * Every way a document can fail to open (truncated bytes, not a PDF at all,
 * an empty blob, a password we cannot ask for) collapses to
 * `{ ok: false, reason: 'unreadable' }`: the viewer's error state does not
 * change with the parser's vocabulary, and the stored bytes are untouched —
 * saving a copy remains available and is offered there.
 */

/**
 * @param {object} pdfjs - the pdf.js library namespace (getDocument).
 * @param {Uint8Array} data - the document bytes. pdf.js takes ownership of
 *   this buffer (it is transferred to the worker where one exists), so
 *   callers must hand in a copy they do not reuse.
 * @param {object} [options] - extra getDocument parameters (asset URLs).
 * @returns {Promise<{ ok: true, doc: object, destroy: () => Promise<void> }
 *   | { ok: false, reason: 'unreadable' }>}
 */
export async function openPdfDocument(pdfjs, data, options = {}) {
  let task = null;
  try {
    task = pdfjs.getDocument({
      data,
      // The document is local and offline by design; pdf.js must never be
      // given a reason to reach a network. isEvalSupported off keeps
      // embedded-font compilation away from Function/eval paths.
      isEvalSupported: false,
      ...options,
    });
    const doc = await task.promise;
    const loadingTask = task;
    return {
      ok: true,
      doc,
      destroy: async () => {
        try {
          await loadingTask.destroy();
        } catch {
          /* a document that failed mid-life has nothing left to release */
        }
      },
    };
  } catch (err) {
    console.warn('Fjallkompis: the stored PDF could not be opened.', err);
    if (task) await task.destroy().catch(() => {});
    return { ok: false, reason: 'unreadable' };
  }
}

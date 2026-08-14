import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type OpenPdfResult =
  | { ok: true; doc: PDFDocumentProxy; destroy: () => Promise<void> }
  | { ok: false; reason: 'unreadable' };

export declare function openPdfDocument(
  pdfjs: unknown,
  data: Uint8Array,
  options?: Record<string, unknown>,
): Promise<OpenPdfResult>;

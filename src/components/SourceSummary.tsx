/**
 * Compact, human-readable source block for the download/archive cards in
 * Settings. Shows a short heading + one-line attribution; the full provider,
 * licence and asset details sit behind a "Source & licence" disclosure so
 * raw URLs never appear as primary UI text.
 *
 * All text derives from the central registry (src/data/attribution.ts).
 */
import { useId, useState } from 'react';
import type { DataSourceAttribution } from '../data/attribution';

export function SourceSummary({
  heading,
  source,
  assetUrl,
}: {
  /** Card-specific heading, e.g. "Map data" or "Imagery". */
  heading: string;
  source: DataSourceAttribution;
  /** Optional raw archive URL, shown only inside the disclosure. */
  assetUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();

  return (
    <div className="source-block">
      <div className="row-between">
        <span className="source-heading">{heading}</span>
        <button
          className="link-btn"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((v) => !v)}
        >
          Source &amp; licence
        </button>
      </div>
      <p className="source-attr">{source.label}</p>
      {source.modifiedNotice ? (
        <p className="source-attr">{source.modifiedNotice}</p>
      ) : null}

      {open ? (
        <div className="source-details" id={detailsId}>
          <p>{source.attribution}</p>
          <p className="source-links">
            {source.licenseName ? (
              <>
                Licence:{' '}
                {source.licenseUrl ? (
                  <a href={source.licenseUrl} target="_blank" rel="noopener noreferrer">
                    {source.licenseName}
                  </a>
                ) : (
                  source.licenseName
                )}
              </>
            ) : null}
            {source.licenseName && source.sourceUrl ? ' · ' : null}
            {source.sourceUrl ? (
              <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
                {source.provider}
              </a>
            ) : null}
          </p>
          {assetUrl ? <p className="source-url">Archive: {assetUrl}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

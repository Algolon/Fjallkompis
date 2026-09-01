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
  extraSources = [],
  assetUrls,
}: {
  /** Card-specific heading, e.g. "Map data" or "Imagery". */
  heading: string;
  source: DataSourceAttribution;
  /**
   * Additional sources shipping inside the SAME archive (the hybrid
   * satellite archive carries Sentinel overview zooms and Lantmäteriet
   * orthophoto detail zooms in one file). Each gets its own label, notice
   * and licence block — one download, every credit.
   */
  extraSources?: DataSourceAttribution[];
  /**
   * Raw archive URLs, shown only inside the disclosure — ALL files a card
   * manages (the Terrain relief card manages two archives; both must be
   * disclosed, not just the first).
   */
  assetUrls?: string[];
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const sources = [source, ...extraSources];

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
      {sources.map((s) => (
        <div key={s.id}>
          <p className="source-attr">{s.label}</p>
          {s.modifiedNotice ? <p className="source-attr">{s.modifiedNotice}</p> : null}
        </div>
      ))}

      {open ? (
        <div className="source-details" id={detailsId}>
          {sources.map((s) => (
            <div key={s.id}>
              <p>{s.attribution}</p>
              <p className="source-links">
                {s.licenseName ? (
                  <>
                    Licence:{' '}
                    {s.licenseUrl ? (
                      <a href={s.licenseUrl} target="_blank" rel="noopener noreferrer">
                        {s.licenseName}
                      </a>
                    ) : (
                      s.licenseName
                    )}
                  </>
                ) : null}
                {s.licenseName && s.sourceUrl ? ' · ' : null}
                {s.sourceUrl ? (
                  <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">
                    {s.provider}
                  </a>
                ) : null}
              </p>
            </div>
          ))}
          {assetUrls?.map((url) => (
            <p key={url} className="source-url">
              Archive: {url}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

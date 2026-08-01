/**
 * Today quick access — pure document-link selection.
 *
 * A ticket belongs to a personal Travel item through that item's attachmentIds.
 * Today already derives the Travel items matching the shown planned day by date;
 * this helper only flattens those explicit links, preserving item/attachment
 * order and removing duplicates. It never infers tickets from filenames,
 * categories, dates or document titles.
 */
export function linkedTravelAttachmentIds(day) {
  if (!day || !Array.isArray(day.travelItems)) return [];
  const seen = new Set();
  const ids = [];
  for (const item of day.travelItems) {
    if (item?.kind !== 'transport' || !Array.isArray(item.attachmentIds)) continue;
    for (const id of item.attachmentIds) {
      if (typeof id !== 'string' || id === '' || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Resolve linked ids to existing document metadata, preserving link order. */
export function linkedTravelDocuments(day, documents) {
  if (!Array.isArray(documents)) return [];
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  return linkedTravelAttachmentIds(day)
    .map((id) => byId.get(id))
    .filter(Boolean);
}

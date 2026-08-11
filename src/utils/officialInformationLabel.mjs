/**
 * User-facing label for an official place link, derived from the source
 * metadata already attached to that place. Only providers whose identity is
 * explicit and useful in the source label are named; everything else keeps
 * the neutral fallback.
 */
export function officialInformationLabel(sourceLabel) {
  if (/^STF(?:\s|—)/i.test(sourceLabel)) return 'View official STF information';
  if (/^Nikkaluokta(?:\s|—)/i.test(sourceLabel)) {
    return 'View official Nikkaluokta information';
  }
  return 'View official information';
}

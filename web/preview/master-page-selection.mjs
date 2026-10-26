/** Select by effective document page number, never by array index or ordinal. */
export function selectMasterPages(profile, pages) {
  if (!profile || !["both", "odd", "even"].includes(profile.apply) || !Array.isArray(pages))
    throw new Error("UnsupportedMasterPageProfile");
  if (profile.apply === "both") return pages;
  for (const page of pages) {
    if (!Number.isInteger(page?.number) || page.number < 1 || page.number > 0xffffffff)
      throw new Error("MissingEffectiveMasterPageNumber");
  }
  const parity = profile.apply === "odd" ? 1 : 0;
  return pages.filter((page) => page.number % 2 === parity);
}

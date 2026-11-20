const familyOf = (face) => face.family.replace(/^(['"])(.*)\1$/, '$2');
function descriptor(snapshot) {
  const rows = snapshot?.paragraphs;
  if (!Array.isArray(rows) || !rows.length) throw Error('InvalidStrictLayoutSnapshot');
  const first = rows[0];
  if (
    !rows.every((p) => p.font === first.font && p.bold === first.bold && p.italic === first.italic)
  )
    throw Error('StrictLayoutNeedsMultipleFonts');
  return {
    family: first.font,
    style: first.italic ? 'italic' : 'normal',
    weight: first.bold ? '700' : '400',
  };
}
export function createStrictLayoutFontOwner(browser = globalThis) {
  let owned;
  function clear() {
    const previous = owned;
    owned = undefined;
    if (previous) previous.fonts.delete(previous.face);
  }
  return {
    clear,
    async acquire(snapshot, file, check) {
      check();
      const d = descriptor(snapshot),
        fonts = browser.document?.fonts;
      if (!fonts || typeof browser.FontFace !== 'function')
        throw Error('ActualBrowserFontMetricsUnavailable');
      if (
        owned &&
        (owned.file !== file ||
          owned.family !== d.family ||
          owned.style !== d.style ||
          owned.weight !== d.weight)
      )
        clear();
      if (owned) return owned;
      const existing = [...fonts].filter((face) => familyOf(face) === d.family);
      if (!file) {
        if (existing.length !== 1 || existing[0].status !== 'loaded')
          throw Error('ChooseMatchingFontFile');
        return { face: existing[0], sourceSHA256: null };
      }
      if (existing.length) throw Error('AmbiguousOwnedFontFamily');
      if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 32 * 1024 * 1024)
        throw Error('InvalidStrictFontFile');
      const bytes = await file.arrayBuffer();
      check();
      if (bytes.byteLength !== file.size) throw Error('StrictFontFileChanged');
      const digest = await browser.crypto.subtle.digest('SHA-256', bytes);
      check();
      let face;
      try {
        face = await new browser.FontFace(d.family, bytes, {
          style: d.style,
          weight: d.weight,
        }).load();
      } catch (cause) {
        check();
        const failure = new Error('StrictFontDecodeFailed', { cause });
        failure.fontProfile = Object.freeze({
          requestedFamily: d.family,
          internalFamilyValidated: false,
          fileName: typeof file.name === 'string' ? file.name : null,
          byteLength: bytes.byteLength,
          signatureHex: [...new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength))]
            .map((value) => value.toString(16).padStart(2, '0'))
            .join(''),
          sourceSHA256: [...new Uint8Array(digest)]
            .map((value) => value.toString(16).padStart(2, '0'))
            .join(''),
          stage: 'font-decode',
        });
        throw failure;
      }
      check();
      if (browser.document.fonts !== fonts || [...fonts].some((f) => familyOf(f) === d.family))
        throw Error('FontEnvironmentChanged');
      fonts.add(face);
      owned = {
        ...d,
        fonts,
        face,
        file,
        sourceSHA256: [...new Uint8Array(digest)]
          .map((v) => v.toString(16).padStart(2, '0'))
          .join(''),
      };
      return owned;
    },
  };
}

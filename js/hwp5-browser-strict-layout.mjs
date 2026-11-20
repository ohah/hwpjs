import { prepareStrictPlainLines } from './hwp5-strict-plain-lines.mjs';

// Internal factory: hooks are created by the owned editor, never from save options.
// Trust boundary is the browser host/realm. Raw WASM exports are not a security
// boundary against a host that deliberately supplies fabricated measurements.
export function createBrowserStrictLayoutSaver({ prepare, commit, cancel, check, publish }) {
  let busy = false;
  return async function saveMeasuredPlainLayout({ fontFace } = {}) {
    check();
    if (busy) throw Error('StrictLayoutMeasurementInProgress');
    if (
      typeof document === 'undefined' ||
      typeof FontFace === 'undefined' ||
      !(fontFace instanceof FontFace) ||
      fontFace.status !== 'loaded' ||
      !document.fonts.has(fontFace)
    )
      throw Error('OwnedLoadedBrowserFontRequired');
    busy = true;
    let primaryFailure, disposeFontWatch, verifyPublication, savedResult;
    // A prepare failure must also release the per-editor lock.
    try {
      const snapshot = prepare();
      const fonts = document.fonts;
      const before = [...fonts];
      const descriptor = (face) =>
        [
          face.family,
          face.style,
          face.weight,
          face.stretch,
          face.unicodeRange,
          face.featureSettings,
          face.variationSettings,
          face.ascentOverride,
          face.descentOverride,
          face.lineGapOverride,
          face.display,
        ].join('\u0000');
      const states = before.map((face) => `${face.status}\u0000${descriptor(face)}`);
      let changed = false;
      const invalidate = () => {
        changed = true;
      };
      for (const event of ['loading', 'loadingdone', 'loadingerror'])
        fonts.addEventListener(event, invalidate);
      disposeFontWatch = () => {
        for (const event of ['loading', 'loadingdone', 'loadingerror'])
          fonts.removeEventListener(event, invalidate);
      };
      try {
        // Snapshot precedes suspension: an edit/undo/redo here invalidates Native ownership.
        await fonts.ready;
        check();
        if (changed || fonts.status !== 'loaded') throw Error('FontEnvironmentChanged');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx || !('fontKerning' in ctx)) throw Error('ActualBrowserFontMetricsUnavailable');
        const family = fontFace.family.replace(/^(['"])(.*)\1$/, '$2');
        if (
          !family ||
          /["\\\r\n]/u.test(family) ||
          fontFace.stretch !== 'normal' ||
          fontFace.unicodeRange.toUpperCase() !== 'U+0-10FFFF' ||
          fontFace.featureSettings !== 'normal' ||
          fontFace.variationSettings !== 'normal'
        )
          throw Error('UnsupportedOwnedFontDescriptor');
        if (
          [
            'serif',
            'sans-serif',
            'monospace',
            'system-ui',
            'cursive',
            'fantasy',
            'emoji',
            'math',
            'fangsong',
          ].includes(family.toLowerCase())
        )
          throw Error('UnsupportedGenericFontFamily');
        // Ambiguous same-family registrations could silently change face selection.
        if (
          before.filter((face) => face.family.replace(/^(['"])(.*)\1$/, '$2') === family).length !==
          1
        )
          throw Error('AmbiguousOwnedFontFamily');
        const lines = prepareStrictPlainLines(snapshot, (text, p) => {
          if (
            p.font !== family ||
            fontFace.style !== (p.italic ? 'italic' : 'normal') ||
            ![p.bold ? 'bold' : 'normal', p.bold ? '700' : '400'].includes(fontFace.weight)
          )
            throw Error('NativeFontBindingMismatch');
          const font = `${p.italic ? 'italic' : 'normal'} ${p.bold ? '700' : '400'} ${p.size / 75}px "${family}"`;
          ctx.font = '1px monospace';
          ctx.font = font;
          if (ctx.font === '1px monospace') throw Error('BrowserFontBindingRejected');
          ctx.fontKerning = 'none';
          ctx.direction = 'ltr';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
          if (!fonts.check(ctx.font, text || 'M')) throw Error('BrowserFontNotReady');
          const m = ctx.measureText(text || 'M');
          // Font-box values, not an invented ratio or ink-box-only baseline.
          return {
            width: text ? m.width : 0,
            ascent: m.fontBoundingBoxAscent,
            descent: m.fontBoundingBoxDescent,
          };
        });
        const assertEnvironment = () => {
          const after = [...fonts];
          if (
            changed ||
            document.fonts !== fonts ||
            fonts.status !== 'loaded' ||
            after.length !== before.length ||
            after.some(
              (face, i) =>
                face !== before[i] || `${face.status}\u0000${descriptor(face)}` !== states[i],
            ) ||
            !fonts.has(fontFace)
          )
            throw Error('FontEnvironmentChanged');
        };
        verifyPublication = assertEnvironment;
        assertEnvironment();
        savedResult = await commit(lines);
        // A Worker commit is asynchronous: discard derived bytes if fonts or
        // UI ownership changed while it ran. No file is published here.
        check();
        assertEnvironment();
      } finally {
        // The outer cleanup retains the font watch across the Worker roundtrip.
      }
    } catch (error) {
      primaryFailure = error;
    }
    try {
      await cancel();
    } catch (error) {
      primaryFailure ??= error;
    }
    try {
      if (!primaryFailure) {
        check();
        verifyPublication?.();
      }
    } catch (error) {
      primaryFailure ??= error;
    }
    try {
      disposeFontWatch?.();
    } catch (error) {
      primaryFailure ??= error;
    }
    busy = false;
    if (primaryFailure) throw primaryFailure;
    // Product publication runs in this same stack after the final guards, not
    // in a later Promise continuation where font state could change again.
    publish?.(savedResult);
    return savedResult;
  };
}

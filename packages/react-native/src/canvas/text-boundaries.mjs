export function createTextBoundaries(host) {
  let disposed = false;
  const live = () => {
    if (disposed) throw Error('DisposedTextBoundaries');
  };
  return Object.freeze({
    capability: Object.freeze({
      protocol: 'hwpjs.native-text-boundaries/1',
      coordinateSpace: 'utf16',
      grapheme: 'NSString-composed-character-sequences',
      word: false,
    }),
    segments(text) {
      live();
      if (typeof text !== 'string' || text.length > 1000000) throw Error('TextBoundaryInput');
      for (let i = 0; i < text.length; i++) {
        const u = text.charCodeAt(i);
        if (u >= 0xd800 && u <= 0xdbff) {
          const v = text.charCodeAt(++i);
          if (!(v >= 0xdc00 && v <= 0xdfff)) throw Error('InvalidUTF16');
        } else if (u >= 0xdc00 && u <= 0xdfff) throw Error('InvalidUTF16');
      }
      const parts = host.segmentText(text);
      live();
      if (!Array.isArray(parts) || parts.length > text.length)
        throw Error('InvalidNativeTextBoundary');
      let next = 0;
      const rows = [];
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (
          part === null ||
          typeof part !== 'object' ||
          !Number.isSafeInteger(part.index) ||
          part.index !== next ||
          typeof part.segment !== 'string' ||
          !part.segment.length ||
          text.slice(next, next + part.segment.length) !== part.segment
        )
          throw Error('InvalidNativeTextBoundary');
        const end = next + part.segment.length;
        if (
          end < text.length &&
          text.charCodeAt(end - 1) >= 0xd800 &&
          text.charCodeAt(end - 1) <= 0xdbff &&
          text.charCodeAt(end) >= 0xdc00 &&
          text.charCodeAt(end) <= 0xdfff
        )
          throw Error('InvalidNativeTextBoundary');
        const row = { index: next, segment: part.segment, input: text };
        next += part.segment.length;
        rows.push(row);
      }
      if (next !== text.length) throw Error('IncompleteNativeTextBoundary');
      // Foundation이 나누어 반환한 CR/LF 경계만 합칩니다. 다른 분절은 원본을 유지합니다.
      const normalized = [];
      for (const row of rows) {
        const previous = normalized[normalized.length - 1];
        if (previous?.segment === '\r' && row.segment === '\n') previous.segment = '\r\n';
        else normalized.push(row);
      }
      return normalized;
    },
    word() {
      live();
      throw Error('NativeWordSegmentationUnavailable');
    },
    dispose() {
      disposed = true;
    },
  });
}

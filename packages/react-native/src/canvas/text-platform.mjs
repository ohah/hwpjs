import { copyTransportDTO } from '../native/owned-dto.ts';
// Explicit opt-in for this isolated app realm. Segmentation/UTF8 codec are Native
// platform services; no fixed glyph widths or document/source parsing are added.
export function installNativeTextPlatform(host, realm = globalThis) {
  const installed = [];
  if (typeof Array.prototype.toSorted !== 'function') {
    Object.defineProperty(Array.prototype, 'toSorted', {
      configurable: true,
      writable: true,
      value(compare) {
        return Array.from(this).sort(compare);
      },
    });
    installed.push('nonmutating-array-sort');
  }
  if (typeof realm.structuredClone !== 'function') {
    realm.structuredClone = (value) => copyTransportDTO(value);
    installed.push('strict-owned-DTO-clone');
  }
  if (typeof realm.TextEncoder !== 'function') {
    realm.TextEncoder = class {
      encode(text = '') {
        return Uint8Array.from(host.encodeUTF8(String(text)));
      }
    };
    installed.push('TextEncoder');
  }
  if (typeof realm.TextDecoder !== 'function') {
    realm.TextDecoder = class {
      constructor(label = 'utf-8') {
        if (!['utf-8', 'utf8'].includes(label.toLowerCase())) throw Error('UnsupportedEncoding');
      }
      decode(bytes = new Uint8Array()) {
        if (!(bytes instanceof Uint8Array)) throw Error('InvalidUTF8Bytes');
        return host.decodeUTF8(bytes);
      }
    };
    installed.push('TextDecoder-fatal-only');
  }
  if (typeof String.prototype.isWellFormed !== 'function') {
    Object.defineProperty(String.prototype, 'isWellFormed', {
      configurable: true,
      writable: true,
      value() {
        const s = String(this);
        for (let i = 0; i < s.length; i++) {
          const c = s.charCodeAt(i);
          if (c >= 0xd800 && c <= 0xdbff) {
            const n = s.charCodeAt(++i);
            if (!(n >= 0xdc00 && n <= 0xdfff)) return false;
          } else if (c >= 0xdc00 && c <= 0xdfff) return false;
        }
        return true;
      },
    });
    installed.push('UTF16-wellformed-check');
  }
  return {
    installed,
    segmentationEquivalence: 'NSString platform segmentation; ICU/Hancom equivalence unverified',
  };
}

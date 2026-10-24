// @ts-ignore Canonical source-policy validation shared with the reader backend.
import {availableSectionCopyRequest} from '../../../../web/preview/hwp5-available-copy-preview.mjs';

export function loadSourceOptions(options:{format:'hwp5'|'hwpx';availableSectionCopy?:boolean;enableOptions?:Readonly<Record<string,unknown>>}):{availableSectionCopy?:boolean} {
 if(options.availableSectionCopy===undefined)return {};
 availableSectionCopyRequest({format:options.format,availableSectionCopy:options.availableSectionCopy,
  distribution:options.enableOptions?.distribution,normalizeObservedCfb:options.enableOptions?.normalizeObservedCfb});
 return {availableSectionCopy:options.availableSectionCopy};
}

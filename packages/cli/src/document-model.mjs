import { LIMITS } from './model/common.mjs';
import { collectHwp5 } from './model/hwp5.mjs';
import { collectHwpx } from './model/hwpx.mjs';
import { project } from './model/project.mjs';

/** Read-only SDK observations -> owned scalar/string view. Never an edit model. */
export async function readDocumentModel({ format, sourceSha256, sectionCount, sdk } = {}) {
  if (!['hwp5', 'hwpx'].includes(format)) throw new TypeError('InvalidDocumentFormat');
  if (typeof sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sourceSha256))
    throw new TypeError('InvalidSourceSha256');
  if (!Number.isInteger(sectionCount) || sectionCount < 1 || sectionCount > 4096)
    throw new RangeError('SectionLimitExceeded');
  if (!sdk || typeof sdk !== 'object') throw new TypeError('MissingSdk');
  const observations =
    format === 'hwp5' ? collectHwp5({ sdk, sectionCount }) : collectHwpx({ sdk, sectionCount });
  return project({ format, sourceSha256, observations }, LIMITS);
}

import { LIMITS } from './model/common.ts';
import { collectHwp5 } from './model/hwp5.ts';
import { collectHwpx } from './model/hwpx.ts';
import { project } from './model/project.ts';
import type { DocumentView, ObservationSdk } from './types/document-view.ts';

// SDK 관측을 소유 스칼라·문자열로 투영하며 편집 원문 모델은 만들지 않습니다.
export async function readDocumentModel(input: unknown = {}): Promise<DocumentView> {
  if (input === null || typeof input !== 'object') throw new TypeError('InvalidDocumentFormat');
  const { format, sourceSha256, sectionCount, sdk } = input as Record<string, unknown>;
  if (format !== 'hwp5' && format !== 'hwpx') throw new TypeError('InvalidDocumentFormat');
  if (typeof sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sourceSha256))
    throw new TypeError('InvalidSourceSha256');
  if (
    typeof sectionCount !== 'number' ||
    !Number.isInteger(sectionCount) ||
    sectionCount < 1 ||
    sectionCount > 4096
  )
    throw new RangeError('SectionLimitExceeded');
  if (!sdk || typeof sdk !== 'object') throw new TypeError('MissingSdk');
  const context = { sdk: sdk as ObservationSdk, sectionCount };
  const observations = format === 'hwp5' ? collectHwp5(context) : collectHwpx(context);
  return project({ format, sourceSha256, observations }, LIMITS);
}

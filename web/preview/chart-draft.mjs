import { projectDraftAnchoredObjects } from './anchored-object-draft.mjs';

/** Disposable UTF-16 positions only; Native targets and snapshots remain unchanged. */
export function projectDraftChartTargets(content, draft) {
  if (!Array.isArray(content.chartTargets)) return content.chartTargets;
  return projectDraftAnchoredObjects(
    content,
    content.chartTargets,
    draft,
    (target) =>
      !target.error_name && Number.isSafeInteger(target.anchorUnit) && target.anchorUnit >= 0,
  );
}

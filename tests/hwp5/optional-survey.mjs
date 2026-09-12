// Corpus observations, NOT a _LinkDoc validator or a guessed path decoder.
// Do not print embedded document paths or treat a common size as a normative rule.
import {linkDocEvidence} from './doc-options-evidence.mjs';
export function optionalSurvey(cfb) {
  const link = cfb.findExact("/DocOptions/_LinkDoc");
  const bytes = link ? Buffer.from(link.content) : null;
  const observed = bytes === null ? null : linkDocEvidence(bytes);
  return [
    Number(link !== null && link !== undefined),
    observed?.bytes ?? 0,
    Number(observed?.bytes === 524),
    Number(observed?.firstWord === 0),
    Number(observed?.allZero === true),
    Number(cfb.findExact("/XMLTemplate") != null),
  ];
}

// Corpus observations, NOT a _LinkDoc validator or a guessed path decoder.
// Do not print embedded document paths or treat a common size as a normative rule.
export function optionalSurvey(cfb) {
  const link = cfb.findExact("/DocOptions/_LinkDoc");
  const bytes = link ? Buffer.from(link.content) : null;
  return [
    Number(link !== null && link !== undefined),
    bytes?.length ?? 0,
    Number(bytes !== null && bytes.length === 524),
    Number(bytes !== null && bytes.length >= 2 && bytes.readUInt16LE(0) === 0),
    Number(bytes !== null && bytes.length > 0 && bytes.every((b) => b === 0)),
    Number(cfb.findExact("/XMLTemplate") != null),
  ];
}

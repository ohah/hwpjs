/** Read only the HWPX gate's literal initial paths and standalone addArg lines. */
export function hwpxGateTestPaths(source) {
  const start = source.indexOf("const hwpx_text_tests =");
  const end = source.indexOf("hwpx_text_tests.step.dependOn", start);
  if (start < 0 || end <= start) throw new Error("MissingHwpxGate");
  const block = source.slice(start, end);
  const initial = /^const hwpx_text_tests = b\.addSystemCommand\(&\.\{([^\n]*)\}\);/m.exec(block);
  if (!initial) throw new Error("MissingHwpxGateInitialArguments");
  return [...initial[1].matchAll(/"(tests\/hwpx\/[^"\n]*\.test\.mjs)"/g),
    ...block.matchAll(/^\s*hwpx_text_tests\.addArg\("(tests\/hwpx\/[^"\n]*\.test\.mjs)"\);\s*$/gm)].map(match => match[1]);
}

export function verifyHwpxGateRegistration(source, paths) {
  const registrations = hwpxGateTestPaths(source);
  for (const path of paths) if (registrations.filter(value => value === path).length !== 1) throw new Error(`HwpxGateRegistration: ${path}`);
}

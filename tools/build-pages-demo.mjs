#!/usr/bin/env node
/** Explicit static bundle publication. Verification needs only Node built-ins. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertOutputPath, digest, validateBundle } from "./pages-demo/bundle-validation.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
function optionsFor(flags) {
  const options = new Map();
  if (flags.length % 2) throw Error("BundleModeUsage");
  for (let i = 0; i < flags.length; i += 2) {
    if (!["--bundle-dir", "--out"].includes(flags[i]) || options.has(flags[i]))
      throw Error("BundleModeUsage");
    options.set(flags[i], flags[i + 1]);
  }
  return options;
}
function outputFor(options) {
  const output = resolve(root, options.get("--out") ?? "apps/docs/docs/public/editor");
  assertOutputPath(root, output);
  return output;
}
if (args.includes("--verify")) {
  const options = optionsFor(args.filter((arg) => arg !== "--verify"));
  if (options.has("--bundle-dir")) throw Error("BundleModeUsage");
  const bundle = await validateBundle(outputFor(options));
  console.log(
    JSON.stringify({
      verified: true,
      files: bundle.files.size,
      base: bundle.manifest.base,
      wasmSha256: bundle.manifest.wasmSha256,
    }),
  );
} else if (args.includes("--bundle-dir")) {
  const options = optionsFor(args);
  const { validateProductionBundle } = await import("./pages-demo/bundle-production.mjs");
  const { publishBundle } = await import("./pages-demo/bundle-publish.mjs");
  const bundle = await validateProductionBundle(resolve(options.get("--bundle-dir")), { root });
  const output = outputFor(options);
  await publishBundle(bundle, { root, output });
  console.log(
    JSON.stringify({
      output,
      mode: "verified-bundle-input",
      files: bundle.files.size,
      manifestSha256: digest(bundle.manifestBytes),
      wasmSha256: bundle.manifest.wasmSha256,
    }),
  );
} else if (args.includes("--legacy-dist")) {
  const { buildLegacyDist } = await import("./pages-demo/legacy-dist.mjs");
  await buildLegacyDist({ root, args: args.filter((arg) => arg !== "--legacy-dist") });
} else {
  throw Error(
    "ExplicitBundleInputRequired: use --bundle-dir; --legacy-dist is the prior dist pipeline",
  );
}

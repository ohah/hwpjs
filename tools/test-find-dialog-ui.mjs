#!/usr/bin/env bun
// Focused source regression. Requires existing workspace dependencies; installs nothing.
import { resolve, dirname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
const ownRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2),
  candidateArg = args.find((s) => s.startsWith("--candidate=")),
  rootArg = args.find((s) => s.startsWith("--repo="));
if (args.some((s) => !s.startsWith("--candidate=") && !s.startsWith("--repo=")))
  throw Error("UnknownArgument");
const root = rootArg ? resolve(rootArg.slice(7)) : ownRoot;
const sources = candidateArg ? resolve(root, candidateArg.slice(12)) : root;
const tests = [
  "apps/demo/tests/text-tools-window.test.ts",
  "apps/demo/tests/replacement-selection.test.ts",
  "packages/vanilla/tests/surface-selection-owner.test.ts",
  "tests/hwpx/canvas-selection-origin.test.mjs",
];
const temp = await mkdtemp(resolve(tmpdir(), "hwpjs-find-source-"));
try {
  for (const test of tests) {
    const entry = resolve(sources, test),
      surface = test.includes("surface-selection-owner");
    const result = await Bun.build({
      entrypoints: [entry],
      outdir: temp,
      target: "bun",
      plugins: [
        {
          name: "focused-source-routing",
          setup(build) {
            build.onResolve({ filter: /^@hwpjs\/core$/ }, () => ({
              path: resolve(root, "packages/core/src/index.ts"),
            }));
            build.onResolve({ filter: /.*/ }, async (a) => {
              if (!a.path.startsWith(".") && !a.path.startsWith("/")) return null;
              let path = resolve(a.importer ? dirname(a.importer) : root, a.path),
                rel = relative(sources, path);
              if (surface && /(?:renderer|canvas-editor)\.mjs$/.test(path))
                return {
                  path: resolve(sources, "packages/vanilla/tests/surface-selection-fixture.mjs"),
                };
              // Candidate modules may import unchanged sibling modules from the actual source tree.
              if (rel.startsWith("..")) {
                const marker = a.importer?.includes("/files/")
                  ? a.importer.split("/files/")[1]
                  : null;
                if (marker && a.path.startsWith(".")) {
                  const canonical = resolve(root, dirname(marker), a.path),
                    owned = resolve(sources, relative(root, canonical));
                  try {
                    await access(owned);
                    return { path: owned };
                  } catch {
                    return { path: canonical };
                  }
                }
                return null;
              }
              try {
                await access(path);
                return null;
              } catch {
                return { path: resolve(root, rel) };
              }
            });
            build.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
          },
        },
      ],
    });
    if (!result.success) {
      console.error(result.logs);
      process.exitCode = 1;
      break;
    }
    const file = resolve(temp, basename(test).replace(/\.(?:ts|mjs)$/, ".js"));
    const p = Bun.spawn(["bun", "test", file], { cwd: root, stdout: "inherit", stderr: "inherit" });
    if (await p.exited) {
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}

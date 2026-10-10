// Corpus scope includes tracked demos as well as test fixture directories.
import { execFileSync } from "node:child_process";

export function selectHwpxFiles(listing) {
  const paths = listing.split("\0").filter(path => path.endsWith(".hwpx"));
  if (!paths.length) throw new Error("EmptyFixtureInventory");
  if (new Set(paths).size !== paths.length) throw new Error("DuplicateFixturePath");
  return paths;
}

export function trackedHwpxFiles() {
  return selectHwpxFiles(execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }));
}

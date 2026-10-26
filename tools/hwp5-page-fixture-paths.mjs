import { readFileSync } from "node:fs";
const signature = Buffer.from("d0cf11e0a1b11ae1", "hex");

// Include demos and renamed .hwpx CFB inputs; do not use directory placement.
export function hwp5PageFixturePaths(paths, read = readFileSync) {
  return [...new Set(paths.filter((path) => /\.(hwp|hwpx)$/i.test(path)))]
    .filter((path) => Buffer.from(read(path)).subarray(0, 8).equals(signature))
    .sort();
}

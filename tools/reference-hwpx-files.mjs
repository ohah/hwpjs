import { readdirSync } from "node:fs";
import { join } from "node:path";

function inventory(root, allDocuments) {
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && (allDocuments ? /\.(hwp|hwpx)$/i : /\.hwpx$/i).test(entry.name))
        files.push(path);
    }
  }
  walk(root);
  files.sort();
  if (!files.length) throw new Error("EmptyFixtureInventory");
  return files;
}

export function referenceHwpxFiles(root) {
  return inventory(root, false);
}
export function referenceDocumentFiles(root) {
  return inventory(root, true);
}

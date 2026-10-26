// Preflight only: validate every explicit asset before writing any public file.
import { readFile, realpath, lstat } from "node:fs/promises";
import { resolve, sep } from "node:path";

export async function prepareFixturePlan(root, fixtures) {
  const base = resolve(root),
    destination = resolve(base, "web/preview/demo-fixtures");
  if ((await realpath(destination)) !== destination) throw new Error("UnsafeFixtureDestination");
  const seen = new Set(),
    output = [];
  for (const fixture of fixtures) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(hwp|hwpx)$/.test(fixture.id) || seen.has(fixture.id))
      throw new Error("InvalidFixtureId");
    seen.add(fixture.id);
    const source = resolve(base, fixture.path),
      target = resolve(destination, fixture.id);
    if (!source.startsWith(base + sep) || (await realpath(source)) !== source)
      throw new Error("UnsafeFixtureSource");
    try {
      const info = await lstat(target);
      if (!info.isFile() || info.nlink !== 1) throw new Error("UnsafeFixtureTarget");
      if ((await realpath(target)) !== target) throw new Error("UnsafeFixtureTarget");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const bytes = await readFile(source);
    if (bytes.length > 64 * 1024 * 1024) throw new Error("FixtureTooLarge");
    output.push({ target, bytes });
  }
  return output;
}

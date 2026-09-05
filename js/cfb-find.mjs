// Adapted from SheetJS CFB.find (Apache-2.0); see THIRD_PARTY_NOTICES.md.
// Search a retained JS snapshot independently of the active WASM document.
export function findEntry(container, path) {
  const paths = container.FullPaths.map((p) => p.toUpperCase());
  const names = paths.map((p) => {
    const parts = p.split("/");
    return parts[parts.length - (p.endsWith("/") ? 2 : 1)];
  });
  const qualified = path.includes("/");
  if (path.startsWith("/")) path = paths[0].slice(0, -1) + path;
  let query = path.toUpperCase();
  const direct = (qualified ? paths : names).indexOf(query);
  if (direct >= 0) return container.FileIndex[direct];
  const controls = !/[\u0001-\u0006]/.test(query);
  const normalize = (s) =>
    (controls ? s.replace(/[\u0001-\u0006]/g, "!") : s).replace(/\0/g, "");
  query = normalize(query);
  const index = paths.findIndex(
    (p, i) => normalize(p) === query || normalize(names[i]) === query,
  );
  return index < 0 ? null : container.FileIndex[index];
}

// Separate process: no module mock of vanilla. Resolve public workspace names
// to their public source entries while package dist is being built by main.
import { plugin } from "bun";
import { fileURLToPath } from "node:url";
plugin({
  name: "public-workspace-entry-fixture",
  setup(build) {
    build.onResolve({ filter: /^@hwpjs\/(core|vanilla)$/ }, (args) => ({
      path: fileURLToPath(
        new URL(`../../${args.path.split("/")[1]}/src/index.ts`, import.meta.url),
      ),
    }));
  },
});
for (const name of ["window", "document", "ResizeObserver"]) {
  Object.defineProperty(globalThis, name, { value: undefined, configurable: true });
}
Object.defineProperty(globalThis, "Worker", {
  value: class {
    constructor() {
      throw Error("SSRWorkerSideEffect");
    }
  },
  configurable: true,
});
Object.defineProperty(globalThis, "fetch", {
  value: () => {
    throw Error("SSRFetchSideEffect");
  },
  configurable: true,
});
const { createElement } = await import("react");
const { renderToString } = await import("react-dom/server");
const { CanvasSurface } = await import("../src/index.ts");
const html = renderToString(
  createElement(CanvasSurface, { editor: {} as any, "aria-label": "SSR host" }),
);
if (!html.includes("height:100%") || !html.includes("SSR host") || html.includes("canvas"))
  throw Error("InvalidSSRHost");
console.log("public React+vanilla import and SSR render OK; no browser host created");

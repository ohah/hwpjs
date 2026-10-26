import { readFile, writeFile, mkdir, readdir, lstat, rename, rm } from "node:fs/promises";
import { resolve, dirname, relative, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export async function buildLegacyDist({ root, args }) {
  const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i < 0 ? fallback : args[i + 1];
  };
  if (args.some((x, i) => i % 2 === 0 && !["--base", "--out"].includes(x)) || args.length % 2)
    throw Error("Usage: --base /hwpjs/editor/ --out apps/docs/docs/public/editor");
  const base = option("--base", "/hwpjs/editor/");
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*editor\/$/.test(base)) throw Error("InvalidEditorBase");
  const output = resolve(root, option("--out", "apps/docs/docs/public/editor"));
  const permitted = [
    resolve(root, "apps/docs/docs/public/editor"),
    resolve(root, "zig-out/verification") + "/",
  ];
  if (output !== permitted[0] && !output.startsWith(permitted[1]))
    throw Error("OutputOutsideOwnedPaths");
  const stage = output + ".packaging";
  try {
    await lstat(stage);
    throw Error("PackagingStageAlreadyExists");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const sha = (bytes) => createHash("sha256").update(bytes).digest("hex"),
    files = new Map(),
    inputs = [];
  const safe = (p) => {
    if (!p || p.startsWith("/") || p.split("/").includes("..") || p.includes("\\"))
      throw Error("UnsafeAssetPath:" + p);
    return p;
  };
  async function input(path) {
    const full = resolve(root, path);
    if ((await lstat(full)).isSymbolicLink()) throw Error("SymlinkInput");
    const bytes = await readFile(full);
    inputs.push({ path, sha256: sha(bytes), bytes: bytes.length });
    return bytes;
  }
  const fixtures = [
    { id: "noori.hwp", name: "noori.hwp", label: "noori.hwp", available: true },
    { id: "noori.hwpx", name: "noori.hwpx", label: "noori.hwpx", available: true },
  ];
  const fixtureSource = "legacy/rust/documents/docs/public/demo/";
  for (const f of fixtures) {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", fixtureSource + f.name], {
      cwd: root,
      stdio: "pipe",
    });
    files.set("fixtures/" + f.name, await input(fixtureSource + f.name));
  }
  // License inputs are exact metadata/license files, never package source trees.
  const projectLicense = await input("LICENSE"),
    recordedNotices = await input("docs/third-party-notices.md");
  const noticeParts = [recordedNotices.toString()];
  const licensePackages = [];
  for (const [name, licenseName] of [
    ["react", "LICENSE"],
    ["react-dom", "LICENSE"],
    ["svelte", "LICENSE.md"],
  ]) {
    const metadataPath = fileURLToPath(import.meta.resolve(name + "/package.json"));
    const metadata = JSON.parse((await input(relative(root, metadataPath))).toString());
    if (
      metadata.name !== name ||
      metadata.license !== "MIT" ||
      typeof metadata.version !== "string"
    )
      throw Error("UnexpectedPackageLicense:" + name);
    const original = await input(relative(root, resolve(dirname(metadataPath), licenseName)));
    noticeParts.push(
      `\n\n===== ${name} ${metadata.version} — ${metadata.license} =====\n\n` + original.toString(),
    );
    licensePackages.push({
      name,
      version: metadata.version,
      license: metadata.license,
      licenseSha256: sha(original),
    });
  }
  const notices = Buffer.from(noticeParts.join(""));
  for (const original of [projectLicense, notices])
    if (
      /(?:\.ts\.net|tailscale|\/Users\/|localhost|127\.0\.0\.1|https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.))/i.test(
        original.toString(),
      )
    )
      throw Error("InternalAddressInLicense");
  files.set("LICENSE.txt", projectLicense);
  files.set("THIRD_PARTY_NOTICES.txt", notices);
  let catalogReplacements = 0;
  function sanitizeCatalog(source) {
    for (const marker of ["c48ff5f6686da9fa-noori.hwp", "hongbo-observed-docinfo.hwp"]) {
      const hit = source.indexOf(marker);
      if (hit < 0) continue;
      const start = source.lastIndexOf("Object.freeze([", hit);
      if (start < 0) throw Error("CatalogShapeChanged");
      let depth = 0,
        quote = null,
        escaped = false,
        end = -1;
      for (let i = start + "Object.freeze(".length; i < source.length; i++) {
        const c = source[i];
        if (quote) {
          if (escaped) escaped = false;
          else if (c === "\\") escaped = true;
          else if (c === quote) quote = null;
          continue;
        }
        if ("\"'`".includes(c)) {
          quote = c;
          continue;
        }
        if (c === "[") depth++;
        if (c === "]" && --depth === 0) {
          if (source[i + 1] !== ")") throw Error("CatalogShapeChanged");
          end = i + 2;
          break;
        }
      }
      if (end < 0) throw Error("UnclosedCatalog");
      source =
        source.slice(0, start) +
        "Object.freeze(" +
        JSON.stringify(fixtures.map(({ available: _privateAvailability, ...f }) => f)) +
        ")" +
        source.slice(end);
      catalogReplacements++;
    }
    return source;
  }
  function rewrite(source) {
    source = sanitizeCatalog(source)
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*# sourceMappingURL=[\s\S]*?\*\//g, "");
    const replacements = {
      "/hwpjs/worker.js": base + "runtime/worker.js",
      "/hwpjs/hwpjs.wasm": base + "hwpjs/hwpjs.wasm",
      "/demo-fixture-catalog.json": base + "fixture-catalog.json",
      "/web/preview/demo-fixtures/": base + "fixtures/",
    };
    for (const [a, b] of Object.entries(replacements)) {
      const target = b.slice(base.length);
      for (const q of ['"', "'", "`"])
        source = source.replaceAll(
          q + a + q,
          `new URL(${JSON.stringify("../" + target)},import.meta.url).href`,
        );
    }
    source = source.replace(
      /(["'`])\/demo\/(vanilla|react|svelte|headless)\1/g,
      (_, q, f) => `new URL(${JSON.stringify("../demo/" + f + "/")},import.meta.url).pathname`,
    );
    source = source.replace(
      /(["'`])\/assets\/([^"'`]+)\1/g,
      (_, q, p) =>
        `new URL(${JSON.stringify(p.endsWith(".wasm") ? "../hwpjs/hwpjs.wasm" : "./" + p)},import.meta.url).href`,
    );
    // Vite's runtime preload helper otherwise prepends the origin root.
    source = source.replace(
      /([A-Za-z_$][\w$]*)=>["'`]\/["'`]\+\1/g,
      (_, v) => `${v}=>new URL("../"+${v},import.meta.url).href`,
    );
    if (
      /(?:\.ts\.net|tailscale|\/Users\/|reference\/rhwp|legacy\/rust\/|sourceMappingURL)/i.test(
        source,
      )
    )
      throw Error("PrivateOrSourcePathInPublishedText");
    return source;
  }
  const pending = [];
  const seen = new Set();
  function enqueue(kind, path) {
    safe(path);
    pending.push({ kind, path });
  }
  let html = (await input("apps/demo/dist/index.html")).toString();
  for (const m of html.matchAll(/(?:src|href)=["']\/([^"']+)["']/g)) enqueue("demo", m[1]);
  const canonicalWasm = await input("packages/core/dist/hwpjs.wasm");
  files.set("hwpjs/hwpjs.wasm", canonicalWasm);
  enqueue("core", "worker.js");
  enqueue("core", "index.js");
  enqueue("core", "runtime.js");
  while (pending.length) {
    const { kind, path } = pending.shift(),
      key = kind + ":" + path;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!/\.(?:js|css|wasm|woff2?|ttf|png|svg|ico)$/.test(path))
      throw Error("UnapprovedAssetType:" + path);
    const bytes = await input((kind === "demo" ? "apps/demo/dist/" : "packages/core/dist/") + path);
    let body = bytes;
    if (path.endsWith(".wasm")) {
      if (!bytes.equals(canonicalWasm)) throw Error("BundledWasmDiffersFromCanonical");
      continue;
    }
    if (/\.(?:js|css)$/.test(path)) {
      const source = bytes.toString();
      for (const m of source.matchAll(
        /["'`]((?:\.\.\/|\.\/|\/?assets\/)[^"'`\s]+?\.(?:js|css|wasm|woff2?|ttf|png|svg|ico))["'`]/g,
      )) {
        const spec = m[1],
          target = spec.startsWith("/assets/")
            ? spec.slice(1)
            : spec.startsWith("assets/")
              ? spec
              : posix.normalize(posix.join(posix.dirname(path), spec));
        enqueue(kind, target);
      }
      body = Buffer.from(rewrite(source));
    }
    if (kind === "core" && path === "runtime.js")
      body = Buffer.from(
        body
          .toString()
          .replaceAll(
            'new URL("./hwpjs.wasm", import.meta.url)',
            'new URL("../hwpjs/hwpjs.wasm", import.meta.url)',
          ),
      );
    files.set((kind === "core" ? "runtime/" : "") + path, body);
  }
  if (catalogReplacements !== 2) throw Error("ExpectedTwoCatalogs:" + catalogReplacements);
  html = html.replaceAll('="/assets/', '="./assets/');
  const favicon =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#2563eb"/><path d="M9 7h4v7h6V7h4v18h-4v-7h-6v7H9z" fill="white"/></svg>',
    );
  html = html.replace("</head>", `  <link rel="icon" href="${favicon}">\n  </head>`);
  files.set("index.html", Buffer.from(html));
  for (const name of ["vanilla", "react", "svelte", "headless"])
    files.set(
      "demo/" + name + "/index.html",
      Buffer.from(html.replaceAll('="./assets/', '="../../assets/')),
    );
  files.set("fixture-catalog.json", Buffer.from(JSON.stringify(fixtures, null, 2) + "\n"));
  const apiModule = await input("apps/demo/src/api-playground.mjs");
  files.set("api/playground.js", Buffer.from(rewrite(apiModule.toString())));
  files.set(
    "api/main.js",
    Buffer.from(`import {createEditor,SPLICE_TEXT_COMMAND,getHistoryAvailability} from '../runtime/index.js';
import {createWorkerRuntimeFactory} from '../runtime/runtime.js';
import {mountApiPlayground} from './playground.js';
const editor=createEditor({runtimeFactory:createWorkerRuntimeFactory({workerURL:new URL('../runtime/worker.js',import.meta.url),wasmURL:new URL('../hwpjs/hwpjs.wasm',import.meta.url)})});
const panel=mountApiPlayground(document.querySelector('main'),{editor,spliceCommand:SPLICE_TEXT_COMMAND,getHistoryAvailability,async loadFixture(format){const name=format==='hwp5'?'noori.hwp':'noori.hwpx';const response=await fetch(new URL('../fixtures/'+name,import.meta.url));if(!response.ok)throw Error('FixtureFetchFailed');return new Uint8Array(await response.arrayBuffer());}});
window.addEventListener('pagehide',()=>{panel.dispose();void editor.dispose();},{once:true});
`),
  );
  files.set(
    "api/index.html",
    Buffer.from(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Headless API 실행</title><link rel="icon" href="${favicon}"><style>body{font:16px system-ui;margin:0;padding:20px;color:#172033;background:#fff}main{max-width:1100px;margin:auto}label{display:block;margin:14px 0}textarea{display:block;width:100%;box-sizing:border-box;font:14px monospace}select,button{font:inherit;padding:8px}button{margin:8px 12px 8px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f8;padding:14px;max-height:420px;overflow:auto}button:disabled{opacity:.5}</style><script type="module" src="./main.js"></script></head><body><main></main></body></html>`,
    ),
  );
  // Resolve every bundled static reference against two mount prefixes without a server.
  for (const prefix of ["/hwpjs/editor/", "/docs/editor/"])
    for (const [path, body] of files) {
      if (!/\.(?:js|css|html)$/.test(path)) continue;
      const source = body.toString(),
        refs = [];
      for (const m of source.matchAll(/new URL\(["']([^"']+)["'],\s*import\.meta\.url\)/g))
        refs.push(m[1]);
      for (const m of source.matchAll(/(?:from\s*|import\s*\(|import\s*)["'](\.[^"']+)["']/g))
        refs.push(m[1]);
      if (path.endsWith(".html"))
        for (const m of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) refs.push(m[1]);
      for (const ref of refs) {
        if (ref.startsWith("data:image/svg+xml,")) continue;
        const target = new URL(ref, "https://static.invalid" + prefix + path);
        if (
          !target.pathname.startsWith(prefix) ||
          !(
            files.has(decodeURIComponent(target.pathname.slice(prefix.length))) ||
            (target.pathname.endsWith("/") &&
              [...files.keys()].some((p) =>
                p.startsWith(decodeURIComponent(target.pathname.slice(prefix.length))),
              ))
          )
        )
          throw Error("MissingStaticDependency:" + path + ":" + ref);
      }
      if (path.endsWith(".js"))
        execFileSync(process.execPath, ["--check", "--input-type=module"], {
          input: source,
          stdio: ["pipe", "pipe", "pipe"],
        });
    }

  const manifest = {
    schemaVersion: 1,
    base: "relative",
    supportedPrefixes: ["/hwpjs/editor/", "/docs/editor/"],
    mode: "frozen-dist-closure",
    licenses: {
      project: "LICENSE.txt",
      thirdParty: "THIRD_PARTY_NOTICES.txt",
      packages: licensePackages,
    },
    frameworks: ["vanilla", "react", "svelte", "headless"],
    fixtures: fixtures.map((f) => f.id),
    wasmSha256: sha(files.get("hwpjs/hwpjs.wasm")),
    inputChecksums: inputs
      .map(({ sha256, bytes }) => ({ sha256, bytes }))
      .sort((a, b) => a.sha256.localeCompare(b.sha256)),
    verification: {
      staticURLPrefixes: ["/hwpjs/editor/", "/docs/editor/"],
      moduleSyntax: true,
      fixtureAllowlist: true,
      browserE2E: "separate",
    },
    files: [...files]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes) })),
  };
  // Public manifest intentionally omits local input paths, timestamps and private host names.
  files.set("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
  await mkdir(stage, { recursive: true });
  try {
    for (const [path, bytes] of files) {
      const dest = resolve(stage, safe(path));
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, bytes);
    }
    // Only replace this tool's previously generated tree; never remove arbitrary user files.
    try {
      const existing = JSON.parse(await readFile(resolve(output, "manifest.json"), "utf8"));
      if (existing.mode !== "frozen-dist-closure") throw Error("UnownedOutput");
      const allowed = new Set([...existing.files.map((f) => f.path), "manifest.json"]);
      async function check(dir) {
        for (const e of await readdir(dir, { withFileTypes: true })) {
          const p = resolve(dir, e.name);
          if (e.isDirectory()) await check(p);
          else if (!e.isFile() || !allowed.has(relative(output, p).split("\\").join("/")))
            throw Error("UnownedOutputFile");
        }
      }
      await check(output);
      await rm(output, { recursive: true });
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    await rename(stage, output);
  } catch (e) {
    await rm(stage, { recursive: true, force: true });
    throw e;
  }
  console.log(
    JSON.stringify({
      output,
      base,
      files: files.size,
      wasmSha256: manifest.wasmSha256,
      bytes: [...files.values()].reduce((n, b) => n + b.length, 0),
    }),
  );

  return { output };
}

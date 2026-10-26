import { execFileSync } from "node:child_process";
import { syncQualityConfigs } from "./sync-quality-config.mjs";
import { toolConfigs } from "./quality-policy.mjs";
import { readFileSync, chmodSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import {
  collectFiles,
  selectFiles,
  excludedPath,
  runQuality as rawRunQuality,
} from "./quality.mjs";
const runQuality = (options) => rawRunQuality({ filesystem: true, ...options });
function fixture() {
  mkdirSync(resolve("zig-out/verification/quality-runner-tests"), { recursive: true });
  const root = mkdtempSync(resolve("zig-out/verification/quality-runner-tests/safety-"));
  syncQualityConfigs(root);
  const put = (p) => {
    const f = resolve(root, p);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, "export const x = 1;\n");
  };
  return {
    root,
    put,
    close() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
test("모든 활성 root와 저작 build helper, Svelte/CSS/TSX/MJS를 포함", () => {
  const f = fixture();
  try {
    const names = [
      "apps/demo/src/a.ts",
      "packages/hwpjs/build/source-policy.mjs",
      "packages/svelte/src/a.svelte",
      "js/a.mjs",
      "web/preview/a.js",
      "tools/a.ts",
      "tests/a.test.ts",
      "src/a.ts",
      "config.mjs",
      "apps/demo/src/a.css",
    ];
    for (const p of names) f.put(p);
    assert.deepEqual(collectFiles(f.root, { filesystem: true }).files, names.sort());
  } finally {
    f.close();
  }
});
test("생성물/vendor/cache/legacy는 디렉터리 경계에서 제외", () => {
  const f = fixture();
  try {
    for (const p of [
      "apps/docs/docs/public/editor/a.js",
      "packages/core/dist/a.js",
      "js/vendor/a.js",
      "tools/.cache/a.js",
      "legacy/a.js",
      "tools/generated/a.js",
    ])
      f.put(p);
    assert.deepEqual(collectFiles(f.root, { filesystem: true }).files, []);
  } finally {
    f.close();
  }
});
test("보호 경로 정책은 존재여부나 확장자 선택보다 먼저 거부", () => {
  for (const p of [
    "tests/hwpx/title-column-roundtrip.test.mjs",
    "any/hwpers_test4_complex_table.hwp",
  ])
    assert.equal(excludedPath(p), "protected");
  const f = fixture();
  try {
    assert.throws(
      () =>
        selectFiles(f.root, ["tests/hwpx/title-column-roundtrip.test.mjs"], { filesystem: true }),
      /허용 경로/,
    );
  } finally {
    f.close();
  }
});
test("명시 외부 경로와 임의 CLI flag를 거부", () => {
  const f = fixture();
  try {
    f.put("tools/a.js");
    assert.throws(() => selectFiles(f.root, ["../outside.js"], { filesystem: true }), /허용 경로/);
    assert.throws(() => selectFiles(f.root, ["--no-ignore"], { filesystem: true }), /허용 경로/);
  } finally {
    f.close();
  }
});
test("파일·디렉터리 symlink를 따라 소스 목록을 확장하지 않음", () => {
  const f = fixture();
  try {
    f.put("tools/a.js");
    symlinkSync(resolve(f.root, "tools/a.js"), resolve(f.root, "tools/link.js"));
    symlinkSync(resolve(f.root, "tools"), resolve(f.root, "apps"));
    const i = collectFiles(f.root, { filesystem: true });
    assert.deepEqual(i.files, ["tools/a.js"]);
    assert.equal(i.excluded.filter((x) => x.reason === "symlink").length, 2);
  } finally {
    f.close();
  }
});
test("빈 소스에서 tool을 cwd 전체 스캔으로 실행하지 않음", () => {
  const f = fixture();
  try {
    assert.throws(() => runQuality({ root: f.root, mode: "lint" }), /비어 있습니다/);
  } finally {
    f.close();
  }
});

test("CSS 전용 lint를 빈 검사 성공으로 처리하지 않음", () => {
  const f = fixture();
  try {
    f.put("apps/demo/a.css");
    assert.throws(() => runQuality({ root: f.root, mode: "lint" }), /lint 대상 파일이 비어/);
  } finally {
    f.close();
  }
});

for (const name of [".oxlintrc.json", ".oxfmtrc.json"])
  test(name + " 추가 ignore 드리프트를 도구 실행 전에 거부", () => {
    const f = fixture();
    try {
      f.put("tools/a.js");
      const path = resolve(f.root, name),
        d = JSON.parse(readFileSync(path, "utf8"));
      d.ignorePatterns.push("tools/**");
      writeFileSync(path, JSON.stringify(d));
      assert.throws(
        () => runQuality({ root: f.root, mode: "lint", binDir: resolve(f.root, "missing-tool") }),
        /설정 드리프트/,
      );
    } finally {
      f.close();
    }
  });
test("canonical 파생 설정 재생성은 ignore 삭제 드리프트를 복구", () => {
  const f = fixture();
  try {
    f.put("tools/a.js");
    const path = resolve(f.root, ".oxfmtrc.json"),
      d = JSON.parse(readFileSync(path, "utf8"));
    d.ignorePatterns.shift();
    writeFileSync(path, JSON.stringify(d));
    assert.throws(
      () =>
        runQuality({ root: f.root, mode: "format:check", binDir: resolve(f.root, "missing-tool") }),
      /설정 드리프트/,
    );
    syncQualityConfigs(f.root);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), toolConfigs()[".oxfmtrc.json"]);
  } finally {
    f.close();
  }
});

test("두 tool argv는 root config와 nested 금지 플래그를 고정", () => {
  const f = fixture();
  try {
    f.put("tools/a.js");
    const bin = resolve(f.root, "node_modules/.bin");
    mkdirSync(bin, { recursive: true });
    for (const name of ["oxlint", "oxfmt"]) {
      const target = resolve(bin, name),
        output = resolve(f.root, name + "-argv.json");
      writeFileSync(
        target,
        "#!/usr/bin/env node\nrequire('node:fs').writeFileSync(" +
          JSON.stringify(output) +
          ",JSON.stringify(process.argv.slice(2)));\n",
      );
      chmodSync(target, 0o755);
    }
    assert.equal(runQuality({ root: f.root, mode: "check" }), 0);
    for (const name of ["oxlint", "oxfmt"]) {
      const args = JSON.parse(readFileSync(resolve(f.root, name + "-argv.json"), "utf8"));
      assert(args.includes("--disable-nested-config"));
      assert.equal(
        args[args.indexOf("--config") + 1],
        resolve(f.root, name === "oxlint" ? ".oxlintrc.json" : ".oxfmtrc.json"),
      );
      assert.deepEqual(args.slice(args.indexOf("--") + 1), ["tools/a.js"]);
    }
  } finally {
    f.close();
  }
});

function gitFixture() {
  const f = fixture();
  execFileSync("git", ["init", "--quiet", f.root]);
  return f;
}
test("기본 tracked/staged 게이트와 미추적 메타데이터를 분리", () => {
  const f = gitFixture();
  try {
    f.put("tools/tracked.js");
    f.put("tools/wip.js");
    execFileSync("git", ["-C", f.root, "add", "tools/tracked.js"]);
    const d = collectFiles(f.root);
    assert.deepEqual(d.files, ["tools/tracked.js"]);
    assert.deepEqual(d.untrackedOmitted, ["tools/wip.js"]);
  } finally {
    f.close();
  }
});
test("미추적 명시 검사 및 include-untracked는 staging 없이 가능", () => {
  const f = gitFixture();
  try {
    f.put("tools/wip.js");
    assert.deepEqual(selectFiles(f.root, ["tools/wip.js"]).files, ["tools/wip.js"]);
    assert.deepEqual(collectFiles(f.root, { includeUntracked: true }).files, ["tools/wip.js"]);
  } finally {
    f.close();
  }
});
test("새 파일 staging 이후 기본 게이트에 자동 포함", () => {
  const f = gitFixture();
  try {
    f.put("tools/new.js");
    assert.deepEqual(collectFiles(f.root).files, []);
    execFileSync("git", ["-C", f.root, "add", "tools/new.js"]);
    assert.deepEqual(collectFiles(f.root).files, ["tools/new.js"]);
  } finally {
    f.close();
  }
});
test("Git 없는 경계는 기본 실패하고 명시 FS 모드만 허용", () => {
  const f = fixture();
  try {
    f.put("tools/a.js");
    assert.throws(() => collectFiles(f.root), /--filesystem/);
    assert.deepEqual(collectFiles(f.root, { filesystem: true }).files, ["tools/a.js"]);
  } finally {
    f.close();
  }
});
test("미추적만 있어 기본 게이트가 비면 성공 처리하지 않음", () => {
  const f = gitFixture();
  try {
    f.put("tools/wip.js");
    assert.throws(() => rawRunQuality({ root: f.root, mode: "lint" }), /비어 있습니다/);
  } finally {
    f.close();
  }
});
for (const options of [{}, { includeUntracked: true }, { filesystem: true }])
  test("모든 범위 모드에서 보호 경로 명시 선택 거부: " + JSON.stringify(options), () => {
    const f = gitFixture();
    try {
      assert.throws(
        () => selectFiles(f.root, ["tests/hwpx/title-column-roundtrip.test.mjs"], options),
        /허용 경로/,
      );
      assert.throws(
        () => selectFiles(f.root, ["hwpers_test4_complex_table.hwp"], options),
        /허용 경로/,
      );
    } finally {
      f.close();
    }
  });

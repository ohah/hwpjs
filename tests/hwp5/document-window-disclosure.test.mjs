import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("document window controls collapse without concealing live display limits or duplicating command targets", () => {
  const html = readFileSync("web/preview/index.html", "utf8");
  const disclosure = html.match(
    /<details id="document-window-options"([^>]*)>([\s\S]*?)<\/details>/,
  );
  assert(disclosure);
  assert.doesNotMatch(disclosure[1], /\bopen\b/);
  const summary = disclosure[2].match(/<summary>([\s\S]*?)<\/summary>/)?.[1];
  assert(summary?.includes('id="document-window-status" aria-live="polite"'));
  const form = disclosure[2].match(/<form id="document-window-form"[^>]*>([\s\S]*?)<\/form>/)?.[1];
  assert(form);
  assert(!form.includes('id="document-window-status"'));
  for (const id of [
    "document-window-start",
    "document-window-count",
    "document-window-apply",
    "document-window-restore",
  ]) {
    assert(form.includes(`id="${id}"`));
    assert(!summary.includes(`id="${id}"`));
  }
  for (const id of [
    "document-window-options",
    "document-window-status",
    "document-window-form",
    "document-window-start",
    "document-window-count",
    "document-window-apply",
    "document-window-restore",
  ])
    assert.equal(html.match(new RegExp(`id="${id}"`, "g"))?.length, 1);
  for (const id of ["canvas", "find-form", "enable-edit", "download", "allow-stale-layout"])
    assert(!disclosure[2].includes(`id="${id}"`));
});

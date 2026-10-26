import test from "node:test";
import assert from "node:assert/strict";
import { captureBrowserNetworkWitness } from "../../tools/browser/network-witness.mjs";

test("browser network witness retains failed startup state without exposing URL credentials or query", () => {
  const commands = [];
  const result = captureBrowserNetworkWitness(
    {
      evaluate: () => ({ status: "load refused", fileDisabled: true }),
      command(...args) {
        commands.push(args);
        if (args[1] === "requests")
          return {
            requests: [
              {
                url: "https://user:secret@example.test/module.mjs?token=hidden#fragment",
                resourceType: "Script",
              },
              {
                url: "https://example.test/missing.mjs?q=hidden",
                status: 404,
                resourceType: "Script",
              },
              { url: "https://example.test/ready.mjs", status: 200, resourceType: "Script" },
            ],
          };
        return {};
      },
    },
    "/tmp/network.har",
  );
  assert.deepEqual(result, {
    harPath: "/tmp/network.har",
    page: { status: "load refused", fileDisabled: true },
    requestCount: 3,
    unfinishedScripts: ["https://example.test/module.mjs"],
    httpFailures: [{ url: "https://example.test/missing.mjs", status: 404 }],
    harSaved: true,
  });
  assert.deepEqual(commands, [
    ["network", "requests"],
    ["network", "har", "stop", "/tmp/network.har"],
  ]);
});

test("each missing browser diagnostic remains independent and never replaces the caller failure", () => {
  for (const failed of ["page", "network", "har"]) {
    const result = captureBrowserNetworkWitness(
      {
        evaluate() {
          if (failed === "page") throw Error("gone");
          return {};
        },
        command(...args) {
          if (
            (failed === "network" && args[1] === "requests") ||
            (failed === "har" && args[1] === "har")
          )
            throw Error("gone");
          return { requests: [] };
        },
      },
      "/tmp/network.har",
    );
    assert.equal(result.pageUnavailable === true, failed === "page");
    assert.equal(result.networkUnavailable === true, failed === "network");
    assert.equal(result.harSaved, failed !== "har");
  }
});
